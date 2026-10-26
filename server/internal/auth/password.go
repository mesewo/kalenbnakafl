package auth

import (
	"errors"
	"strings"
	"unicode/utf8"
)

const (
	PasswordMinCharacters = 12
	PasswordMaxBytes      = 72
)

var ErrPasswordTooShort = errors.New("auth.password_too_short")
var ErrPasswordTooLong = errors.New("auth.password_too_long")
var ErrPasswordCommon = errors.New("auth.password_too_common")
var ErrPasswordIdentity = errors.New("auth.password_contains_identity")

var commonPasswords = map[string]struct{}{
	"password1234":   {},
	"123456789012":   {},
	"qwertyuiop12":   {},
	"letmeinletmein": {},
	"admin12345678":  {},
	"changeme1234":   {},
}

// ValidatePassword applies the same bcrypt-compatible policy to every password entry point.
func ValidatePassword(password, email, name string) error {
	if utf8.RuneCountInString(password) < PasswordMinCharacters {
		return ErrPasswordTooShort
	}
	if len([]byte(password)) > PasswordMaxBytes {
		return ErrPasswordTooLong
	}
	normalized := strings.ToLower(strings.TrimSpace(password))
	if _, common := commonPasswords[normalized]; common {
		return ErrPasswordCommon
	}
	identities := append(strings.Fields(strings.ToLower(name)), strings.ToLower(strings.TrimSpace(email)))
	if at := strings.IndexByte(email, '@'); at > 0 {
		identities = append(identities, strings.ToLower(email[:at]))
	}
	for _, identity := range identities {
		identity = strings.TrimSpace(identity)
		if len([]rune(identity)) >= 3 && strings.Contains(normalized, identity) {
			return ErrPasswordIdentity
		}
	}
	return nil
}
