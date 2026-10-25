package i18n

import (
	"net/http"
	"strings"
)

const DefaultLocale = "en"

func Supported(locale string) bool {
	return locale == "en" || locale == "am"
}

// RequestLocale applies query, optional cookie, then Accept-Language precedence.
// It returns invalidQuery when an explicit ?lang value is unsupported.
func RequestLocale(r *http.Request, includeCookie bool) (locale string, invalidQuery bool) {
	if value, present := r.URL.Query()["lang"]; present {
		if len(value) > 0 && Supported(value[0]) {
			return value[0], false
		}
		return acceptLocale(r.Header.Get("Accept-Language")), true
	}
	if includeCookie {
		if cookie, err := r.Cookie("lang"); err == nil && Supported(cookie.Value) {
			return cookie.Value, false
		}
	}
	return acceptLocale(r.Header.Get("Accept-Language")), false
}

func acceptLocale(header string) string {
	for _, part := range strings.Split(header, ",") {
		fields := strings.Split(strings.TrimSpace(part), ";")
		if len(fields) > 1 && strings.TrimSpace(fields[1]) == "q=0" {
			continue
		}
		tag := strings.ToLower(strings.TrimSpace(fields[0]))
		if tag == "am" || strings.HasPrefix(tag, "am-") {
			return "am"
		}
		if tag == "en" || strings.HasPrefix(tag, "en-") {
			return "en"
		}
	}
	return DefaultLocale
}

func Text(locale, key string) string {
	if value, ok := catalog(locale)[key]; ok {
		return value
	}
	if value, ok := catalog(DefaultLocale)[key]; ok {
		return value
	}
	return key
}

func catalog(locale string) map[string]string {
	if locale == "am" {
		return catalogAm
	}
	return catalogEn
}
