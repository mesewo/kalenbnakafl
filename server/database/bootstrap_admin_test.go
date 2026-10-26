package database

import (
	"context"
	"strings"
	"testing"

	"kalenbnakafl/internal/config"
)

func TestBootstrapAdminRejectsPasswordsOutsidePolicyBeforeDatabaseAccess(t *testing.T) {
	tests := []struct {
		name, email, password, want string
	}{
		{name: "common", email: "admin@example.org", password: "Password1234", want: "too common"},
		{name: "identity", email: "owner@example.org", password: "owner-strong-password", want: "name or email"},
		{name: "over bcrypt limit", email: "admin@example.org", password: strings.Repeat("a", 73), want: "72 bytes"},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			err := BootstrapAdmin(context.Background(), nil, config.Config{AdminEmail: testCase.email, AdminPassword: testCase.password})
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("BootstrapAdmin() error = %v, want text %q", err, testCase.want)
			}
		})
	}
}
