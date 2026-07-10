package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var (
	db        *gorm.DB
	jwtSecret = []byte("homework04-secret")
)

// ========== 模型 ==========

type User struct {
	gorm.Model
	Username string `gorm:"unique;not null" json:"username"`
	Password string `gorm:"not null" json:"-"`
	Email    string `gorm:"unique;not null" json:"email"`
}

type Post struct {
	gorm.Model
	Title    string    `gorm:"not null" json:"title"`
	Content  string    `gorm:"not null" json:"content"`
	UserID   uint      `json:"user_id"`
	User     User      `json:"user,omitempty"`
	Comments []Comment `json:"comments,omitempty"`
}

type Comment struct {
	gorm.Model
	Content string `gorm:"not null" json:"content"`
	UserID  uint   `json:"user_id"`
	User    User   `json:"user,omitempty"`
	PostID  uint   `json:"post_id"`
}

type claims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// ========== 入口 ==========

func main() {
	initDB()

	r := gin.Default()
	r.GET("/", func(c *gin.Context) { c.File("static/index.html") })
	r.GET("/health", func(c *gin.Context) { ok(c, gin.H{"status": "ok"}) })

	api := r.Group("/api")
	api.POST("/register", register)
	api.POST("/login", login)

	api.GET("/posts", listPosts)
	api.GET("/posts/:id", getPost)
	api.GET("/posts/:id/comments", listComments)

	auth := api.Group("")
	auth.Use(jwtAuth())
	auth.POST("/posts", createPost)
	auth.PUT("/posts/:id", updatePost)
	auth.DELETE("/posts/:id", deletePost)
	auth.POST("/posts/:id/comments", createComment)

	log.Println("blog API :8080  测试页 http://localhost:8080/")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}

func initDB() {
	_ = os.MkdirAll("db", 0755)
	var err error
	db, err = gorm.Open(sqlite.Open("db/blog.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("connect db: ", err)
	}
	if err := db.AutoMigrate(&User{}, &Post{}, &Comment{}); err != nil {
		log.Fatal("migrate: ", err)
	}
	log.Println("database ready")
}

// ========== 认证 ==========

func register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Email    string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(c, http.StatusInternalServerError, "hash password failed")
		return
	}
	user := User{Username: req.Username, Password: string(hash), Email: req.Email}
	if err := db.Create(&user).Error; err != nil {
		fail(c, http.StatusBadRequest, "username or email already exists")
		return
	}
	ok(c, gin.H{"message": "registered", "user_id": user.ID})
}

func login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	var user User
	if err := db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		fail(c, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		fail(c, http.StatusUnauthorized, "invalid username or password")
		return
	}
	token, err := signToken(user.ID, user.Username)
	if err != nil {
		fail(c, http.StatusInternalServerError, "generate token failed")
		return
	}
	ok(c, gin.H{"token": token, "user_id": user.ID, "username": user.Username})
}

func jwtAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			fail(c, http.StatusUnauthorized, "missing bearer token")
			c.Abort()
			return
		}
		cl, err := parseToken(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			fail(c, http.StatusUnauthorized, "invalid token")
			c.Abort()
			return
		}
		c.Set("userID", cl.UserID)
		c.Set("username", cl.Username)
		c.Next()
	}
}

func signToken(userID uint, username string) (string, error) {
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		},
	})
	return t.SignedString(jwtSecret)
}

func parseToken(s string) (*claims, error) {
	t, err := jwt.ParseWithClaims(s, &claims{}, func(t *jwt.Token) (any, error) {
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	cl, ok := t.Claims.(*claims)
	if !ok || !t.Valid {
		return nil, errors.New("invalid token")
	}
	return cl, nil
}

func uid(c *gin.Context) uint { return c.GetUint("userID") }

// ========== 文章 CRUD ==========

func createPost(c *gin.Context) {
	var req struct {
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	post := Post{Title: req.Title, Content: req.Content, UserID: uid(c)}
	if err := db.Create(&post).Error; err != nil {
		fail(c, http.StatusInternalServerError, "create post failed")
		return
	}
	ok(c, post)
}

func listPosts(c *gin.Context) {
	var posts []Post
	db.Preload("User").Order("id desc").Find(&posts)
	ok(c, posts)
}

func getPost(c *gin.Context) {
	var post Post
	if err := db.Preload("User").Preload("Comments.User").First(&post, c.Param("id")).Error; err != nil {
		fail(c, http.StatusNotFound, "post not found")
		return
	}
	ok(c, post)
}

func updatePost(c *gin.Context) {
	var post Post
	if err := db.First(&post, c.Param("id")).Error; err != nil {
		fail(c, http.StatusNotFound, "post not found")
		return
	}
	if post.UserID != uid(c) {
		fail(c, http.StatusForbidden, "only author can update")
		return
	}
	var req struct {
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	post.Title, post.Content = req.Title, req.Content
	db.Save(&post)
	ok(c, post)
}

func deletePost(c *gin.Context) {
	var post Post
	if err := db.First(&post, c.Param("id")).Error; err != nil {
		fail(c, http.StatusNotFound, "post not found")
		return
	}
	if post.UserID != uid(c) {
		fail(c, http.StatusForbidden, "only author can delete")
		return
	}
	db.Delete(&Comment{}, "post_id = ?", post.ID)
	db.Delete(&post)
	ok(c, gin.H{"message": "deleted"})
}

// ========== 评论 ==========

func createComment(c *gin.Context) {
	var post Post
	if err := db.First(&post, c.Param("id")).Error; err != nil {
		fail(c, http.StatusNotFound, "post not found")
		return
	}
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	comment := Comment{Content: req.Content, UserID: uid(c), PostID: post.ID}
	if err := db.Create(&comment).Error; err != nil {
		fail(c, http.StatusInternalServerError, "create comment failed")
		return
	}
	db.Preload("User").First(&comment, comment.ID)
	ok(c, comment)
}

func listComments(c *gin.Context) {
	var comments []Comment
	db.Preload("User").Where("post_id = ?", c.Param("id")).Order("id asc").Find(&comments)
	ok(c, comments)
}

// ========== 统一响应 ==========

func ok(c *gin.Context, data any)   { c.JSON(http.StatusOK, data) }
func fail(c *gin.Context, code int, msg string) {
	log.Printf("[ERROR] %s %s -> %d %s", c.Request.Method, c.Request.URL.Path, code, msg)
	c.JSON(code, gin.H{"error": msg})
}
