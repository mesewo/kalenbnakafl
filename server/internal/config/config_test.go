package config

import (
	"strings"
	"testing"
)

func validEnv() map[string]string {
	return map[string]string{"DATABASE_URL": "postgres://localhost/test", "JWT_SECRET": strings.Repeat("x", 32)}
}

func loadEnv(values map[string]string) (Config, error) {
	return LoadFrom(func(key string) string { return values[key] })
}

func TestLoadValidation(t *testing.T) {
	tests := []struct{ name, key, value, want string }{
		{"database required", "DATABASE_URL", "", "DATABASE_URL is required"},
		{"jwt minimum", "JWT_SECRET", strings.Repeat("x", 31), "JWT_SECRET must be at least 32 bytes"},
		{"admin email requires password", "ADMIN_EMAIL", "admin@example.org", "ADMIN_EMAIL and ADMIN_PASSWORD must be set together"},
		{"admin password requires email", "ADMIN_PASSWORD", strings.Repeat("x", 12), "ADMIN_EMAIL and ADMIN_PASSWORD must be set together"},
		{"admin password minimum", "ADMIN_PASSWORD", "short", "ADMIN_PASSWORD must be at least 12 characters"},
		{"port invalid", "PORT", "70000", "PORT must be an integer between 1 and 65535"},
		{"retry invalid", "DB_CONNECT_RETRIES", "0", "DB_CONNECT_RETRIES must be a positive integer"},
		{"upload size invalid", "UPLOAD_MAX_BYTES", "0", "UPLOAD_MAX_BYTES must be a positive integer"},
		{"migration bool invalid", "MIGRATE_ON_START", "sometimes", "MIGRATE_ON_START must be true or false"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env := validEnv()
			env[tt.key] = tt.value
			_, err := loadEnv(env)
			if tt.want == "" {
				if err == nil {
					t.Fatal("expected validation error")
				}
			} else if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want containing %q", err, tt.want)
			}
		})
	}
}

func TestLoadReportsAllProblems(t *testing.T) {
	_, err := loadEnv(map[string]string{"JWT_SECRET": "tiny", "ADMIN_EMAIL": "admin@example.org", "PORT": "bad"})
	if err == nil {
		t.Fatal("expected validation error")
	}
	for _, want := range []string{"DATABASE_URL is required", "JWT_SECRET must be at least 32 bytes", "ADMIN_EMAIL and ADMIN_PASSWORD must be set together", "PORT must be an integer"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not include %q", err, want)
		}
	}
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := loadEnv(validEnv())
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.UploadDir != "/data/uploads" || cfg.DBConnectRetries != 8 || cfg.MaxUploadBytes != defaultMaxUploadBytes || cfg.MigrateOnStart {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}
