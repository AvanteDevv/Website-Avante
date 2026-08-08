package admin

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/db"
)

type BlogCategory struct {
	ID   int
	Name string
	Slug string
}

type BlogTag struct {
	ID   int
	Name string
	Slug string
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugNonAlnum.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func fetchCategories() ([]BlogCategory, error) {
	rows, err := db.DB.Query(`SELECT id, name, slug FROM blog_categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BlogCategory
	for rows.Next() {
		var c BlogCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug); err == nil {
			out = append(out, c)
		}
	}
	return out, nil
}

func fetchTags() ([]BlogTag, error) {
	rows, err := db.DB.Query(`SELECT id, name, slug FROM blog_tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BlogTag
	for rows.Next() {
		var t BlogTag
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug); err == nil {
			out = append(out, t)
		}
	}
	return out, nil
}

type taxonomyInput struct {
	Name string `json:"name" binding:"required"`
}

// CreateBlogCategory — POST /api/admin/blog-categorias
func CreateBlogCategory(c *gin.Context) {
	var input taxonomyInput
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un nombre para la categoría."})
		return
	}
	slug := slugify(input.Name)
	if slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nombre inválido."})
		return
	}
	res, err := db.DB.Exec(`INSERT INTO blog_categories (name, slug) VALUES (?, ?)`, strings.TrimSpace(input.Name), slug)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una categoría con ese nombre."})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": strings.TrimSpace(input.Name), "slug": slug})
}

// DeleteBlogCategory — DELETE /api/admin/blog-categorias/:id
func DeleteBlogCategory(c *gin.Context) {
	id := c.Param("id")
	if _, err := db.DB.Exec(`DELETE FROM blog_categories WHERE id = ?`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar la categoría."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// CreateBlogTag — POST /api/admin/blog-etiquetas
func CreateBlogTag(c *gin.Context) {
	var input taxonomyInput
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un nombre para la etiqueta."})
		return
	}
	slug := slugify(input.Name)
	if slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nombre inválido."})
		return
	}
	res, err := db.DB.Exec(`INSERT INTO blog_tags (name, slug) VALUES (?, ?)`, strings.TrimSpace(input.Name), slug)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una etiqueta con ese nombre."})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": strings.TrimSpace(input.Name), "slug": slug})
}

// DeleteBlogTag — DELETE /api/admin/blog-etiquetas/:id
func DeleteBlogTag(c *gin.Context) {
	id := c.Param("id")
	if _, err := db.DB.Exec(`DELETE FROM blog_tags WHERE id = ?`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar la etiqueta."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
