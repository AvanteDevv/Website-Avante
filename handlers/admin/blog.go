package admin

import (
	"database/sql"
	"fmt"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/db"
	"avante-optics/storage"
)

// BlogPost representa una entrada del blog público.
type BlogPost struct {
	ID               int
	Title            string
	Category         string // slug de blog_categories
	Excerpt          string // se genera del contenido, no lo llena el admin
	Content          string
	ImageKey         string
	ImageURL         string // /media/blog/<ImageKey>
	Author           string
	Status           string // borrador | publicado (lo que eligió el admin)
	DisplayStatus    string // borrador | programado | publicado (calculado contra la fecha)
	PublishedAt      time.Time
	PublishedDateVal string // para <input type="date">
	PublishedTimeVal string // para <input type="time">
	CreatedAt        time.Time
	TagIDs           []int
	CategoryName     string // solo se llena en EditBlogForm, para el label del dropdown
}

func computeBlogDisplayStatus(status string, publishedAt time.Time) string {
	if status != "publicado" {
		return "borrador"
	}
	if time.Now().Before(publishedAt) {
		return "programado"
	}
	return "publicado"
}

// stripHTML quita etiquetas para generar el extracto de la tarjeta del blog
// a partir del contenido (el admin ya no escribe un extracto aparte).
var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

func excerptFromContent(html string) string {
	text := htmlTagRe.ReplaceAllString(html, " ")
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) > 200 {
		return string(runes[:197]) + "..."
	}
	return text
}

