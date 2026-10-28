package main

import (
	"bytes"
	"image/png"
	"testing"
)

func TestDemoAccountsFromEnvironment(t *testing.T) {
	values := map[string]string{
		"DEMO_EDITOR_EMAIL":       "EDITOR@example.org",
		"DEMO_EDITOR_PASSWORD":    "Saffron!River-Morning-2026",
		"DEMO_VOLUNTEER_EMAIL":    "volunteer@example.org",
		"DEMO_VOLUNTEER_PASSWORD": "Cedar!Mountain-Lantern-2026",
	}
	accounts, err := demoAccountsFromEnvironment(func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	if accounts[0].role != "editor" || accounts[1].role != "volunteer" {
		t.Fatalf("unexpected demo roles: %q, %q", accounts[0].role, accounts[1].role)
	}
	if accounts[0].email != "editor@example.org" {
		t.Fatalf("email was not normalized: %q", accounts[0].email)
	}
	for _, account := range accounts {
		if account.role == "admin" {
			t.Fatal("demo seed must not create an admin account")
		}
	}
}

func TestDemoAccountsRejectDuplicateEmailsAndWeakPasswords(t *testing.T) {
	tests := []struct {
		name   string
		values map[string]string
	}{
		{
			name: "duplicate emails",
			values: map[string]string{
				"DEMO_EDITOR_EMAIL":       "same@example.org",
				"DEMO_EDITOR_PASSWORD":    "Saffron!River-Morning-2026",
				"DEMO_VOLUNTEER_EMAIL":    "SAME@example.org",
				"DEMO_VOLUNTEER_PASSWORD": "Cedar!Mountain-Lantern-2026",
			},
		},
		{
			name: "weak password",
			values: map[string]string{
				"DEMO_EDITOR_EMAIL":       "editor@example.org",
				"DEMO_EDITOR_PASSWORD":    "weak",
				"DEMO_VOLUNTEER_EMAIL":    "volunteer@example.org",
				"DEMO_VOLUNTEER_PASSWORD": "volunteer-demo-passphrase-2026",
			},
		},
		{
			name: "missing credentials",
			values: map[string]string{
				"DEMO_EDITOR_EMAIL":    "editor@example.org",
				"DEMO_EDITOR_PASSWORD": "Saffron!River-Morning-2026",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := demoAccountsFromEnvironment(func(key string) string { return tt.values[key] })
			if err == nil {
				t.Fatal("expected invalid demo credentials to be rejected")
			}
		})
	}
}

func TestDemoImageProducesPNG(t *testing.T) {
	content, err := demoImage(demoMediaItems[0])
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(content))
	if err != nil {
		t.Fatalf("decode generated image: %v", err)
	}
	if got := img.Bounds().Dx(); got != 1200 {
		t.Fatalf("image width = %d, want 1200", got)
	}
	if got := img.Bounds().Dy(); got != 630 {
		t.Fatalf("image height = %d, want 630", got)
	}
}
