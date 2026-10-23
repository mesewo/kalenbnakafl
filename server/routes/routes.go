package routes

import (
	"database/sql"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/handlers"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/middleware"
)

func SetupRoutes(r *gin.Engine, q *dbgen.Queries, db *sql.DB, cfg config.Config) {
	apiHandlers := handlers.NewAPI(q, db, cfg)
	api := r.Group("/api")
	api.Use(middleware.RequireSessionOrigin(cfg.CORSOrigins))
	publicLimit := middleware.LimitRequests(30, time.Minute)
	authLimit := middleware.LimitRequests(10, time.Minute)
	loginLimit := middleware.LimitLoginRequests(middleware.NewMemoryLimiter(10000), 10, time.Minute)
	api.POST("/register", authLimit, apiHandlers.Register)
	api.POST("/login", loginLimit, apiHandlers.Login)
	api.POST("/refresh", authLimit, apiHandlers.Refresh)
	api.POST("/logout", apiHandlers.Logout)
	api.POST("/contact", publicLimit, apiHandlers.CreateContact)
	api.GET("/posts", apiHandlers.GetPosts)
	api.GET("/posts/:slug", apiHandlers.GetPostBySlug)
	api.GET("/events", apiHandlers.GetEvents)
	api.GET("/events/:id", apiHandlers.GetEventByID)
	api.GET("/media", apiHandlers.GetMedia)
	staff := api.Group("/staff")
	staff.Use(middleware.AuthMiddleware(q, cfg.JWTSecret), middleware.RequireRole("admin", "editor"))
	staff.GET("/posts", apiHandlers.GetPosts)
	staff.POST("/posts", apiHandlers.CreatePost)
	staff.PATCH("/posts/:id", apiHandlers.UpdatePost)
	staff.DELETE("/posts/:id", apiHandlers.DeletePost)
	staff.PATCH("/posts/:id/publish", apiHandlers.PublishPost)
	staff.GET("/events", apiHandlers.GetEvents)
	staff.POST("/events", apiHandlers.CreateEvent)
	staff.PATCH("/events/:id", apiHandlers.UpdateEvent)
	staff.DELETE("/events/:id", apiHandlers.DeleteEvent)
	staff.GET("/media", apiHandlers.GetMedia)
	staff.POST("/media", apiHandlers.UploadMedia)
	staff.DELETE("/media/:id", apiHandlers.DeleteMedia)
	admin := api.Group("/admin")
	admin.Use(middleware.AuthMiddleware(q, cfg.JWTSecret), middleware.RequireRole("admin"))
	admin.GET("/users", apiHandlers.GetUsers)
	admin.POST("/users", apiHandlers.CreateUser)
	admin.PATCH("/users/:id", apiHandlers.UpdateUser)
	admin.DELETE("/users/:id", apiHandlers.DeleteUser)
	admin.GET("/volunteers", apiHandlers.GetVolunteers)
	admin.POST("/volunteers/:id/contributions", apiHandlers.AddContribution)
	protected := api.Group("/")
	protected.Use(middleware.AuthMiddleware(q, cfg.JWTSecret))
	protected.GET("/me", apiHandlers.Me)
	protected.GET("/profile", apiHandlers.Profile)
	protected.PUT("/profile", apiHandlers.UpdateProfile)
}
