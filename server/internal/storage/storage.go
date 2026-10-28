package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Storage stores media under opaque names and supports atomic writes.
type Storage interface {
	Save(context.Context, io.Reader, string, int64) (string, int64, error)
	Delete(context.Context, string) error
	Open(context.Context, string) (io.ReadSeekCloser, Metadata, error)
	Check(context.Context) error
}

type Metadata struct {
	Size        int64
	ContentType string
	ModTime     time.Time
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

func (s *Local) Open(ctx context.Context, name string) (io.ReadSeekCloser, Metadata, error) {
	if err := ctx.Err(); err != nil {
		return nil, Metadata{}, err
	}
	path, err := s.path(name)
	if err != nil {
		return nil, Metadata{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, Metadata{}, err
	}
	info, err := file.Stat()
	if err != nil {
		if closeErr := file.Close(); closeErr != nil {
			return nil, Metadata{}, fmt.Errorf("stat local object: %w (close: %v)", err, closeErr)
		}
		return nil, Metadata{}, fmt.Errorf("stat local object: %w", err)
	}
	if !info.Mode().IsRegular() {
		if err := file.Close(); err != nil {
			return nil, Metadata{}, fmt.Errorf("close non-file local object: %w", err)
		}
		return nil, Metadata{}, os.ErrNotExist
	}
	return file, Metadata{
		Size:        info.Size(),
		ContentType: contentTypeForExtension(filepath.Ext(name)),
		ModTime:     info.ModTime(),
	}, nil
}

func (s *Local) Check(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	info, err := os.Stat(s.root)
	if err != nil {
		return fmt.Errorf("stat local storage directory: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("local storage path is not a directory")
	}
	probe, err := os.CreateTemp(s.root, ".storage-check-*")
	if err != nil {
		return fmt.Errorf("write local storage directory: %w", err)
	}
	name := probe.Name()
	if err := probe.Close(); err != nil {
		_ = os.Remove(name)
		return fmt.Errorf("close local storage check file: %w", err)
	}
	if err := os.Remove(name); err != nil {
		return fmt.Errorf("remove local storage check file: %w", err)
	}
	return nil
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

func contentTypeForExtension(extension string) string {
	if contentType := mime.TypeByExtension(extension); contentType != "" {
		return contentType
	}
	switch extension {
	case ".jpg":
		return "image/jpeg"
	case ".webm":
		return "video/webm"
	case ".mp3":
		return "audio/mpeg"
	case ".ogg":
		return "audio/ogg"
	default:
		return "application/octet-stream"
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