// Blogs — GET /admin/blogs — listado con contadores, categorías y etiquetas.
func Blogs(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT id, title, category, excerpt, image_key, author, status, published_at, created_at
		FROM blog_posts
		ORDER BY created_at DESC
	`)
	if err != nil {
		c.HTML(http.StatusOK, "blogs.html", gin.H{
			"ActivePage": "admin-blogs",
			"BlogsError": "No se pudieron cargar las entradas.",
		})
		return
	}
	defer rows.Close()

	var blogs []BlogPost
	var publicadas, borradores, programadas int

	for rows.Next() {
		var b BlogPost
		var author sql.NullString
		if err := rows.Scan(&b.ID, &b.Title, &b.Category, &b.Excerpt, &b.ImageKey, &author, &b.Status, &b.PublishedAt, &b.CreatedAt); err != nil {
			continue
		}
		b.Author = author.String
		b.ImageURL = "/media/blog/" + b.ImageKey
		b.DisplayStatus = computeBlogDisplayStatus(b.Status, b.PublishedAt)
		switch b.DisplayStatus {
		case "publicado":
			publicadas++
		case "programado":
			programadas++
		default:
			borradores++
		}
		blogs = append(blogs, b)
	}

	categories, _ := fetchCategories()
	tags, _ := fetchTags()

	c.HTML(http.StatusOK, "blogs.html", gin.H{
		"ActivePage":  "admin-blogs",
		"Blogs":       blogs,
		"TotalBlogs":  len(blogs),
		"Publicadas":  publicadas,
		"Programadas": programadas,
		"Borradores":  borradores,
		"Categories":  categories,
		"Tags":        tags,
	})
}

// NewBlogForm — GET /admin/blogs/nuevo
func NewBlogForm(c *gin.Context) {
	categories, _ := fetchCategories()
	tags, _ := fetchTags()
	c.HTML(http.StatusOK, "crear-blog.html", gin.H{
		"ActivePage": "admin-blogs",
		"Categories": categories,
		"Tags":       tags,
	})
}

// EditBlogForm — GET /admin/blogs/:id/editar
func EditBlogForm(c *gin.Context) {
	id := c.Param("id")

	var b BlogPost
	var author sql.NullString
	err := db.DB.QueryRow(`
		SELECT id, title, category, excerpt, content, image_key, author, status, published_at, created_at
		FROM blog_posts WHERE id = ?
	`, id).Scan(&b.ID, &b.Title, &b.Category, &b.Excerpt, &b.Content, &b.ImageKey, &author, &b.Status, &b.PublishedAt, &b.CreatedAt)
	if err != nil {
		c.HTML(http.StatusOK, "crear-blog.html", gin.H{
			"ActivePage": "admin-blogs",
			"BlogError":  "No se encontró esa entrada.",
		})
		return
	}
	b.Author = author.String
	b.ImageURL = "/media/blog/" + b.ImageKey
	b.PublishedDateVal = b.PublishedAt.Format("2006-01-02")
	b.PublishedTimeVal = b.PublishedAt.Format("15:04")

	tagRows, err := db.DB.Query(`SELECT tag_id FROM blog_post_tags WHERE post_id = ?`, id)
	selectedTags := map[int]bool{}
	if err == nil {
		defer tagRows.Close()
		for tagRows.Next() {
			var tid int
			if tagRows.Scan(&tid) == nil {
				selectedTags[tid] = true
			}
		}
	}

	categories, _ := fetchCategories()
	tags, _ := fetchTags()

	for _, cat := range categories {
		if cat.Slug == b.Category {
			b.CategoryName = cat.Name
			break
		}
	}

	c.HTML(http.StatusOK, "crear-blog.html", gin.H{
		"ActivePage":   "admin-blogs",
		"Blog":         b,
		"Categories":   categories,
		"Tags":         tags,
		"SelectedTags": selectedTags,
	})
}

var allowedBlogImageExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}

type blogFormData struct {
	Title       string
	Content     string
	Excerpt     string
	Category    string
	Status      string
	Author      string
	PublishedAt time.Time
	TagIDs      []string
}

func parseBlogForm(c *gin.Context) (blogFormData, error) {
	var f blogFormData
	f.Title = strings.TrimSpace(c.PostForm("title"))
	f.Content = strings.TrimSpace(c.PostForm("content"))
	f.Category = c.PostForm("category")
	f.Status = c.PostForm("status")
	f.Author = strings.TrimSpace(c.PostForm("author"))
	f.TagIDs = c.PostFormArray("tags")
	if f.Author == "" {
		f.Author = "Equipo de Avante Optics"
	}

	if f.Title == "" || f.Content == "" {
		return f, fmt.Errorf("el título y el contenido son obligatorios")
	}
	if f.Category == "" {
		return f, fmt.Errorf("elige una categoría")
	}
	if f.Status != "borrador" && f.Status != "publicado" {
		f.Status = "borrador"
	}
	f.Excerpt = excerptFromContent(f.Content)

	dateVal := c.PostForm("published_date")
	timeVal := c.PostForm("published_time")
	if dateVal != "" && timeVal != "" {
		parsed, err := time.ParseInLocation("2006-01-02 15:04", dateVal+" "+timeVal, hermosilloLoc)
		if err == nil {
			f.PublishedAt = parsed
		}
	}
	if f.PublishedAt.IsZero() {
		f.PublishedAt = time.Now()
	}
	return f, nil
}

func uploadBlogImage(c *gin.Context) (string, error) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		return "", fmt.Errorf("selecciona una imagen de portada")
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedBlogImageExt[ext] {
		return "", fmt.Errorf("formato de imagen no soportado (usa JPG, PNG o WEBP)")
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := storage.UploadObject(c.Request.Context(), "blog/"+filename, file, header.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir la imagen al bucket")
	}
	return filename, nil
}

func syncBlogTags(postID string, tagIDs []string) {
	db.DB.Exec(`DELETE FROM blog_post_tags WHERE post_id = ?`, postID)
	for _, tid := range tagIDs {
		db.DB.Exec(`INSERT IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)`, postID, tid)
	}
}

// CreateBlog — POST /api/admin/blogs (multipart/form-data)
func CreateBlog(c *gin.Context) {
	f, err := parseBlogForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imageKey, err := uploadBlogImage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec(`
		INSERT INTO blog_posts (title, category, excerpt, content, image_key, author, status, published_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
	`, f.Title, f.Category, f.Excerpt, f.Content, imageKey, f.Author, f.Status, f.PublishedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la entrada."})
		return
	}

	id, _ := res.LastInsertId()
	syncBlogTags(fmt.Sprint(id), f.TagIDs)
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// UpdateBlog — PUT /api/admin/blogs/:id (multipart/form-data; "image" es opcional)
func UpdateBlog(c *gin.Context) {
	id := c.Param("id")

	f, err := parseBlogForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var newImageKey string
	if _, _, ferr := c.Request.FormFile("image"); ferr == nil {
		newImageKey, err = uploadBlogImage(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if newImageKey != "" {
		var oldImageKey string
		db.DB.QueryRow(`SELECT image_key FROM blog_posts WHERE id = ?`, id).Scan(&oldImageKey)

		_, err = db.DB.Exec(`
			UPDATE blog_posts SET title=?, category=?, excerpt=?, content=?, image_key=?, author=?, status=?, published_at=?
			WHERE id=?
		`, f.Title, f.Category, f.Excerpt, f.Content, newImageKey, f.Author, f.Status, f.PublishedAt, id)
		if oldImageKey != "" {
			storage.DeleteObject(c.Request.Context(), "blog/"+oldImageKey)
		}
	} else {
		_, err = db.DB.Exec(`
			UPDATE blog_posts SET title=?, category=?, excerpt=?, content=?, author=?, status=?, published_at=?
			WHERE id=?
		`, f.Title, f.Category, f.Excerpt, f.Content, f.Author, f.Status, f.PublishedAt, id)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar la entrada."})
		return
	}
	syncBlogTags(id, f.TagIDs)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteBlog — DELETE /api/admin/blogs/:id
func DeleteBlog(c *gin.Context) {
	id := c.Param("id")

	var imageKey string
	if err := db.DB.QueryRow(`SELECT image_key FROM blog_posts WHERE id = ?`, id).Scan(&imageKey); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entrada no encontrada."})
		return
	}

	if _, err := db.DB.Exec(`DELETE FROM blog_posts WHERE id = ?`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar la entrada."})
		return
	}

	if imageKey != "" {
		storage.DeleteObject(c.Request.Context(), "blog/"+imageKey)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
