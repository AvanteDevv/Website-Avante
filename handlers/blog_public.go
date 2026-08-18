package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/db"
)

// PublicBlogPost es lo que ve el sitio público — solo entradas con
// status='publicado' y cuya fecha de publicación ya llegó.
type PublicBlogPost struct {
	ID           int
	Title        string
	Excerpt      string
	Content      string
	ImageURL     string
	Author       string
	CategorySlug string
	CategoryName string
	PublishedAt  time.Time
}

func fetchPublishedBlogPosts() ([]PublicBlogPost, error) {
	rows, err := db.DB.Query(`
		SELECT p.id, p.title, p.excerpt, p.image_key, p.author, p.category, p.published_at,
		       COALESCE(c.name, p.category) AS category_name
		FROM blog_posts p
		LEFT JOIN blog_categories c ON c.slug = p.category
		WHERE p.status = 'publicado' AND p.published_at <= NOW()
		ORDER BY p.published_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []PublicBlogPost
	for rows.Next() {
		var p PublicBlogPost
		var imageKey string
		var author sql.NullString
		if err := rows.Scan(&p.ID, &p.Title, &p.Excerpt, &imageKey, &author, &p.CategorySlug, &p.PublishedAt, &p.CategoryName); err != nil {
			continue
		}
		p.Author = author.String
		p.ImageURL = "/media/blog/" + imageKey
		posts = append(posts, p)
	}
	return posts, nil
}

// RecentBlogPosts regresa hasta `limit` entradas publicadas más
// recientes, para secciones como el bloque de blog de index.html que
// solo necesitan un adelanto (no la lista completa de /blog).
func RecentBlogPosts(limit int) []PublicBlogPost {
	posts, err := fetchPublishedBlogPosts()
	if err != nil {
		return nil
	}
	if len(posts) > limit {
		posts = posts[:limit]
	}
	return posts
}

// BlogList — GET /blog
// blogCategoryOption es una categoría para el filtro del sidebar —
// solo las que de verdad tienen alguna entrada publicada.
type blogCategoryOption struct {
	Slug string
	Name string
}

func BlogList(c *gin.Context) {
	posts, err := fetchPublishedBlogPosts()
	data := gin.H{"ActivePage": "blog"}
	if err == nil && len(posts) > 0 {
		data["Featured"] = posts[0]
		data["Posts"] = posts[1:]
	} else {
		data["Posts"] = posts // vacío o error: la plantilla ya maneja "sin entradas"
	}

	seen := map[string]bool{}
	var categories []blogCategoryOption
	for _, p := range posts {
		if !seen[p.CategorySlug] {
			seen[p.CategorySlug] = true
			categories = append(categories, blogCategoryOption{Slug: p.CategorySlug, Name: p.CategoryName})
		}
	}
	data["Categories"] = categories

	c.HTML(http.StatusOK, "blog.html", WithUser(c, data))
}

// BlogDetail — GET /blog/:id
func BlogDetail(c *gin.Context) {
	id := c.Param("id")

	var p PublicBlogPost
	var imageKey string
	var author sql.NullString
	err := db.DB.QueryRow(`
		SELECT p.id, p.title, p.excerpt, p.content, p.image_key, p.author, p.category, p.published_at,
		       COALESCE(c.name, p.category) AS category_name
		FROM blog_posts p
		LEFT JOIN blog_categories c ON c.slug = p.category
		WHERE p.id = ? AND p.status = 'publicado' AND p.published_at <= NOW()
	`, id).Scan(&p.ID, &p.Title, &p.Excerpt, &p.Content, &imageKey, &author, &p.CategorySlug, &p.PublishedAt, &p.CategoryName)
	if err != nil {
		c.HTML(http.StatusNotFound, "blog-detalle.html", WithUser(c, gin.H{
			"ActivePage": "blog",
			"NotFound":   true,
		}))
		return
	}
	p.Author = author.String
	p.ImageURL = "/media/blog/" + imageKey

	related, _ := fetchPublishedBlogPosts()
	var relatedList []PublicBlogPost
	for _, r := range related {
		if r.ID != p.ID {
			relatedList = append(relatedList, r)
		}
		if len(relatedList) == 3 {
			break
		}
	}

	c.HTML(http.StatusOK, "blog-detalle.html", WithUser(c, gin.H{
		"ActivePage": "blog",
		"Post":       p,
		"Related":    relatedList,
	}))
}
