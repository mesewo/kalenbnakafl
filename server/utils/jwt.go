package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func GenerateToken(secret []byte, userID int, role string) (string, error) {
	if len(secret) < 32 {
		return "", errors.New("JWT_SECRET must be at least 32 bytes")
	}
	claims := jwt.MapClaims{"user_id": userID, "role": role, "iss": "kalenbnakafl", "exp": time.Now().Add(24 * time.Hour).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

func ParseToken(secret []byte, value string) (int, string, error) {
	if len(secret) < 32 {
		return 0, "", errors.New("JWT_SECRET must be at least 32 bytes")
	}
	token, err := jwt.Parse(value, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
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
