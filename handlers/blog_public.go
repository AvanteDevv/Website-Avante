package handlers

import (
	"database/sql"
	"html/template"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"

	"avante-optics/db"
)

// PublicBlogTag es una etiqueta asignada a una entrada publicada.
type PublicBlogTag struct {
	Name string
	Slug string
}

// PublicBlogPost es lo que ve el sitio público — solo entradas con
// status='publicado' y cuya fecha de publicación ya llegó.
type PublicBlogPost struct {
	ID            int
	Title         string
	Excerpt       string
	Content       string
	ContentHTML   template.HTML // Content ya marcado como HTML confiable (lo escribe el admin)
	ImageURL      string
	Author        string
	AuthorInitial string
	CategorySlug  string
	CategoryName  string
	PublishedAt   time.Time
	ReadMinutes   int
	Tags          []PublicBlogTag
}

var publicHTMLTagRe = regexp.MustCompile(`<[^>]*>`)

// readingMinutes estima el tiempo de lectura (~200 palabras por minuto).
func readingMinutes(html string) int {
	words := len(strings.Fields(publicHTMLTagRe.ReplaceAllString(html, " ")))
	m := (words + 199) / 200
	if m < 1 {
		m = 1
	}
	return m
}

func authorInitial(name string) string {
	for _, r := range strings.TrimSpace(name) {
		return string(unicode.ToUpper(r))
	}
	return "A"
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
		if p.Author == "" {
			p.Author = "Equipo de Avante Optics"
		}
		p.ImageURL = "/media/blog/" + imageKey
		posts = append(posts, p)
	}
	return posts, nil
}

func fetchPostTags(postID int) []PublicBlogTag {
	rows, err := db.DB.Query(`
		SELECT t.name, t.slug
		FROM blog_post_tags pt
		JOIN blog_tags t ON t.id = pt.tag_id
		WHERE pt.post_id = ?
		ORDER BY t.name
	`, postID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var tags []PublicBlogTag
	for rows.Next() {
		var t PublicBlogTag
		if rows.Scan(&t.Name, &t.Slug) == nil {
			tags = append(tags, t)
		}
	}
	return tags
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

// blogCategoryOption es una categoría para el filtro del sidebar —
// solo las que de verdad tienen alguna entrada publicada.
type blogCategoryOption struct {
	Slug string
	Name string
}

// BlogList — GET /blog
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
	if p.Author == "" {
		p.Author = "Equipo de Avante Optics"
	}
	p.AuthorInitial = authorInitial(p.Author)
	p.ImageURL = "/media/blog/" + imageKey
	// El contenido sale del editor del panel admin (solo admins escriben aquí),
	// así que se renderiza como HTML en vez de escaparse.
	p.ContentHTML = template.HTML(p.Content)
	p.ReadMinutes = readingMinutes(p.Content)
	p.Tags = fetchPostTags(p.ID)

	all, _ := fetchPublishedBlogPosts()

	// Anterior = la publicada justo antes (más vieja); Siguiente = la más nueva.
	var prev, next *PublicBlogPost
	for i := range all {
		if all[i].ID != p.ID {
			continue
		}
		if i+1 < len(all) {
			v := all[i+1]
			prev = &v
		}
		if i > 0 {
			v := all[i-1]
			next = &v
		}
		break
	}

	// Relacionados: primero de la misma categoría, luego el resto, máx. 3.
	var related []PublicBlogPost
	for _, r := range all {
		if r.ID != p.ID && r.CategorySlug == p.CategorySlug && len(related) < 3 {
			related = append(related, r)
		}
	}
	for _, r := range all {
		if len(related) >= 3 {
			break
		}
		if r.ID == p.ID || r.CategorySlug == p.CategorySlug {
			continue
		}
		related = append(related, r)
	}

	c.HTML(http.StatusOK, "blog-detalle.html", WithUser(c, gin.H{
		"ActivePage": "blog",
		"Post":       p,
		"Prev":       prev,
		"Next":       next,
		"Related":    related,
	}))
}
