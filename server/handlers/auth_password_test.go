package handlers

import (
	"bytes"
	"errors"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestMissingLoginUserComparesAgainstDummyHash(t *testing.T) {
	if len(dummyPasswordHash) == 0 {
		t.Fatal("dummy bcrypt hash was not initialized")
	}
	var comparedHash []byte
	compared := compareLoginPassword([]byte("unused stored hash"), []byte("candidate password"), false, func(hash, _ []byte) error {
		comparedHash = bytes.Clone(hash)
		return errors.New("expected mismatch")
	})
	if compared {
		t.Fatal("dummy comparison unexpectedly matched")
	}
	if !bytes.Equal(comparedHash, dummyPasswordHash) {
		t.Fatal("missing-account path did not compare against the dummy bcrypt hash")
	}
	if cost, err := bcrypt.Cost(dummyPasswordHash); err != nil || cost != bcrypt.DefaultCost {
		t.Fatalf("dummy bcrypt cost = %d, error = %v", cost, err)
	}
}

func TestLoginComparisonStillRunsForOversizedPassword(t *testing.T) {
	called := false
	matched := compareLoginPassword(dummyPasswordHash, bytes.Repeat([]byte("x"), 73), true, func(_, password []byte) error {
		called = true
		if len(password) > 72 {
			t.Fatal("oversized candidate was passed directly to bcrypt")
		}
		return errors.New("mismatch")
	})
	if !called || matched {
		t.Fatalf("comparison called=%v matched=%v; want a failed comparison to run", called, matched)
	}
}
