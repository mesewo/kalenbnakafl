package database

import (
	"context"
	"log/slog"
	"time"

	"kalenbnakafl/dbgen"
)

type expiredRefreshTokenDeleter interface {
	DeleteExpiredRefreshTokens(context.Context) (int64, error)
}

// RunRefreshTokenCleanup periodically removes refresh tokens that can no longer be used.
func RunRefreshTokenCleanup(ctx context.Context, q *dbgen.Queries, interval time.Duration) {
	runRefreshTokenCleanup(ctx, q, interval)
}

func runRefreshTokenCleanup(ctx context.Context, deleter expiredRefreshTokenDeleter, interval time.Duration) {
	if interval <= 0 {
		interval = time.Hour
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := deleter.DeleteExpiredRefreshTokens(ctx); err != nil && ctx.Err() == nil {
				slog.Error("expired refresh token cleanup failed", "error_type", "database")
			}
		}
	}
}
