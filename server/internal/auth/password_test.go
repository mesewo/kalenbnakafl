package auth

import (
	"errors"
	"strings"
	"testing"
)

func TestValidatePasswordPolicy(t *testing.T) {
	tests := []struct {
		name, password, email, userName string
		want                            error
	}{
		{name: "valid", password: "Cedar!Window-482", email: "person@example.org", userName: "Person Example"},
		{name: "minimum characters", password: "abcdefghijkl"},
		{name: "exact bcrypt byte limit", password: strings.Repeat("é", 36)},
		{name: "too short", password: "short-pass", want: ErrPasswordTooShort},
		{name: "bcrypt byte limit", password: strings.Repeat("é", 37), want: ErrPasswordTooLong},
		{name: "common", password: "Password1234", want: ErrPasswordCommon},
		{name: "email", password: "person@example.org!", email: "person@example.org", want: ErrPasswordIdentity},
		{name: "email local part", password: "person-strong-password", email: "person@example.org", want: ErrPasswordIdentity},
		{name: "name", password: "alice!strong-password", userName: "Alice Example", want: ErrPasswordIdentity},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			err := ValidatePassword(testCase.password, testCase.email, testCase.userName)
			if !errors.Is(err, testCase.want) {
				t.Fatalf("ValidatePassword() error = %v, want %v", err, testCase.want)
			}
		})
	}
}
