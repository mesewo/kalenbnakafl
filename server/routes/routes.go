package routes

import (
	"database/sql"
	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/handlers"
	"kalenbnakafl/middleware"
	"time"
)

func SetupRoutes(r *gin.Engine, q *dbgen.Queries, db *sql.DB) {
	apiHandlers := handlers.NewAPI(q, db)
	api := r.Group("/api")
	publicLimit := middleware.LimitRequests(30, time.Minute)
	authLimit := middleware.LimitRequests(10, time.Minute)
	api.POST("/register", authLimit, apiHandlers.Register)
	api.POST("/login", authLimit, apiHandlers.Login)
	api.POST("/refresh", authLimit, apiHandlers.Refresh)
	api.POST("/logout", apiHandlers.Logout)
	api.POST("/contact", publicLimit, apiHandlers.CreateContact)
	api.GET("/posts", apiHandlers.GetPosts)
	api.GET("/events", apiHandlers.GetEvents)
	admin := api.Group("/admin")
	admin.Use(middleware.AuthMiddleware(q), middleware.RequireRole("admin"))
	admin.GET("/posts", apiHandlers.GetPosts)
	admin.POST("/posts", apiHandlers.CreatePost)
	admin.PATCH("/posts/:id", apiHandlers.UpdatePost)
	admin.DELETE("/posts/:id", apiHandlers.DeletePost)
	admin.PATCH("/posts/:id/publish", apiHandlers.PublishPost)
	admin.GET("/events", apiHandlers.GetEvents)
	admin.POST("/events", apiHandlers.CreateEvent)
	admin.PATCH("/events/:id", apiHandlers.UpdateEvent)
	admin.DELETE("/events/:id", apiHandlers.DeleteEvent)
	admin.GET("/media", apiHandlers.GetMedia)
	admin.POST("/media", apiHandlers.UploadMedia)
	admin.DELETE("/media/:id", apiHandlers.DeleteMedia)
	admin.GET("/users", apiHandlers.GetUsers)
	admin.POST("/users", apiHandlers.CreateUser)
	admin.PATCH("/users/:id", apiHandlers.UpdateUser)
	admin.DELETE("/users/:id", apiHandlers.DeleteUser)
	admin.GET("/volunteers", apiHandlers.GetVolunteers)
	admin.POST("/volunteers/:id/contributions", apiHandlers.AddContribution)
	editor := api.Group("/editor")
	editor.Use(middleware.AuthMiddleware(q), middleware.RequireRole("admin", "editor"))
	editor.GET("/posts", apiHandlers.GetPosts)
	editor.POST("/posts", apiHandlers.CreatePost)
	editor.PATCH("/posts/:id", apiHandlers.UpdatePost)
	editor.DELETE("/posts/:id", apiHandlers.DeletePost)
	editor.PATCH("/posts/:id/publish", apiHandlers.PublishPost)
	editor.GET("/events", apiHandlers.GetEvents)
	editor.POST("/events", apiHandlers.CreateEvent)
	editor.PATCH("/events/:id", apiHandlers.UpdateEvent)
	editor.DELETE("/events/:id", apiHandlers.DeleteEvent)
	editor.GET("/media", apiHandlers.GetMedia)
	editor.POST("/media", apiHandlers.UploadMedia)
	editor.DELETE("/media/:id", apiHandlers.DeleteMedia)
	protected := api.Group("/")
	protected.Use(middleware.AuthMiddleware(q))
	protected.GET("/me", apiHandlers.Me)
	protected.GET("/profile", apiHandlers.Profile)
	protected.PUT("/profile", apiHandlers.UpdateProfile)
}
