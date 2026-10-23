package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

const defaultMediaMaxMB int64 = 50

type Config struct {
	Port             string
	AppEnv           string
	DatabaseURL      string
	JWTSecret        []byte
	CORSOrigins      []string
	UploadDir        string
	MediaMaxMB       int64
	DBConnectRetries int
	MigrateOnStart   bool
	AdminEmail       string
	AdminPassword    string
	TrustedProxies   []string
}

func Environment(key string) string { return os.Getenv(key) }

func Load() (Config, error) {
	return LoadFrom(os.Getenv)
}

// LoadFrom loads and validates application settings using getenv. It is kept
// injectable so validation can be tested without changing process environment.
func LoadFrom(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:             valueOr(getenv("PORT"), "8080"),
		AppEnv:           valueOr(getenv("APP_ENV"), "development"),
		DatabaseURL:      strings.TrimSpace(getenv("DATABASE_URL")),
		JWTSecret:        []byte(getenv("JWT_SECRET")),
		CORSOrigins:      splitList(getenv("CORS_ORIGINS")),
		UploadDir:        valueOr(getenv("UPLOAD_DIR"), "/data/uploads"),
		MediaMaxMB:       defaultMediaMaxMB,
		DBConnectRetries: 8,
		AdminEmail:       strings.TrimSpace(getenv("ADMIN_EMAIL")),
		AdminPassword:    getenv("ADMIN_PASSWORD"),
		TrustedProxies:   splitList(getenv("TRUSTED_PROXIES")),
	}
	var problems []string
	if value := strings.TrimSpace(getenv("DB_CONNECT_RETRIES")); value != "" {
		retries, err := strconv.Atoi(value)
		if err != nil || retries < 1 {
			problems = append(problems, "DB_CONNECT_RETRIES must be a positive integer")
		} else {
			cfg.DBConnectRetries = retries
		}
	}
	if value := strings.TrimSpace(getenv("MEDIA_MAX_MB")); value != "" {
		maxMB, err := strconv.ParseInt(value, 10, 64)
		if err != nil || maxMB < 1 || maxMB > (int64(^uint64(0)>>1)/(1024*1024)-1) {
			problems = append(problems, "MEDIA_MAX_MB must be a positive integer within the supported range")
		} else {
			cfg.MediaMaxMB = maxMB
		}
	}
	if value := strings.TrimSpace(getenv("MIGRATE_ON_START")); value != "" {
		migrate, err := strconv.ParseBool(value)
		if err != nil {
			problems = append(problems, "MIGRATE_ON_START must be true or false")
		} else {
			cfg.MigrateOnStart = migrate
		}
	}
	problems = append(problems, cfg.validationProblems()...)
	if len(problems) > 0 {
		return Config{}, fmt.Errorf("invalid configuration: %s", strings.Join(problems, "; "))
	}
	return cfg, nil
}

func (c Config) validationProblems() []string {
	var problems []string
	if c.Port == "" {
		problems = append(problems, "PORT must not be empty")
	} else if port, err := strconv.Atoi(c.Port); err != nil || port < 1 || port > 65535 {
		problems = append(problems, "PORT must be an integer between 1 and 65535")
	}
	if strings.TrimSpace(c.DatabaseURL) == "" {
		problems = append(problems, "DATABASE_URL is required")
	}
	if len(c.JWTSecret) < 32 {
		problems = append(problems, "JWT_SECRET must be at least 32 bytes")
	}
	if (c.AdminEmail == "") != (c.AdminPassword == "") {
		problems = append(problems, "ADMIN_EMAIL and ADMIN_PASSWORD must be set together")
	}
	if c.AdminPassword != "" && len(c.AdminPassword) < 12 {
		problems = append(problems, "ADMIN_PASSWORD must be at least 12 characters")
	}
	if strings.TrimSpace(c.UploadDir) == "" {
		problems = append(problems, "UPLOAD_DIR must not be empty")
	}
	if c.MediaMaxMB < 1 {
		problems = append(problems, "MEDIA_MAX_MB must be a positive integer")
	}
	if c.DBConnectRetries < 1 {
		problems = append(problems, "DB_CONNECT_RETRIES must be a positive integer")
	}
	return problems
}

func valueOr(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func splitList(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			values = append(values, part)
		}
	}
	return values
}
