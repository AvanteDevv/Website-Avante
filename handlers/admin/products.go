package admin

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/storage"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// Products — GET /admin/productos
func Products(c *gin.Context) {
	products, err := models.GetAllProducts()
	if err != nil {
		c.HTML(http.StatusOK, "productos.html", gin.H{
			"ActivePage":     "admin-productos",
			"ProductosError": "No se pudieron cargar los productos en este momento.",
		})
		return
	}

	c.HTML(http.StatusOK, "productos.html", gin.H{
		"ActivePage": "admin-productos",
		"Productos":  products,
		"Total":      len(products),
	})
}

var allowedProductImageExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}

// uploadProductImage sube la imagen del form (campo "image") al bucket
// bajo productos/ y regresa el nombre de archivo generado.
func uploadProductImage(c *gin.Context) (string, error) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		return "", fmt.Errorf("selecciona la imagen de la marca")
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedProductImageExt[ext] {
		return "", fmt.Errorf("formato de imagen no soportado (usa JPG, PNG o WEBP)")
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := storage.UploadObject(c.Request.Context(), "productos/"+filename, file, header.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir la imagen al bucket")
	}
	return filename, nil
}

// CreateProduct — POST /api/admin/productos (multipart/form-data)
func CreateProduct(c *gin.Context) {
	title := strings.TrimSpace(c.PostForm("title"))
	brand := strings.TrimSpace(c.PostForm("brand"))
	year := strings.TrimSpace(c.PostForm("year"))
	model := strings.TrimSpace(c.PostForm("model"))

	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El título es obligatorio."})
		return
	}
	if brand == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La marca es obligatoria."})
		return
	}

	imageKey, err := uploadProductImage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id, err := models.CreateProduct(title, brand, year, model, imageKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el producto."})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":       id,
		"imageUrl": "/media/productos/" + imageKey,
	})
}

// DeleteProduct — DELETE /api/admin/productos/:id
func DeleteProduct(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de producto inválido."})
		return
	}

	imageKey, err := models.DeleteProduct(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado."})
		return
	}

	// Borrado del bucket best-effort: si falla, no tumbamos la
	// respuesta — el registro en BD ya se fue.
	if imageKey != "" {
		storage.DeleteObject(c.Request.Context(), "productos/"+imageKey)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
