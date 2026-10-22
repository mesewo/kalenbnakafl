package httpx

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestErrorEnvelopeCodes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		status int
		code   string
	}{{400, "validation_failed"}, {401, "unauthorized"}, {403, "forbidden"}, {404, "not_found"}, {409, "conflict"}, {429, "rate_limited"}, {413, "payload_too_large"}, {500, "internal"}}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			r := gin.New()
			r.GET("/", func(c *gin.Context) { Fail(c, tt.status, "visible message") })
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
			var got Envelope
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if w.Code != tt.status || got.Error.Code != tt.code || got.Error.Message == "" || got.Error.Details == nil {
				t.Fatalf("status=%d envelope=%+v", w.Code, got)
			}
		})
	}
}

func TestInvalidJSONCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/", func(c *gin.Context) {
		var body map[string]any
		if !BindJSON(c, &body) {
			Fail(c, 400, "invalid")
			return
		}
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{")))
	var got Envelope
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Error.Code != "invalid_json" {
		t.Fatalf("code=%q", got.Error.Code)
	}
}

func TestRequestBodyLimitReturns413(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID(), AccessLog(), Recovery(), BodyLimit(16, 128))
	r.POST("/", func(c *gin.Context) {
		var body map[string]any
		if !BindJSON(c, &body) {
			Fail(c, 400, "invalid")
			return
		}
		c.Status(204)
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"value":"`+strings.Repeat("x", 40)+`"}`)))
	var got Envelope
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if w.Code != 413 || got.Error.Code != "payload_too_large" {
		t.Fatalf("status=%d envelope=%+v", w.Code, got.Error)
	}
}

func TestRequestIDValidationAndEcho(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID())
	r.GET("/", func(c *gin.Context) { c.Status(204) })
	for _, tc := range []struct {
		input string
		valid bool
	}{{"request-1234", true}, {"bad id", false}, {strings.Repeat("a", 65), false}} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Request-ID", tc.input)
		r.ServeHTTP(w, req)
		got := w.Header().Get("X-Request-ID")
		if tc.valid && got != tc.input {
			t.Fatalf("valid ID changed: %q", got)
		}
		if !tc.valid && !regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`).MatchString(got) {
			t.Fatalf("generated invalid ID %q", got)
		}
	}
}

func TestRecoveryAndLogsDoNotExposeSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var output bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })
	r := gin.New()
	r.Use(RequestID(), AccessLog(), Recovery())
	r.POST("/panic", func(c *gin.Context) { panic("password-value token-value") })
	const secret = "password-value token-value cookie-value bearer-value"
	req := httptest.NewRequest(http.MethodPost, "/panic", strings.NewReader(secret))
	req.Header.Set("Authorization", "Bearer bearer-value")
	req.Header.Set("Cookie", "session=cookie-value")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var got Envelope
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if w.Code != 500 || got.Error.Code != "internal" {
		t.Fatalf("status=%d envelope=%+v", w.Code, got.Error)
	}
	if w.Header().Get("X-Request-ID") == "" {
		t.Fatal("missing request ID response header")
	}
	if strings.Contains(output.String(), "password-value") || strings.Contains(output.String(), "token-value") || strings.Contains(output.String(), "cookie-value") || strings.Contains(output.String(), "bearer-value") {
		t.Fatalf("log contains sensitive request data: %s", output.String())
	}
}
