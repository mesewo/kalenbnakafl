package routes

import (
	"kalenbenakafl-api/handlers"
	"kalenbenakafl-api/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine) {
	api := r.Group("/api")
	{
		// Public routes
		api.POST("/register", handlers.Register)
		api.POST("/login", handlers.Login)
		api.POST("/contact", handlers.CreateContact)

		// Public GET routes
		api.GET("/posts", handlers.GetPosts)
		api.GET("/events", handlers.GetEvents)
		api.GET("/media", handlers.GetMedia)
	}

	// Admin routes (admin only)
	admin := api.Group("/admin")
	admin.Use(middleware.AuthMiddleware())
	admin.Use(middleware.RequireRole("admin"))
	{
		admin.POST("/posts", handlers.CreatePost)
		admin.GET("/posts", handlers.GetPosts)
		admin.POST("/events", handlers.CreateEvent)
		admin.GET("/events", handlers.GetEvents)
		admin.GET("/media", handlers.GetMedia)
		admin.GET("/users", handlers.GetUsers)
	}

	// Editor routes (editor only)
	editor := api.Group("/editor")
	editor.Use(middleware.AuthMiddleware())
	editor.Use(middleware.RequireRole("editor"))
	{
		editor.POST("/posts", handlers.CreatePost)
		editor.GET("/posts", handlers.GetPosts)
		editor.POST("/events", handlers.CreateEvent)
		editor.GET("/events", handlers.GetEvents)
		editor.GET("/media", handlers.GetMedia)
	}

	protected := api.Group("/")
	protected.Use(middleware.AuthMiddleware())
	{
		protected.GET("/profile", handlers.Profile)

		// Admin only
		protected.GET(
			"/admin/dashboard",
			middleware.RequireRole("admin"),
			func(c *gin.Context) {
				c.JSON(200, gin.H{"message": "Welcome Admin"})
			},
		)

		// Admin or Editor
		protected.POST(
			"/content",
			middleware.RequireRole("admin", "editor"),
			func(c *gin.Context) {
				c.JSON(200, gin.H{"message": "Content created"})
			},
		)
	}
}
