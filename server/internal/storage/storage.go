package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Storage stores media under opaque names and supports atomic writes.
type Storage interface {
	Save(context.Context, io.Reader, string, int64) (string, int64, error)
	Delete(context.Context, string) error
	Open(context.Context, string) (*os.File, error)
}

type Local struct{ root string }

func NewLocal(root string) *Local { return &Local{root: root} }

func (s *Local) Save(ctx context.Context, source io.Reader, extension string, maxBytes int64) (name string, size int64, resultErr error) {
	if maxBytes < 1 || !validExtension(extension) {
		return "", 0, errors.New("invalid storage options")
	}
	if err := os.MkdirAll(s.root, 0755); err != nil {
		return "", 0, fmt.Errorf("create storage directory: %w", err)
	}
	temp, err := os.CreateTemp(s.root, ".upload-*")
	if err != nil {
		return "", 0, fmt.Errorf("create temporary upload: %w", err)
	}
	tempName := temp.Name()
	defer func() {
		if cleanupErr := os.Remove(tempName); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) && resultErr == nil {
			resultErr = fmt.Errorf("remove temporary upload: %w", cleanupErr)
		}
	}()
	limited := &contextReader{ctx: ctx, reader: io.LimitReader(source, maxBytes+1)}
	written, copyErr := io.Copy(temp, limited)
	if copyErr != nil {
		_ = temp.Close()
		return "", 0, fmt.Errorf("write temporary upload: %w", copyErr)
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
	storedName := hex.EncodeToString(random[:]) + extension
	if err := os.Rename(tempName, filepath.Join(s.root, storedName)); err != nil {
		return "", 0, fmt.Errorf("publish uploaded file: %w", err)
	}
	return storedName, written, nil
}

var ErrTooLarge = errors.New("uploaded file exceeds size limit")
var ErrEmpty = errors.New("empty upload")

func (s *Local) Delete(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := s.path(name)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func (s *Local) Open(ctx context.Context, name string) (*os.File, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	path, err := s.path(name)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (s *Local) path(name string) (string, error) {
	if name == "" || filepath.Base(name) != name || strings.ContainsAny(name, `/\\`) || strings.HasPrefix(name, ".") {
		return "", os.ErrNotExist
	}
	return filepath.Join(s.root, name), nil
}

func validExtension(extension string) bool {
	switch extension {
	case ".png", ".jpg", ".webp", ".pdf", ".mp4", ".webm", ".mp3", ".ogg":
		return true
	default:
		return false
	}
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
