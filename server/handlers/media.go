package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"github.com/gin-gonic/gin"
	"kalenbnakafl/database"
	"kalenbnakafl/models"
	"os"
	"path/filepath"
	"strings"
)

func GetMedia(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id,title,file_path,COALESCE(media_type,''),COALESCE(original_name,''),COALESCE(size_bytes,0),created_at FROM media ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch media"})
		return
	}
	defer rows.Close()
	items := []models.Media{}
	for rows.Next() {
		var m models.Media
		if err := rows.Scan(&m.ID, &m.Title, &m.FilePath, &m.MediaType, &m.OriginalName, &m.SizeBytes, &m.CreatedAt); err == nil {
			items = append(items, m)
		}
	}
	c.JSON(200, items)
}
func UploadMedia(c *gin.Context) {
	title := clean(c.PostForm("title"))
	if !validateText(title, 180) {
		c.JSON(400, gin.H{"error": "A media title is required"})
		return
	}
	header, err := c.FormFile("file")
	if err != nil || header.Size > 10*1024*1024 {
		c.JSON(400, gin.H{"error": "Choose a file smaller than 10MB"})
		return
	}
	allowed := map[string]bool{"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true, "video/mp4": true, "application/pdf": true}
	contentType := header.Header.Get("Content-Type")
	if !allowed[contentType] {
		c.JSON(400, gin.H{"error": "This file type is not supported"})
		return
	}
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		dir = "/data/uploads"
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(500, gin.H{"error": "Storage is not available"})
		return
	}
	random := make([]byte, 8)
	_, _ = rand.Read(random)
	name := hex.EncodeToString(random) + "-" + filepath.Base(header.Filename)
	if err := c.SaveUploadedFile(header, filepath.Join(dir, name)); err != nil {
		c.JSON(500, gin.H{"error": "Could not save file"})
		return
	}
	path := "/uploads/" + name
	userID, _ := c.Get("user_id")
	if _, err := database.DB.Exec(`INSERT INTO media(title,file_path,media_type,original_name,size_bytes,uploaded_by) VALUES($1,$2,$3,$4,$5,$6)`, title, path, contentType, filepath.Base(header.Filename), header.Size, userID); err != nil {
		_ = os.Remove(filepath.Join(dir, name))
		c.JSON(500, gin.H{"error": "Could not save media metadata"})
		return
	}
	c.JSON(201, gin.H{"message": "Media uploaded", "file_path": path})
}
func DeleteMedia(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var path string
	if err := database.DB.QueryRow(`SELECT file_path FROM media WHERE id=$1`, id).Scan(&path); err != nil {
		c.JSON(404, gin.H{"error": "Media not found"})
		return
	}
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		dir = "/data/uploads"
	}
	_ = os.Remove(filepath.Join(dir, filepath.Base(strings.TrimPrefix(path, "/uploads/"))))
	if _, err := database.DB.Exec(`DELETE FROM media WHERE id=$1`, id); err != nil {
		c.JSON(500, gin.H{"error": "Could not delete media"})
		return
	}
	c.JSON(200, gin.H{"message": "Media deleted"})
}
