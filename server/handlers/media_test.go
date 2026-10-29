package handlers

import (
	"strings"
	"testing"
)

func TestCleanOriginalName(t *testing.T) {
	got := cleanOriginalName("  report\r\n\tname.png  ")
	if got != "reportname.png" {
		t.Fatalf("cleanOriginalName()=%q", got)
	}
	long := cleanOriginalName(strings.Repeat("x", 300))
	if len([]rune(long)) != 255 {
		t.Fatalf("name rune count=%d want=255", len([]rune(long)))
	}
}

func TestIfNoneMatch(t *testing.T) {
	for _, tc := range []struct {
		header string
		want   bool
	}{
		{`"image-v1"`, true},
		{`"other", "image-v1"`, true},
		{"*", true},
		{`W/"image-v1"`, true},
		{`"other"`, false},
		{"", false},
	} {
		if got := ifNoneMatch(tc.header, `"image-v1"`); got != tc.want {
			t.Errorf("ifNoneMatch(%q)=%v want %v", tc.header, got, tc.want)
		}
	}
}
