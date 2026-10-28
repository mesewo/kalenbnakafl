package storage

import (
	"context"
	"os"
	"strconv"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestS3StorageContract(t *testing.T) {
	endpoint := os.Getenv("S3_TEST_ENDPOINT")
	if endpoint == "" {
		t.Skip("S3_TEST_ENDPOINT is not set")
	}
	pathStyle := true
	if value := os.Getenv("S3_TEST_PATH_STYLE"); value != "" {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			t.Fatalf("parse S3_TEST_PATH_STYLE: %v", err)
		}
		pathStyle = parsed
	}
	cfg := S3Config{
		Endpoint: endpoint, Region: envOr("S3_TEST_REGION", "us-east-1"),
		Bucket:      envOr("S3_TEST_BUCKET", "kalenbnakafl-test"),
		AccessKeyID: os.Getenv("S3_TEST_ACCESS_KEY_ID"), SecretAccessKey: os.Getenv("S3_TEST_SECRET_ACCESS_KEY"),
		PathStyle: pathStyle,
	}
	ctx := context.Background()
	store, err := NewS3(ctx, cfg)
	if err != nil {
		t.Fatalf("configure test S3 storage: %v", err)
	}
	if err := store.Check(ctx); err != nil {
		_, createErr := store.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(cfg.Bucket)})
		if createErr != nil {
			t.Fatalf("check test bucket: %v; create test bucket: %v", err, createErr)
		}
		if checkErr := store.Check(ctx); checkErr != nil {
			t.Fatalf("check newly created test bucket: %v", checkErr)
		}
	}
	runStorageContract(t, store)
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
