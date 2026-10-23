package utils

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestParseTokenRejectsInvalidTokens(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	good, err := GenerateToken(secret, 7, "admin")
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(good, ".")
	if parts[2][0] == 'A' {
		parts[2] = "B" + parts[2][1:]
	} else {
		parts[2] = "A" + parts[2][1:]
	}
	tampered := strings.Join(parts, ".")
	baseClaims := jwt.MapClaims{"iss": "kalenbnakafl", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "user_id": 7, "role": "admin"}
	missing := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"iss": "kalenbnakafl", "exp": time.Now().Add(time.Hour).Unix()})
	missingToken, err := missing.SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	expiredClaims := jwt.MapClaims{"iss": "kalenbnakafl", "exp": time.Now().Add(-time.Hour).Unix(), "iat": time.Now().Add(-2 * time.Hour).Unix(), "user_id": 7, "role": "admin"}
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	wrongAlg, err := jwt.NewWithClaims(jwt.SigningMethodHS384, baseClaims).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	none, err := jwt.NewWithClaims(jwt.SigningMethodNone, baseClaims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct{ name, token string }{{"wrong algorithm", wrongAlg}, {"expired", expired}, {"missing claims", missingToken}, {"tampered signature", tampered}, {"none algorithm", none}}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := ParseToken(secret, tt.token); err == nil {
				t.Fatal("expected invalid token error")
			}
		})
	}
}

func TestGenerateAndParseTypedToken(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	token, err := GenerateToken(secret, 42, "editor")
	if err != nil {
		t.Fatal(err)
	}
	id, role, err := ParseToken(secret, token)
	if err != nil {
		t.Fatal(err)
	}
	if id != 42 || role != "editor" {
		t.Fatalf("got id=%d role=%q", id, role)
	}
}
