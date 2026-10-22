package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid token")

type TokenClaims struct {
	UserID int    `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func GenerateToken(secret []byte, userID int, role string) (string, error) {
	if len(secret) < 32 {
		return "", errors.New("JWT_SECRET must be at least 32 bytes")
	}
	claims := TokenClaims{UserID: userID, Role: role, RegisteredClaims: jwt.RegisteredClaims{Issuer: "kalenbnakafl", ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)), IssuedAt: jwt.NewNumericDate(time.Now())}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

func ParseToken(secret []byte, value string) (int, string, error) {
	if len(secret) < 32 {
		return 0, "", ErrInvalidToken
	}
	claims := &TokenClaims{}
	token, err := jwt.ParseWithClaims(value, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrInvalidToken
		}
		return secret, nil
	}, jwt.WithIssuer("kalenbnakafl"), jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || token == nil || !token.Valid || claims.UserID < 1 || !validRole(claims.Role) || claims.ExpiresAt == nil || claims.IssuedAt == nil {
		return 0, "", ErrInvalidToken
	}
	return claims.UserID, claims.Role, nil
}

func validRole(role string) bool {
	switch role {
	case "admin", "editor", "user", "volunteer":
		return true
	default:
		return false
	}
}
