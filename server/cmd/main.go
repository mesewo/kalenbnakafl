package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/database"
	"kalenbnakafl/routes"
	"kalenbnakafl/utils"
)

func corsMiddleware() gin.HandlerFunc {
	allowed := strings.Split(os.Getenv("CORS_ORIGINS"), ",")
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		for _, value := range allowed {
			if strings.TrimSpace(value) == origin && origin != "" {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Vary", "Origin")
				break
			}
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func main() {
	if err := utils.ValidateJWTSecret(); err != nil {
		log.Fatal(err)
	}
	db, queries, err := database.Connect()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if strings.EqualFold(os.Getenv("MIGRATE_ON_START"), "true") {
		if err := database.Migrate(context.Background(), db); err != nil {
			log.Fatal(err)
		}
	}
	if err := database.BootstrapAdmin(context.Background(), queries); err != nil {
		log.Fatal(err)
	}
	r := gin.Default()
	r.Use(corsMiddleware())
	health := func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		if err := database.Ping(ctx, db); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
	r.GET("/health", health)
	r.GET("/healthz", health)
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "/data/uploads"
	}
	_ = os.MkdirAll(uploadDir, 0755)
	r.Static("/uploads", uploadDir)
	routes.SetupRoutes(r, queries, db)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
