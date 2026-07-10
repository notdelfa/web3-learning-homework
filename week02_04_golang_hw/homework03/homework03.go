package main

import (
	"fmt"
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// ========== 题目1：模型定义 ==========

// User 用户（一对多 Post）
type User struct {
	ID        uint
	Name      string
	Email     string
	PostCount int    `gorm:"default:0"` // 文章数量统计（题目3钩子更新）
	Posts     []Post `gorm:"foreignKey:UserID"`
}

// Post 文章（属于 User，一对多 Comment）
type Post struct {
	ID            uint
	UserID        uint
	Title         string
	Content       string
	CommentStatus string    `gorm:"default:无评论"` // 评论状态（题目3钩子更新）
	User          User      `gorm:"foreignKey:UserID"`
	Comments      []Comment `gorm:"foreignKey:PostID"`
}

// Comment 评论（属于 Post）
type Comment struct {
	ID      uint
	PostID  uint
	Content string
	Post    Post `gorm:"foreignKey:PostID"`
}

// AfterCreate 创建文章后，用户文章数 +1
func (p *Post) AfterCreate(tx *gorm.DB) error {
	return tx.Model(&User{}).Where("id = ?", p.UserID).
		UpdateColumn("post_count", gorm.Expr("post_count + ?", 1)).Error
}

// AfterDelete 删除评论后，若该文章无评论则更新状态
func (c *Comment) AfterDelete(tx *gorm.DB) error {
	var count int64
	if err := tx.Model(&Comment{}).Where("post_id = ?", c.PostID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return tx.Model(&Post{}).Where("id = ?", c.PostID).
			Update("comment_status", "无评论").Error
	}
	return nil
}

func main() {
	db := openDB()
	defer closeDB(db)

	// 题目1：创建表
	if err := db.AutoMigrate(&User{}, &Post{}, &Comment{}); err != nil {
		panic(err)
	}
	fmt.Println("=== 题目1：模型与建表 ===")
	fmt.Println("users / posts / comments 表已创建")

	resetData(db)
	seedData(db)

	// 题目2：关联查询
	demoQueryUserPosts(db)
	demoQueryMostCommentedPost(db)

	// 题目3：钩子演示
	demoHooks(db)
}

func openDB() *gorm.DB {
	dir, _ := filepath.Abs("db")
	_ = os.MkdirAll(dir, 0755)
	db, err := gorm.Open(sqlite.Open(filepath.Join(dir, "blog.db")), &gorm.Config{})
	if err != nil {
		panic(err)
	}
	return db
}

func closeDB(db *gorm.DB) {
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		_ = sqlDB.Close()
	}
}

func resetData(db *gorm.DB) {
	db.Exec("DELETE FROM comments")
	db.Exec("DELETE FROM posts")
	db.Exec("DELETE FROM users")
}

func seedData(db *gorm.DB) {
	user := User{Name: "Alice", Email: "alice@example.com"}
	db.Create(&user)

	posts := []Post{
		{UserID: user.ID, Title: "Go 入门", Content: "基础语法"},
		{UserID: user.ID, Title: "GORM 实战", Content: "关联与钩子"},
	}
	db.Create(&posts)

	comments := []Comment{
		{PostID: posts[0].ID, Content: "写得很好"},
		{PostID: posts[0].ID, Content: "学到了"},
		{PostID: posts[0].ID, Content: "感谢分享"},
		{PostID: posts[1].ID, Content: "期待更新"},
	}
	db.Create(&comments)

	db.Model(&Post{}).Where("id IN ?", []uint{posts[0].ID, posts[1].ID}).
		Update("comment_status", "有评论")
}

// 题目2：查询某用户所有文章及评论
func demoQueryUserPosts(db *gorm.DB) {
	fmt.Println("\n=== 题目2：用户文章与评论 ===")

	var user User
	db.Preload("Posts.Comments").First(&user, "name = ?", "Alice")

	fmt.Printf("用户: %s (文章数: %d)\n", user.Name, user.PostCount)
	for _, p := range user.Posts {
		fmt.Printf("  文章: %s [%s]\n", p.Title, p.CommentStatus)
		for _, c := range p.Comments {
			fmt.Printf("    - 评论: %s\n", c.Content)
		}
	}
}

// 题目2：查询评论数最多的文章
func demoQueryMostCommentedPost(db *gorm.DB) {
	fmt.Println("\n=== 题目2：评论最多的文章 ===")

	type result struct {
		Post
		CommentCount int64
	}
	var top result
	db.Model(&Post{}).
		Select("posts.*, COUNT(comments.id) as comment_count").
		Joins("LEFT JOIN comments ON comments.post_id = posts.id").
		Group("posts.id").
		Order("comment_count DESC").
		Limit(1).
		Scan(&top)

	fmt.Printf("文章: %s, 评论数: %d\n", top.Title, top.CommentCount)
}

// 题目3：钩子演示
func demoHooks(db *gorm.DB) {
	fmt.Println("\n=== 题目3：钩子函数 ===")

	var user User
	db.First(&user, "name = ?", "Alice")
	fmt.Printf("当前 PostCount: %d\n", user.PostCount)

	newPost := Post{UserID: user.ID, Title: "并发入门", Content: "goroutine 与 channel"}
	db.Create(&newPost)

	db.First(&user, user.ID)
	fmt.Printf("新建文章后 PostCount: %d\n", user.PostCount)

	var post Post
	db.Preload("Comments").First(&post, "title = ?", "GORM 实战")
	fmt.Printf("删除前 [%s] 状态: %s, 评论数: %d\n", post.Title, post.CommentStatus, len(post.Comments))

	for _, c := range post.Comments {
		db.Delete(&c)
	}

	db.First(&post, post.ID)
	fmt.Printf("删除后 [%s] 状态: %s\n", post.Title, post.CommentStatus)
}
