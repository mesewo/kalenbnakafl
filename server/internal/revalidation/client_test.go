package revalidation

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestNotifyNowSendsAuthenticatedTags(t *testing.T) {
	const secret = "revalidation-secret-for-unit-test"
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Errorf("method = %q; want POST", request.Method)
		}
		if got := request.Header.Get("X-Revalidate-Secret"); got != secret {
			t.Errorf("secret header = %q; want configured secret", got)
		}
		var payload struct {
			Tags []string `json:"tags"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Errorf("decode JSON request: %v", err)
		}
		if len(payload.Tags) != 2 || payload.Tags[0] != "posts" || payload.Tags[1] != "media" {
			t.Errorf("tags = %v; want [posts media]", payload.Tags)
		}
		writer.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	client := New(server.URL, secret, slog.New(slog.NewTextHandler(&strings.Builder{}, nil)))
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := client.NotifyNow(ctx, "posts", "media"); err != nil {
		t.Fatalf("NotifyNow: %v", err)
	}
}

func TestNotifyNowRetriesAndReturnsLastError(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		writer.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := New(server.URL, "test-secret", nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	err := client.NotifyNow(ctx, "events")
	if err == nil || !strings.Contains(err.Error(), "HTTP 503") {
		t.Fatalf("NotifyNow error = %v; want HTTP 503 failure", err)
	}
	if got := requests.Load(); got != maxAttempts {
		t.Fatalf("request count = %d; want %d", got, maxAttempts)
	}
}

func TestNotifyDoesNotBlockWriteCaller(t *testing.T) {
	release := make(chan struct{})
	started := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		started <- struct{}{}
		<-release
		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := New(server.URL, "test-secret", nil)
	start := time.Now()
	client.Notify("posts")
	if time.Since(start) > 100*time.Millisecond {
		t.Fatal("Notify blocked caller")
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("background notification did not start")
	}
	close(release)
}
