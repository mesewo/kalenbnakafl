package handlers

import (
	"github.com/gin-gonic/gin"
	"kalenbnakafl/internal/httpx"
	"net/mail"
	"strconv"
	"strings"
	"time"
)

func clean(value string) string { return strings.TrimSpace(value) }
func validEmail(value string) bool {
	_, err := mail.ParseAddress(value)
	return err == nil && strings.Contains(value, "@")
}
func parseID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		httpx.Fail(c, 400, "Invalid id")
		return 0, false
	}
	return id, true
}
func validateText(value string, max int) bool {
	value = clean(value)
	return value != "" && len(value) <= max
}
func parseEventTime(value string) (time.Time, bool) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	return parsed, err == nil
}
