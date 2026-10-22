package httpx

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

type ErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}
type Envelope struct {
	Error ErrorBody `json:"error"`
}

func Write(c *gin.Context, status int, code, message string, details map[string]any) {
	if details == nil {
		details = map[string]any{}
	}
	c.JSON(status, Envelope{Error: ErrorBody{Code: code, Message: message, Details: details}})
}

func Fail(c *gin.Context, status int, message string) {
	if tooLarge, exists := c.Get("httpx.request_too_large"); exists && tooLarge == true {
		Write(c, http.StatusRequestEntityTooLarge, "payload_too_large", "Request body is too large.", nil)
		return
	}
	if bindErr, exists := c.Get("httpx.bind_error"); exists {
		if code, ok := bindErr.(string); ok {
			if code == "payload_too_large" {
				Write(c, http.StatusRequestEntityTooLarge, code, "Request body is too large.", nil)
			} else {
				Write(c, http.StatusBadRequest, code, "Request body must contain valid JSON.", nil)
			}
			return
		}
	}
	if status >= 500 {
		Internal(c, message)
		return
	}
	code := "validation_failed"
	switch status {
	case http.StatusUnauthorized:
		code = "unauthorized"
	case http.StatusForbidden:
		code = "forbidden"
	case http.StatusNotFound:
		code = "not_found"
	case http.StatusConflict:
		code = "conflict"
	case http.StatusTooManyRequests:
		code = "rate_limited"
	case http.StatusRequestEntityTooLarge:
		code = "payload_too_large"
	}
	Write(c, status, code, message, nil)
}

func Internal(c *gin.Context, operation string) {
	Logger(c).Error("request failed", "operation", operation)
	Write(c, http.StatusInternalServerError, "internal", "An unexpected error occurred.", nil)
}

func BindJSON(c *gin.Context, target any) bool {
	if err := c.ShouldBindJSON(target); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.Set("httpx.bind_error", "payload_too_large")
		} else {
			c.Set("httpx.bind_error", "invalid_json")
		}
		return false
	}
	return true
}
