package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"testing"
	"time"
)

func TestLocalStorageContract(t *testing.T) {
	runStorageContract(t, NewLocal(t.TempDir()))
}

func runStorageContract(t *testing.T, store Storage) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := store.Check(ctx); err != nil {
		t.Fatalf("check storage: %v", err)
	}

	content := []byte("seekable storage contract")
	name, size, err := store.Save(ctx, bytes.NewReader(content), ".png", int64(len(content)))
	if err != nil {
		t.Fatalf("save object: %v", err)
	}
	if size != int64(len(content)) {
		t.Fatalf("saved size = %d, want %d", size, len(content))
	}
	reader, metadata, err := store.Open(ctx, name)
	if err != nil {
		t.Fatalf("open object: %v", err)
	}
	if metadata.Size != size || metadata.ContentType != "image/png" || metadata.ModTime.IsZero() {
		t.Fatalf("unexpected object metadata: %+v", metadata)
	}
	if position, err := reader.Seek(7, io.SeekStart); err != nil || position != 7 {
		t.Fatalf("seek object: position=%d error=%v", position, err)
	}
	segment := make([]byte, 5)
	if _, err := io.ReadFull(reader, segment); err != nil {
		t.Fatalf("read object segment: %v", err)
	}
	if !bytes.Equal(segment, content[7:12]) {
		t.Fatalf("read segment = %q, want %q", segment, content[7:12])
	}
	if err := reader.Close(); err != nil {
		t.Fatalf("close object: %v", err)
	}

	reader, _, err = store.Open(ctx, name)
	if err != nil {
		t.Fatalf("reopen object: %v", err)
	}
	all, err := io.ReadAll(reader)
	if closeErr := reader.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		t.Fatalf("read object: %v", err)
	}
	if !bytes.Equal(all, content) {
		t.Fatalf("read content = %q, want %q", all, content)
	}
	if err := store.Delete(ctx, name); err != nil {
		t.Fatalf("delete object: %v", err)
	}
	if _, _, err := store.Open(ctx, name); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("open deleted object error = %v, want os.ErrNotExist", err)
	}
	if _, _, err := store.Save(ctx, bytes.NewReader([]byte("too large")), ".png", 2); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("oversized save error = %v, want ErrTooLarge", err)
	}
	if _, _, err := store.Save(ctx, bytes.NewReader(nil), ".png", 10); !errors.Is(err, ErrEmpty) {
		t.Fatalf("empty save error = %v, want ErrEmpty", err)
	}
}
