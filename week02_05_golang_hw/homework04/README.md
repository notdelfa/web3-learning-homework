# Homework04 个人博客 API

Gin + GORM + JWT + SQLite

## 运行

```bash
cd homework/homework04
go mod tidy
go run .
```

服务地址：`http://localhost:8080`

**浏览器测试页**：打开 http://localhost:8080/ 可在页面上测试全部接口（Token 自动保存）。

## 接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/register | 否 | 注册 |
| POST | /api/login | 否 | 登录，返回 token |
| GET | /api/posts | 否 | 文章列表 |
| GET | /api/posts/:id | 否 | 文章详情 |
| POST | /api/posts | Bearer | 创建文章 |
| PUT | /api/posts/:id | Bearer | 更新（仅作者） |
| DELETE | /api/posts/:id | Bearer | 删除（仅作者） |
| GET | /api/posts/:id/comments | 否 | 评论列表 |
| POST | /api/posts/:id/comments | Bearer | 发表评论 |

Header：`Authorization: Bearer <token>`

## Postman 测试示例

1. 注册：`POST /api/register`
   ```json
   {"username":"alice","password":"123456","email":"alice@example.com"}
   ```
2. 登录：`POST /api/login`
   ```json
   {"username":"alice","password":"123456"}
   ```
3. 创建文章：`POST /api/posts`（带 token）
   ```json
   {"title":"Hello","content":"first post"}
   ```
4. 评论：`POST /api/posts/1/comments`
   ```json
   {"content":"nice post"}
   ```
