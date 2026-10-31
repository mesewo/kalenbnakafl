package revalidation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

const requestTimeout = 2 * time.Second
const maxAttempts = 3

type Client struct {
	url    string
	secret string
	client *http.Client
	logger *slog.Logger
}

func New(url, secret string, logger *slog.Logger) *Client {
	if logger == nil {
		logger = slog.Default()
	}
	return &Client{
		url:    url,
		secret: secret,
		client: &http.Client{Timeout: requestTimeout},
		logger: logger,
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.url != "" && c.secret != ""
}

func (c *Client) Notify(tags ...string) {
	if !c.Enabled() || len(tags) == 0 {
		return
	}
	tagCopy := append([]string(nil), tags...)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		if err := c.NotifyNow(ctx, tagCopy...); err != nil {
			c.logger.Error("frontend cache revalidation failed", "tags", tagCopy, "error", err)
		}
	}()
}

func (c *Client) NotifyNow(ctx context.Context, tags ...string) error {
	if !c.Enabled() || len(tags) == 0 {
		return nil
	}
	payload, err := json.Marshal(struct {
		Tags []string `json:"tags"`
	}{Tags: tags})
	if err != nil {
		return fmt.Errorf("encode revalidation request: %w", err)
	}
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		request, requestErr := http.NewRequestWithContext(
			ctx,
			http.MethodPost,
			c.url,
			bytes.NewReader(payload),
		)
		if requestErr != nil {
			return fmt.Errorf("create revalidation request: %w", requestErr)
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Revalidate-Secret", c.secret)
		response, requestErr := c.client.Do(request)
		if requestErr == nil {
			if _, err := io.Copy(io.Discard, response.Body); err != nil {
				c.logger.Warn("read frontend revalidation response", "error_type", fmt.Sprintf("%T", err))
			}
			if err := response.Body.Close(); err != nil {
				c.logger.Warn("close frontend revalidation response", "error_type", fmt.Sprintf("%T", err))
			}
			if response.StatusCode >= 200 && response.StatusCode < 300 {
				return nil
			}
			lastErr = fmt.Errorf("frontend revalidation returned HTTP %d", response.StatusCode)
		} else {
			lastErr = fmt.Errorf("send frontend revalidation request: %w", requestErr)
		}
		if attempt == maxAttempts {
			break
		}
		timer := time.NewTimer(time.Duration(attempt) * 100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return fmt.Errorf("frontend revalidation context ended: %w", ctx.Err())
		case <-timer.C:
		}
	}
	return lastErr
}
