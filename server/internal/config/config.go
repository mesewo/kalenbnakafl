package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"kalenbnakafl/internal/auth"
	"kalenbnakafl/internal/i18n"
)

const defaultMediaMaxMB int64 = 50

type Config struct {
	Port              string
	AppEnv            string
	DatabaseURL       string
	JWTSecret         []byte
	CORSOrigins       []string
	UploadDir         string
	MediaMaxMB        int64
	DBConnectRetries  int
	MigrateOnStart    bool
	AdminEmail        string
	AdminPassword     string
	TrustedProxies    []string
	StorageDriver     string
	S3Endpoint        string
	S3Region          string
	S3Bucket          string
	S3AccessKeyID     string
	S3SecretAccessKey string
	S3PathStyle       bool
}

func Environment(key string) string { return os.Getenv(key) }

func Load() (Config, error) {
	return LoadFrom(os.Getenv)
}

// LoadFrom loads and validates application settings using getenv. It is kept
// injectable so validation can be tested without changing process environment.
func LoadFrom(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:              valueOr(getenv("PORT"), "8080"),
		AppEnv:            valueOr(getenv("APP_ENV"), "development"),
		DatabaseURL:       strings.TrimSpace(getenv("DATABASE_URL")),
		JWTSecret:         []byte(getenv("JWT_SECRET")),
		CORSOrigins:       splitList(getenv("CORS_ORIGINS")),
		UploadDir:         valueOr(getenv("UPLOAD_DIR"), "/data/uploads"),
		MediaMaxMB:        defaultMediaMaxMB,
		DBConnectRetries:  8,
		AdminEmail:        strings.TrimSpace(getenv("ADMIN_EMAIL")),
		AdminPassword:     getenv("ADMIN_PASSWORD"),
		TrustedProxies:    splitList(getenv("TRUSTED_PROXIES")),
		StorageDriver:     valueOr(getenv("STORAGE_DRIVER"), "local"),
		S3Endpoint:        strings.TrimSpace(getenv("S3_ENDPOINT")),
		S3Region:          strings.TrimSpace(getenv("S3_REGION")),
		S3Bucket:          strings.TrimSpace(getenv("S3_BUCKET")),
		S3AccessKeyID:     strings.TrimSpace(getenv("S3_ACCESS_KEY_ID")),
		S3SecretAccessKey: strings.TrimSpace(getenv("S3_SECRET_ACCESS_KEY")),
		S3PathStyle:       true,
	}
	var problems []string
	if value := strings.TrimSpace(getenv("S3_PATH_STYLE")); value != "" {
		pathStyle, err := strconv.ParseBool(value)
		if err != nil {
			problems = append(problems, "S3_PATH_STYLE must be true or false")
		} else {
			cfg.S3PathStyle = pathStyle
		}
	}
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
	if c.AdminPassword != "" {
		if err := auth.ValidatePassword(c.AdminPassword, c.AdminEmail, "Administrator"); err != nil {
			problems = append(problems, "ADMIN_PASSWORD: "+i18n.Text("en", err.Error()))
		}
	}
	if strings.TrimSpace(c.UploadDir) == "" {
		problems = append(problems, "UPLOAD_DIR must not be empty")
	}
	if c.StorageDriver != "local" && c.StorageDriver != "s3" {
		problems = append(problems, "STORAGE_DRIVER must be local or s3")
	}
	if c.StorageDriver == "s3" {
		for _, setting := range []struct{ name, value string }{
			{"S3_ENDPOINT", c.S3Endpoint}, {"S3_REGION", c.S3Region}, {"S3_BUCKET", c.S3Bucket},
			{"S3_ACCESS_KEY_ID", c.S3AccessKeyID}, {"S3_SECRET_ACCESS_KEY", c.S3SecretAccessKey},
		} {
			if setting.value == "" {
				problems = append(problems, setting.name+" is required when STORAGE_DRIVER=s3")
			}
		}
		if c.S3Endpoint != "" {
			endpoint, err := url.ParseRequestURI(c.S3Endpoint)
			if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" ||
				endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" || (endpoint.Path != "" && endpoint.Path != "/") {
				problems = append(problems, "S3_ENDPOINT must be an HTTP(S) origin without credentials, path, query, or fragment")
			}
		}
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
