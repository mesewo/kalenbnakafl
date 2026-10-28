package database

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

type cleanupCounter struct{ calls atomic.Int32 }

func (c *cleanupCounter) DeleteExpiredRefreshTokens(context.Context) (int64, error) {
	c.calls.Add(1)
	return 0, nil
}

func TestRefreshTokenCleanupRunsOnTimerAndStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cleaner := &cleanupCounter{}
	done := make(chan struct{})
	go func() {
		defer close(done)
		runRefreshTokenCleanup(ctx, cleaner, time.Millisecond)
	}()
	deadline := time.After(time.Second)
	for cleaner.calls.Load() == 0 {
		select {
		case <-deadline:
			t.Fatal("cleanup did not run on the timer")
		default:
			time.Sleep(time.Millisecond)
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cleanup did not stop after context cancellation")
	}
}
