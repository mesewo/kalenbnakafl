package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"net"
	"syscall"
	"testing"
	"time"
)

type testConnector struct {
	connectCalls  int
	failures      int
	pingFailures  int
	queryFailures int
	queryCalls    int
}

func (c *testConnector) Connect(context.Context) (driver.Conn, error) {
	c.connectCalls++
	if c.connectCalls <= c.failures {
		return nil, &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	}
	return &testConn{connector: c}, nil
}

func (c *testConnector) Driver() driver.Driver { return testDriver{} }

type testDriver struct{}

func (testDriver) Open(string) (driver.Conn, error) { return nil, errors.New("use connector") }

type testConn struct {
	connector *testConnector
}

func (*testConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (*testConn) Close() error                        { return nil }
func (*testConn) Begin() (driver.Tx, error)           { return nil, errors.New("not implemented") }

func (c *testConn) Ping(context.Context) error {
	if c.connector.pingFailures > 0 {
		c.connector.pingFailures--
		return &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	}
	return nil
}

func (c *testConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	c.connector.queryCalls++
	if c.connector.queryFailures > 0 {
		c.connector.queryFailures--
		return nil, &net.OpError{Op: "read", Net: "tcp", Err: syscall.ECONNRESET}
	}
	return &testRows{}, nil
}

type testRows struct{}

func (*testRows) Columns() []string         { return []string{"value"} }
func (*testRows) Close() error              { return nil }
func (*testRows) Next([]driver.Value) error { return io.EOF }

func TestRetryConnectorRetriesTransientConnections(t *testing.T) {
	base := &testConnector{failures: 2}
	connector := retryConnector{base: base, attempts: 3, initialBackoff: time.Millisecond, maxBackoff: 2 * time.Millisecond}
	connection, err := connector.Connect(context.Background())
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := connection.Close(); err != nil {
		t.Fatalf("close connection: %v", err)
	}
	if base.connectCalls != 3 {
		t.Fatalf("connect calls=%d, want 3", base.connectCalls)
	}
}

func TestRetryConnectorDoesNotRetryNonConnectionErrors(t *testing.T) {
	base := &failingConnector{err: errors.New("invalid database credentials")}
	connector := retryConnector{base: base, attempts: 4, initialBackoff: time.Millisecond, maxBackoff: time.Millisecond}
	if _, err := connector.Connect(context.Background()); err == nil {
		t.Fatal("expected connector error")
	}
	if base.calls != 1 {
		t.Fatalf("connect calls=%d, want 1", base.calls)
	}
}

type failingConnector struct {
	err   error
	calls int
}

func (c *failingConnector) Connect(context.Context) (driver.Conn, error) {
	c.calls++
	return nil, c.err
}
func (*failingConnector) Driver() driver.Driver { return testDriver{} }

func TestPingRetriesTransientNeonWakeup(t *testing.T) {
	base := &testConnector{pingFailures: 2}
	db := sql.OpenDB(base)
	defer func() {
		if err := db.Close(); err != nil {
			t.Errorf("close database: %v", err)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := Ping(ctx, db); err != nil {
		t.Fatalf("Ping after transient errors: %v", err)
	}
	if base.connectCalls != 1 || base.pingFailures != 0 {
		t.Fatalf("connections=%d remaining ping failures=%d", base.connectCalls, base.pingFailures)
	}
}

func TestPingReturnsErrorAfterRetries(t *testing.T) {
	base := &testConnector{pingFailures: 10}
	db := sql.OpenDB(base)
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := Ping(ctx, db); err == nil {
		t.Fatal("expected ping failure after retry limit")
	}
}

func TestRetryConnRetriesTransientSelectAfterNeonWakeup(t *testing.T) {
	base := &testConnector{queryFailures: 1}
	db := sql.OpenDB(&retryConnector{
		base: base, attempts: 2, initialBackoff: time.Millisecond, maxBackoff: 2 * time.Millisecond,
	})
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, "SELECT 1")
	if err != nil {
		t.Fatalf("query after transient connection failure: %v", err)
	}
	if err := rows.Close(); err != nil {
		t.Fatalf("close rows: %v", err)
	}
	if base.connectCalls != 2 || base.queryFailures != 0 {
		t.Fatalf("connections=%d query failures=%d", base.connectCalls, base.queryFailures)
	}
}

func TestRetryConnDoesNotRetryNonReadQueries(t *testing.T) {
	base := &testConnector{queryFailures: 1}
	db := sql.OpenDB(&retryConnector{base: base, attempts: 2, initialBackoff: time.Millisecond, maxBackoff: time.Millisecond})
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := db.QueryContext(ctx, "INSERT INTO users (email) VALUES ('demo@example.org')"); err == nil {
		t.Fatal("expected write error")
	}
	if base.connectCalls != 1 || base.queryCalls != 1 {
		t.Fatalf("write unexpectedly retried: connections=%d query calls=%d", base.connectCalls, base.queryCalls)
	}
}

func TestShouldRetryReadOnlyForSimpleSelects(t *testing.T) {
	connectionErr := &net.OpError{Op: "read", Net: "tcp", Err: syscall.ECONNRESET}
	tests := []struct {
		name  string
		query string
		want  bool
	}{
		{name: "plain parameterized select", query: "SELECT id FROM users WHERE id = $1 LIMIT 1", want: true},
		{name: "function call", query: "SELECT nextval('user_id_seq')", want: false},
		{name: "advisory lock", query: "SELECT pg_advisory_lock(1)", want: false},
		{name: "row lock", query: "SELECT id FROM users FOR UPDATE", want: false},
		{name: "select into", query: "SELECT id INTO temp_users FROM users", want: false},
		{name: "multiple statements", query: "SELECT 1; SELECT 2", want: false},
		{name: "commented statement", query: "SELECT 1 -- retry safety is ambiguous", want: false},
		{name: "select prefix is not a keyword", query: "SELECTOR 1", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := shouldRetryRead(test.query, false, connectionErr); got != test.want {
				t.Fatalf("shouldRetryRead(%q)=%t, want %t", test.query, got, test.want)
			}
		})
	}
}

func TestRetryConnDoesNotRetryAdvisoryLockSelect(t *testing.T) {
	base := &testConnector{queryFailures: 1}
	db := sql.OpenDB(&retryConnector{base: base, attempts: 2, initialBackoff: time.Millisecond, maxBackoff: time.Millisecond})
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := db.QueryContext(ctx, "SELECT pg_advisory_lock(1)"); err == nil {
		t.Fatal("expected transient query error")
	}
	if base.connectCalls != 1 || base.queryCalls != 1 {
		t.Fatalf("advisory lock query unexpectedly retried: connections=%d query calls=%d", base.connectCalls, base.queryCalls)
	}
}
