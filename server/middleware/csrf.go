package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"kalenbnakafl/internal/httpx"

	"github.com/gin-gonic/gin"
)

var originExemptPaths = map[string]struct{}{
	"/api/login": {}, "/api/register": {}, "/api/contact": {},
}

// RequireSessionOrigin protects state-changing cookie-authenticated requests.
// Login, registration, and contact submission do not read or mutate a session.
func RequireSessionOrigin(origins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		if normalized, ok := normalizeOrigin(origin); ok {
			allowed[normalized] = struct{}{}
		}
	}
	return func(c *gin.Context) {
		if !stateChanging(c.Request.Method) {
			c.Next()
			return
		}
		if _, exempt := originExemptPaths[c.Request.URL.Path]; exempt || !hasSessionCookie(c.Request) {
			c.Next()
			return
		}
		value := c.GetHeader("Origin")
		if value == "" {
			if referer, err := url.Parse(c.GetHeader("Referer")); err == nil {
				value = referer.Scheme + "://" + referer.Host
			}
		}
		normalized, ok := normalizeOrigin(value)
		if !ok {
			httpx.Fail(c, http.StatusForbidden, "Request origin is not allowed")
			c.Abort()
			return
		}
		if _, ok := allowed[normalized]; !ok {
			httpx.Fail(c, http.StatusForbidden, "Request origin is not allowed")
			c.Abort()
			return
		}
		c.Next()
	}
}

func hasSessionCookie(r *http.Request) bool {
	for _, cookie := range r.Cookies() {
		if (cookie.Name == "access_token" || cookie.Name == "refresh_token") && cookie.Value != "" {
			return true
		}
	}
	return false
}

func stateChanging(method string) bool {
	return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch || method == http.MethodDelete
}

func normalizeOrigin(value string) (string, bool) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", false
	}
	return strings.ToLower(parsed.Scheme + "://" + parsed.Host), true
}
