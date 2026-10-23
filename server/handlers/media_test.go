package handlers

import (
	"strings"
	"testing"
)

func TestCleanOriginalName(t *testing.T) {
	got := cleanOriginalName("  report\r\n\tname.pdf  ")
	if got != "reportname.pdf" {
		t.Fatalf("cleanOriginalName()=%q", got)
	}
	long := cleanOriginalName(strings.Repeat("x", 300))
	if len([]rune(long)) != 255 {
		t.Fatalf("name rune count=%d want=255", len([]rune(long)))
	}
}

func TestDetectMediaTypeAllowlist(t *testing.T) {
	tests := []struct {
		name            string
		data            []byte
		mime, ext, kind string
		ok              bool
	}{
		{"png", []byte{0x89, 'P', 'N', 'G', 13, 10, 26, 10}, "image/png", ".png", "image", true},
		{"jpeg", []byte{0xff, 0xd8, 0xff, 0xe0}, "image/jpeg", ".jpg", "image", true},
		{"webp", []byte("RIFF0000WEBPVP8 "), "image/webp", ".webp", "image", true},
		{"pdf", []byte("%PDF-1.7"), "application/pdf", ".pdf", "document", true},
		{"mp4", []byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, "video/mp4", ".mp4", "video", true},
		{"webm", []byte{0x1a, 0x45, 0xdf, 0xa3, 'w', 'e', 'b', 'm'}, "video/webm", ".webm", "video", true},
		{"mp3", []byte("ID3\x04\x00\x00\x00\x00\x00\x00"), "audio/mpeg", ".mp3", "audio", true},
		{"ogg", []byte("OggS\x00\x02\x00\x00"), "audio/ogg", ".ogg", "audio", true},
		{"executable", []byte("MZ executable"), "", "", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mime, ext, kind, ok := detectMediaType(tc.data)
			if ok != tc.ok || mime != tc.mime || ext != tc.ext || kind != tc.kind {
				t.Fatalf("got (%q,%q,%q,%v), want (%q,%q,%q,%v)", mime, ext, kind, ok, tc.mime, tc.ext, tc.kind, tc.ok)
			}
		})
	}
}
