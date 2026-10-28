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
		{"admin password minimum", "ADMIN_PASSWORD", "short", "Password must contain at least 12 characters"},
		{"admin password common", "ADMIN_PASSWORD", "Password1234", "too common"},
		{"port invalid", "PORT", "70000", "PORT must be an integer between 1 and 65535"},
		{"retry invalid", "DB_CONNECT_RETRIES", "0", "DB_CONNECT_RETRIES must be a positive integer"},
		{"upload size invalid", "MEDIA_MAX_MB", "0", "MEDIA_MAX_MB must be a positive integer"},
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
	if cfg.Port != "8080" || cfg.UploadDir != "/data/uploads" || cfg.DBConnectRetries != 8 || cfg.MediaMaxMB != defaultMediaMaxMB || cfg.MigrateOnStart {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if cfg.StorageDriver != "local" || !cfg.S3PathStyle {
		t.Fatalf("unexpected storage defaults: driver=%q path-style=%t", cfg.StorageDriver, cfg.S3PathStyle)
	}
}

func TestLoadS3StorageConfiguration(t *testing.T) {
	env := validEnv()
	env["STORAGE_DRIVER"] = "s3"
	env["S3_ENDPOINT"] = "https://s3.us-west-004.backblazeb2.com"
	env["S3_REGION"] = "us-west-004"
	env["S3_BUCKET"] = "private-media"
	env["S3_ACCESS_KEY_ID"] = "test-key-id"
	env["S3_SECRET_ACCESS_KEY"] = "test-secret"
	cfg, err := loadEnv(env)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.StorageDriver != "s3" || !cfg.S3PathStyle || cfg.S3Bucket != "private-media" {
		t.Fatalf("unexpected S3 configuration: %+v", cfg)
	}
}

func TestLoadS3RequiresCredentialsAndEndpoint(t *testing.T) {
	env := validEnv()
	env["STORAGE_DRIVER"] = "s3"
	_, err := loadEnv(env)
	if err == nil {
		t.Fatal("expected invalid S3 configuration")
	}
	for _, setting := range []string{"S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"} {
		if !strings.Contains(err.Error(), setting+" is required") {
			t.Errorf("error %q does not mention missing %s", err, setting)
		}
	}
}

func TestLoadS3RejectsEndpointWithPath(t *testing.T) {
	env := validEnv()
	env["STORAGE_DRIVER"] = "s3"
	env["S3_ENDPOINT"] = "https://s3.example.test/private"
	env["S3_REGION"] = "us-east-1"
	env["S3_BUCKET"] = "private-media"
	env["S3_ACCESS_KEY_ID"] = "test-key-id"
	env["S3_SECRET_ACCESS_KEY"] = "test-secret"
	_, err := loadEnv(env)
	if err == nil || !strings.Contains(err.Error(), "S3_ENDPOINT must be an HTTP(S) origin") {
		t.Fatalf("error = %v, want invalid S3_ENDPOINT", err)
	}
}

func TestLoadS3PathStyleCanBeDisabled(t *testing.T) {
	env := validEnv()
	env["STORAGE_DRIVER"] = "s3"
	env["S3_ENDPOINT"] = "https://s3.example.test"
	env["S3_REGION"] = "us-east-1"
	env["S3_BUCKET"] = "private-media"
	env["S3_ACCESS_KEY_ID"] = "test-key-id"
	env["S3_SECRET_ACCESS_KEY"] = "test-secret"
	env["S3_PATH_STYLE"] = "false"
	cfg, err := loadEnv(env)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.S3PathStyle {
		t.Fatal("S3_PATH_STYLE=false was not applied")
	}
}
