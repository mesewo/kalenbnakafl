package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/aws/smithy-go/transport/http"
)

type S3Config struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	PathStyle       bool
}

type S3 struct {
	client *s3.Client
	bucket string
}

func NewS3(ctx context.Context, cfg S3Config) (*S3, error) {
	endpoint, err := url.ParseRequestURI(cfg.Endpoint)
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" ||
		endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" || (endpoint.Path != "" && endpoint.Path != "/") {
		return nil, errors.New("S3 endpoint must be an HTTP(S) origin")
	}
	if strings.TrimSpace(cfg.Region) == "" || strings.TrimSpace(cfg.Bucket) == "" ||
		strings.TrimSpace(cfg.AccessKeyID) == "" || strings.TrimSpace(cfg.SecretAccessKey) == "" {
		return nil, errors.New("S3 region, bucket, and credentials are required")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("load S3 client configuration: %w", err)
	}
	client := s3.NewFromConfig(awsCfg, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(cfg.Endpoint)
		options.UsePathStyle = cfg.PathStyle
	})
	return &S3{client: client, bucket: cfg.Bucket}, nil
}

func (s *S3) Save(ctx context.Context, source io.Reader, extension string, maxBytes int64) (name string, size int64, resultErr error) {
	if maxBytes < 1 || !validExtension(extension) {
		return "", 0, errors.New("invalid storage options")
	}
	temp, err := os.CreateTemp("", "kalenbnakafl-upload-*")
	if err != nil {
		return "", 0, fmt.Errorf("create temporary upload: %w", err)
	}
	tempName := temp.Name()
	defer func() {
		if cleanupErr := os.Remove(tempName); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) && resultErr == nil {
			resultErr = fmt.Errorf("remove temporary upload: %w", cleanupErr)
		}
	}()
	written, err := io.Copy(temp, &contextReader{ctx: ctx, reader: io.LimitReader(source, maxBytes+1)})
	if err != nil {
		_ = temp.Close()
		return "", 0, fmt.Errorf("write temporary upload: %w", err)
	}
	if written == 0 {
		_ = temp.Close()
		return "", 0, ErrEmpty
	}
	if written > maxBytes {
		_ = temp.Close()
		return "", written, ErrTooLarge
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return "", 0, fmt.Errorf("sync temporary upload: %w", err)
	}
	if err := temp.Close(); err != nil {
		return "", 0, fmt.Errorf("close temporary upload: %w", err)
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", 0, fmt.Errorf("generate stored name: %w", err)
	}
	name = hex.EncodeToString(random[:]) + extension
	body, err := os.Open(tempName)
	if err != nil {
		return "", 0, fmt.Errorf("open temporary upload: %w", err)
	}
	_, putErr := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(name), Body: body,
		ContentLength: aws.Int64(written), ContentType: aws.String(contentTypeForExtension(extension)),
	})
	closeErr := body.Close()
	if putErr != nil {
		return "", 0, fmt.Errorf("put S3 object: %w", putErr)
	}
	if closeErr != nil {
		return "", 0, fmt.Errorf("close temporary upload reader: %w", closeErr)
	}
	return name, written, nil
}

func (s *S3) Delete(ctx context.Context, name string) error {
	if !validObjectName(name) {
		return os.ErrNotExist
	}
	if _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(name)}); err != nil {
		return fmt.Errorf("delete S3 object: %w", err)
	}
	return nil
}

func (s *S3) Open(ctx context.Context, name string) (io.ReadSeekCloser, Metadata, error) {
	if !validObjectName(name) {
		return nil, Metadata{}, os.ErrNotExist
	}
	output, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(name)})
	if err != nil {
		if isMissingObject(err) {
			return nil, Metadata{}, os.ErrNotExist
		}
		return nil, Metadata{}, fmt.Errorf("head S3 object: %w", err)
	}
	if output.ContentLength == nil {
		return nil, Metadata{}, errors.New("S3 object metadata did not include content length")
	}
	if *output.ContentLength < 0 {
		return nil, Metadata{}, errors.New("S3 object metadata included a negative content length")
	}
	metadata := Metadata{Size: *output.ContentLength}
	if output.ContentType != nil {
		metadata.ContentType = *output.ContentType
	}
	if metadata.ContentType == "" {
		metadata.ContentType = contentTypeForExtension(filepath.Ext(name))
	}
	if output.LastModified != nil {
		metadata.ModTime = *output.LastModified
	}
	return &s3ObjectReader{ctx: ctx, client: s.client, bucket: s.bucket, key: name, size: metadata.Size}, metadata, nil
}

func (s *S3) Check(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})
	if err != nil {
		return fmt.Errorf("check S3 bucket: %w", err)
	}
	return nil
}

type s3ObjectReader struct {
	ctx    context.Context
	client *s3.Client
	bucket string
	key    string
	size   int64
	offset int64
	body   io.ReadCloser
	closed bool
}

func (r *s3ObjectReader) Read(p []byte) (int, error) {
	if r.closed {
		return 0, os.ErrClosed
	}
	if len(p) == 0 {
		return 0, nil
	}
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	if r.offset >= r.size {
		return 0, io.EOF
	}
	if r.body == nil {
		output, err := r.client.GetObject(r.ctx, &s3.GetObjectInput{
			Bucket: aws.String(r.bucket), Key: aws.String(r.key),
			Range: aws.String(fmt.Sprintf("bytes=%d-", r.offset)),
		})
		if err != nil {
			return 0, fmt.Errorf("read S3 object range: %w", err)
		}
		r.body = output.Body
	}
	n, err := r.body.Read(p)
	r.offset += int64(n)
	return n, err
}

func (r *s3ObjectReader) Seek(offset int64, whence int) (int64, error) {
	if r.closed {
		return r.offset, os.ErrClosed
	}
	var target int64
	switch whence {
	case io.SeekStart:
		target = offset
	case io.SeekCurrent:
		var ok bool
		target, ok = addSeekOffset(r.offset, offset)
		if !ok {
			return r.offset, errors.New("seek position overflows")
		}
	case io.SeekEnd:
		var ok bool
		target, ok = addSeekOffset(r.size, offset)
		if !ok {
			return r.offset, errors.New("seek position overflows")
		}
	default:
		return r.offset, errors.New("invalid seek whence")
	}
	if target < 0 {
		return r.offset, errors.New("negative seek position")
	}
	if target == r.offset {
		return target, nil
	}
	if r.body != nil {
		if err := r.body.Close(); err != nil {
			return r.offset, fmt.Errorf("close current S3 object range: %w", err)
		}
		r.body = nil
	}
	r.offset = target
	return target, nil
}

func (r *s3ObjectReader) Close() error {
	if r.closed {
		return nil
	}
	r.closed = true
	if r.body == nil {
		return nil
	}
	err := r.body.Close()
	r.body = nil
	return err
}

func addSeekOffset(base, offset int64) (int64, bool) {
	if offset > 0 && base > math.MaxInt64-offset {
		return 0, false
	}
	if offset < 0 && base < math.MinInt64-offset {
		return 0, false
	}
	return base + offset, true
}

func validObjectName(name string) bool {
	return name != "" && filepath.Base(name) == name && !strings.ContainsAny(name, `/\\`) && !strings.HasPrefix(name, ".")
}

func isMissingObject(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) && (apiErr.ErrorCode() == "NoSuchKey" || apiErr.ErrorCode() == "NotFound") {
		return true
	}
	var responseErr *http.ResponseError
	return errors.As(err, &responseErr) && responseErr.HTTPStatusCode() == 404
}
