package utils

import (
	"errors"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func JWTSecret() []byte { return []byte(os.Getenv("JWT_SECRET")) }
func ValidateJWTSecret() error {
	if len(strings.TrimSpace(os.Getenv("JWT_SECRET"))) < 32 {
		return errors.New("JWT_SECRET must be at least 32 characters")
	}
	return nil
}
func GenerateToken(userID int, role string) (string, error) {
	if err := ValidateJWTSecret(); err != nil {
		return "", err
	}
	claims := jwt.MapClaims{"user_id": userID, "role": role, "iss": "kalenbnakafl", "exp": time.Now().Add(24 * time.Hour).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(JWTSecret())
}
func ParseToken(value string) (int, string, error) {
	if err := ValidateJWTSecret(); err != nil {
		return 0, "", err
	}
	token, err := jwt.Parse(value, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return JWTSecret(), nil
	}, jwt.WithIssuer("kalenbnakafl"), jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		return 0, "", errors.New("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, "", errors.New("invalid claims")
	}
	uid, ok := claims["user_id"].(float64)
	if !ok || uid < 1 {
		return 0, "", errors.New("invalid user id")
	}
	role, ok := claims["role"].(string)
	if !ok || role == "" {
		return 0, "", errors.New("invalid role")
	}
	return int(uid), role, nil
}
