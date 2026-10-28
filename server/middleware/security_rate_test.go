package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/internal/httpx"
)

func TestRequireSessionOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequireSessionOrigin([]string{"http://localhost:3000"}))
	r.POST("/api/staff/posts", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := func(origin, referer string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/staff/posts", nil)
		req.AddCookie(&http.Cookie{Name: "access_token", Value: "session"})
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if referer != "" {
			req.Header.Set("Referer", referer)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	bad := request("https://attacker.example", "")
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(bad.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if bad.Code != http.StatusForbidden || envelope.Error.Code != "forbidden" {
		t.Fatalf("cross-site status=%d envelope=%+v", bad.Code, envelope)
	}
	if got := request("http://localhost:3000", "").Code; got != http.StatusNoContent {
		t.Fatalf("same-origin status=%d", got)
	}
	if got := request("", "http://localhost:3000/dashboard").Code; got != http.StatusNoContent {
		t.Fatalf("same-origin Referer status=%d", got)
	}
	if got := request("", "").Code; got != http.StatusForbidden {
		t.Fatalf("missing origin status=%d", got)
	}
}

func TestLoginLimiterUsesIPAndLowercaseEmailAndRestoresBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := NewMemoryLimiter(20)
	r := gin.New()
	r.POST("/login", LimitLoginRequests(limiter, 1, time.Minute), func(c *gin.Context) {
		var body map[string]string
		if err := c.ShouldBindJSON(&body); err != nil {
			t.Errorf("body was not restored: %v", err)
			c.Status(400)
			return
		}
		c.String(http.StatusOK, body["email"])
	})
	request := func(email string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"email":`+`"`+email+`"}`))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	if got := request("Person@example.org"); got.Code != http.StatusOK {
		t.Fatalf("first status=%d", got.Code)
	}
	limited := request("person@EXAMPLE.org")
	if limited.Code != http.StatusTooManyRequests || limited.Header().Get("Retry-After") == "" {
		t.Fatalf("same normalized email status=%d retry-after=%q", limited.Code, limited.Header().Get("Retry-After"))
	}
	if got := request("other@example.org"); got.Code != http.StatusOK {
		t.Fatalf("separate email status=%d", got.Code)
	}
}

func TestClientIPUsesTrustedProxyChainAndIgnoresUntrustedSpoof(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := NewMemoryLimiter(20)
	r := gin.New()
	if err := r.SetTrustedProxies([]string{"10.0.0.0/8"}); err != nil {
		t.Fatal(err)
	}
	r.GET("/", httpx.TrustedForwardedClientIP("platform-secret"), LimitRequestsWithLimiter(limiter, 1, time.Minute, func(c *gin.Context) string { return httpx.ClientIP(c) }), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := func(peer, forwarded string) int {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = peer + ":1234"
		if forwarded != "" {
			req.Header.Set("X-Forwarded-For", forwarded)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if got := request("10.1.2.3", "198.51.100.1"); got != 204 {
		t.Fatalf("first trusted IP status=%d", got)
	}
	if got := request("10.1.2.3", "198.51.100.2, 203.0.113.77"); got != 204 {
		t.Fatalf("trusted chain first status=%d", got)
	}
	if got := request("10.1.2.3", "192.0.2.2, 203.0.113.77"); got != 429 {
		t.Fatalf("rightmost non-trusted address was not selected, status=%d", got)
	}
	if got := request("10.1.2.3", "203.0.113.2"); got != 204 {
		t.Fatalf("second forwarded IP status=%d", got)
	}
	if got := request("192.0.2.10", "198.51.100.9"); got != 204 {
		t.Fatalf("untrusted peer first status=%d", got)
	}
	if got := request("192.0.2.10", "203.0.113.8"); got != 429 {
		t.Fatalf("untrusted XFF spoof was trusted, status=%d", got)
	}
}

func TestLoginLimiterSeparatesAuthenticatedForwardedClientIPs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := NewMemoryLimiter(20)
	r := gin.New()
	if err := r.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	r.Use(httpx.TrustedForwardedClientIP("platform-secret"))
	r.POST("/login", LimitLoginRequests(limiter, 1, time.Minute), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"email":"same@example.org"}`))
		req.RemoteAddr = "203.0.113.8:1234"
		req.Header.Set("X-Platform-Client-IP", ip)
		req.Header.Set("X-Platform-Forwarder-Token", "platform-secret")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if got := request("198.51.100.1"); got != http.StatusNoContent {
		t.Fatalf("first client status=%d", got)
	}
	if got := request("198.51.100.1"); got != http.StatusTooManyRequests {
		t.Fatalf("same client was not rate limited: %d", got)
	}
	if got := request("198.51.100.2"); got != http.StatusNoContent {
		t.Fatalf("separate client IP status=%d", got)
	}
}

func TestMemoryLimiterEvictsExpiredEntriesAndCapsSize(t *testing.T) {
	limiter := NewMemoryLimiter(1)
	now := time.Now()
	limiter.now = func() time.Time { return now }
	if allowed, _ := limiter.Allow("first", 1, time.Minute); !allowed {
		t.Fatal("first key rejected")
	}
	if allowed, _ := limiter.Allow("second", 1, time.Minute); allowed {
		t.Fatal("capacity should reject a new key")
	}
	now = now.Add(time.Minute)
	if allowed, _ := limiter.Allow("second", 1, time.Minute); !allowed {
		t.Fatal("expired entry was not evicted")
	}
	if len(limiter.entries) != 1 {
		t.Fatalf("entries=%d want=1", len(limiter.entries))
	}
}
func TestMemoryLimiterSweepsExpiredEntriesAtMostEveryThirtySeconds(t *testing.T) {
	limiter := NewMemoryLimiter(2)
	now := time.Now()
	limiter.now = func() time.Time { return now }
	if allowed, _ := limiter.Allow("expired", 1, time.Minute); !allowed {
		t.Fatal("initial key rejected")
	}
	now = now.Add(29 * time.Second)
	if allowed, _ := limiter.Allow("active", 1, time.Minute); !allowed {
		t.Fatal("active key rejected")
	}
	now = now.Add(32 * time.Second)
	if allowed, _ := limiter.Allow("replacement", 1, time.Minute); !allowed {
		t.Fatal("expired entry was not swept")
	}
	if _, exists := limiter.entries["expired"]; exists {
		t.Fatal("expired entry remains after sweep")
	}
	if allowed, _ := limiter.Allow("over-capacity", 1, time.Minute); allowed {
		t.Fatal("capacity was not enforced after sweeping")
	}
	if len(limiter.entries) != 2 {
		t.Fatalf("entries=%d want=2", len(limiter.entries))
	}
}
