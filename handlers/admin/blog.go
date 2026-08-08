package admin

import (
	"database/sql"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/db"
	"avante-optics/storage"
)

// BlogPost representa una entrada del blog público.
type BlogPost struct {
	ID          int
	Title       string
	Category    string // guias | novedades | marca | tendencias
	Excerpt     string
	Content     string
	ImageKey    string
	ImageURL    string // /media/blog/<ImageKey>
	Author      string
	Status      string // borrador | publicado
	PublishedAt time.Time
	CreatedAt   time.Time
}

// Blogs — GET /admin/blogs — listado con contadores.
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
	var publicadas, borradores int

	for rows.Next() {
		var b BlogPost
		var author sql.NullString
		if err := rows.Scan(&b.ID, &b.Title, &b.Category, &b.Excerpt, &b.ImageKey, &author, &b.Status, &b.PublishedAt, &b.CreatedAt); err != nil {
			continue
		}
		b.Author = author.String
		b.ImageURL = "/media/blog/" + b.ImageKey
		if b.Status == "publicado" {
			publicadas++
		} else {
			borradores++
		}
		blogs = append(blogs, b)
	}

	c.HTML(http.StatusOK, "blogs.html", gin.H{
		"ActivePage": "admin-blogs",
		"Blogs":      blogs,
		"TotalBlogs": len(blogs),
		"Publicadas": publicadas,
		"Borradores": borradores,
	})
}

// NewBlogForm — GET /admin/blogs/nuevo
func NewBlogForm(c *gin.Context) {
	c.HTML(http.StatusOK, "crear-blog.html", gin.H{
		"ActivePage": "admin-blogs",
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

	c.HTML(http.StatusOK, "crear-blog.html", gin.H{
		"ActivePage": "admin-blogs",
		"Blog":       b,
	})
}

var allowedBlogImageExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}

func parseBlogForm(c *gin.Context) (title, excerpt, content, category, status, author string, err error) {
	title = strings.TrimSpace(c.PostForm("title"))
	excerpt = strings.TrimSpace(c.PostForm("excerpt"))
	content = strings.TrimSpace(c.PostForm("content"))
	category = c.PostForm("category")
	status = c.PostForm("status")
	author = strings.TrimSpace(c.PostForm("author"))
	if author == "" {
		author = "Equipo de Avante Optics"
	}

	if title == "" || excerpt == "" || content == "" {
		err = fmt.Errorf("título, extracto y contenido son obligatorios")
		return
	}
	validCategory := map[string]bool{"guias": true, "novedades": true, "marca": true, "tendencias": true}
	if !validCategory[category] {
		err = fmt.Errorf("categoría inválida")
		return
	}
	if status != "borrador" && status != "publicado" {
		status = "borrador"
	}
	return title, excerpt, content, category, status, author, nil
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

// CreateBlog — POST /api/admin/blogs (multipart/form-data)
func CreateBlog(c *gin.Context) {
	title, excerpt, content, category, status, author, err := parseBlogForm(c)
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
		VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
	`, title, category, excerpt, content, imageKey, author, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la entrada."})
		return
	}

	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// UpdateBlog — PUT /api/admin/blogs/:id (multipart/form-data; "image" es opcional)
func UpdateBlog(c *gin.Context) {
	id := c.Param("id")

	title, excerpt, content, category, status, author, err := parseBlogForm(c)
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
			UPDATE blog_posts SET title=?, category=?, excerpt=?, content=?, image_key=?, author=?, status=?
			WHERE id=?
		`, title, category, excerpt, content, newImageKey, author, status, id)
		if oldImageKey != "" {
			storage.DeleteObject(c.Request.Context(), "blog/"+oldImageKey)
		}
	} else {
		_, err = db.DB.Exec(`
			UPDATE blog_posts SET title=?, category=?, excerpt=?, content=?, author=?, status=?
			WHERE id=?
		`, title, category, excerpt, content, author, status, id)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar la entrada."})
		return
	}
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
