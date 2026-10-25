package i18n

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestLocalePrecedenceAndInvalidValues(t *testing.T) {
	cases := []struct {
		name, target, accept, cookie, want string
		includeCookie                      bool
		invalid                            bool
	}{
		{name: "explicit query wins", target: "/posts?lang=en", accept: "am", want: "en"},
		{name: "header selected when query absent", target: "/posts", accept: "am-ET, en;q=0.8", want: "am"},
		{name: "cookie used for message locale", target: "/posts", accept: "fr", cookie: "am", want: "am", includeCookie: true},
		{name: "invalid query reported", target: "/posts?lang=fr", accept: "am", want: "am", invalid: true},
		{name: "empty query invalid", target: "/posts?lang=", want: "en", invalid: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", tc.target, nil)
			r.Header.Set("Accept-Language", tc.accept)
			if tc.cookie != "" {
				r.AddCookie(&http.Cookie{Name: "lang", Value: tc.cookie})
			}
			got, invalid := RequestLocale(r, tc.includeCookie)
			if got != tc.want || invalid != tc.invalid {
				t.Fatalf("RequestLocale()=(%q,%v), want (%q,%v)", got, invalid, tc.want, tc.invalid)
			}
		})
	}
}

func TestAmharicCatalogContainsLocalizedMessages(t *testing.T) {
	for _, key := range []string{
		"common.locale_invalid",
		"contact.name_valid_email_and_a_message_are_required",
		"contact.status_must_be_read_or_replied",
		"posts.translations_are_required_and_must_be_valid",
	} {
		value := Text("am", key)
		if value == key || value == Text("en", key) {
			t.Errorf("Amharic message %q is missing or falls back to English", key)
		}
		foundEthiopic := false
		for _, char := range value {
			if char >= 0x1200 && char <= 0x137F {
				foundEthiopic = true
				break
			}
		}
		if !foundEthiopic {
			t.Errorf("Amharic message %q has no Ethiopic characters: %q", key, value)
		}
	}
}
