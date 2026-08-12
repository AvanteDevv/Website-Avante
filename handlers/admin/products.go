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

// allowedProductIcons son las mismas 3 formas de lente que ya usa la
// tienda pública (index/eccomerce) para el ícono de respaldo de cada
// tarjeta — no se puede guardar cualquier valor aquí.
var allowedProductIcons = map[string]bool{"sun": true, "square": true, "round": true}

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

// parseProductForm lee y valida los campos comunes a crear/editar.
func parseProductForm(c *gin.Context) (title, brand, year, model, icon, badge, description string, price, oldPrice float64, err error) {
	title = strings.TrimSpace(c.PostForm("title"))
	brand = strings.TrimSpace(c.PostForm("brand"))
	year = strings.TrimSpace(c.PostForm("year"))
	model = strings.TrimSpace(c.PostForm("model"))
	icon = c.PostForm("icon")
	badge = strings.TrimSpace(c.PostForm("badge"))
	description = strings.TrimSpace(c.PostForm("description"))

	if title == "" {
		err = fmt.Errorf("el título es obligatorio")
		return
	}
	if brand == "" {
		err = fmt.Errorf("la marca es obligatoria")
		return
	}
	if !allowedProductIcons[icon] {
		err = fmt.Errorf("elige una forma de lente válida")
		return
	}

	priceStr := strings.TrimSpace(c.PostForm("price"))
	price, perr := strconv.ParseFloat(priceStr, 64)
	if perr != nil || price < 0 {
		err = fmt.Errorf("ingresa un precio válido")
		return
	}

	oldPriceStr := strings.TrimSpace(c.PostForm("old_price"))
	if oldPriceStr != "" {
		oldPrice, err = strconv.ParseFloat(oldPriceStr, 64)
		if err != nil || oldPrice < 0 {
			err = fmt.Errorf("el precio anterior no es válido")
			return
		}
	}
	err = nil
	return
}

// CreateProduct — POST /api/admin/productos (multipart/form-data)
func CreateProduct(c *gin.Context) {
	title, brand, year, model, icon, badge, description, price, oldPrice, err := parseProductForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imageKey, err := uploadProductImage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id, err := models.CreateProduct(title, brand, year, model, price, oldPrice, icon, badge, description, imageKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el producto."})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":       id,
		"imageUrl": "/media/productos/" + imageKey,
	})
}

// UpdateProduct — PUT /api/admin/productos/:id (multipart/form-data; "image" es opcional)
func UpdateProduct(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de producto inválido."})
		return
	}

	title, brand, year, model, icon, badge, description, price, oldPrice, err := parseProductForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// La imagen es opcional al editar: si mandaron una nueva, la
	// subimos y luego borramos la anterior del bucket; si no, el
	// modelo conserva el image_key que ya tenía.
	var newImageKey string
	if _, _, ferr := c.Request.FormFile("image"); ferr == nil {
		newImageKey, err = uploadProductImage(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	var oldImageKey string
	if newImageKey != "" {
		oldImageKey, _ = models.GetProductImageKey(id)
	}

	if err := models.UpdateProduct(id, title, brand, year, model, price, oldPrice, icon, badge, description, newImageKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar el producto."})
		return
	}

	if newImageKey != "" && oldImageKey != "" {
		storage.DeleteObject(c.Request.Context(), "productos/"+oldImageKey)
	}

	imageURL := ""
	if newImageKey != "" {
		imageURL = "/media/productos/" + newImageKey
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "imageUrl": imageURL})
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
