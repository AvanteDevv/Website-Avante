package admin

import (
	"fmt"
	"mime/multipart"
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

// uploadOneImage sube un solo archivo (ya recibido como *multipart.FileHeader)
// al bucket bajo productos/ y regresa el nombre de archivo generado.
func uploadOneImage(c *gin.Context, fh *multipart.FileHeader) (string, error) {
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if !allowedProductImageExt[ext] {
		return "", fmt.Errorf("formato de imagen no soportado (usa JPG, PNG o WEBP)")
	}

	file, err := fh.Open()
	if err != nil {
		return "", fmt.Errorf("no se pudo leer la imagen")
	}
	defer file.Close()

	contentType := fh.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := storage.UploadObject(c.Request.Context(), "productos/"+filename, file, fh.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir la imagen al bucket")
	}
	return filename, nil
}

// uploadProductLogo sube el archivo del campo "logo" (uno solo).
func uploadProductLogo(c *gin.Context) (string, error) {
	_, fh, err := c.Request.FormFile("logo")
	if err != nil {
		return "", fmt.Errorf("selecciona el logo de la marca")
	}
	return uploadOneImage(c, fh)
}

// uploadProductPhotos sube todos los archivos del campo "images" (uno o
// varios) y regresa sus nombres de archivo generados, en el mismo
// orden en que se seleccionaron.
func uploadProductPhotos(c *gin.Context) ([]string, error) {
	form, err := c.MultipartForm()
	if err != nil {
		return nil, fmt.Errorf("no se pudieron leer las fotos del producto")
	}
	files := form.File["images"]
	if len(files) == 0 {
		return nil, nil
	}

	keys := make([]string, 0, len(files))
	for _, fh := range files {
		key, err := uploadOneImage(c, fh)
		if err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, nil
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
// Campos: title, brand, year, model, price, old_price, icon, badge,
// description, logo (1 archivo), images (1 o varios archivos).
func CreateProduct(c *gin.Context) {
	title, brand, year, model, icon, badge, description, price, oldPrice, err := parseProductForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	logoKey, err := uploadProductLogo(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imageKeys, err := uploadProductPhotos(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(imageKeys) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sube al menos una foto del producto."})
		return
	}

	id, err := models.CreateProduct(title, brand, year, model, price, oldPrice, icon, badge, description, logoKey, imageKeys)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el producto."})
		return
	}

	imageURLs := make([]string, len(imageKeys))
	for i, k := range imageKeys {
		imageURLs[i] = "/media/productos/" + k
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":        id,
		"logoUrl":   "/media/productos/" + logoKey,
		"imageUrls": imageURLs,
	})
}

// UpdateProduct — PUT /api/admin/productos/:id (multipart/form-data)
// "logo" e "images" son opcionales: si no mandas archivos nuevos, se
// conserva lo que ya tenía el producto.
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

	// Logo opcional al editar.
	var newLogoKey string
	if _, _, ferr := c.Request.FormFile("logo"); ferr == nil {
		newLogoKey, err = uploadProductLogo(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	// Fotos opcionales al editar: si mandan alguna, se reemplazan TODAS
	// las anteriores por las nuevas (mismo criterio simple que el logo).
	newImageKeys, err := uploadProductPhotos(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var oldLogoKey string
	if newLogoKey != "" {
		oldLogoKey, _ = models.GetProductLogoKey(id)
	}
	var oldImageKeys []string
	if len(newImageKeys) > 0 {
		oldImageKeys, _ = models.GetProductImageKeys(id)
	}

	if err := models.UpdateProduct(id, title, brand, year, model, price, oldPrice, icon, badge, description, newLogoKey, newImageKeys); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar el producto."})
		return
	}

	if newLogoKey != "" && oldLogoKey != "" {
		storage.DeleteObject(c.Request.Context(), "productos/"+oldLogoKey)
	}
	for _, k := range oldImageKeys {
		storage.DeleteObject(c.Request.Context(), "productos/"+k)
	}

	resp := gin.H{"ok": true}
	if newLogoKey != "" {
		resp["logoUrl"] = "/media/productos/" + newLogoKey
	}
	if len(newImageKeys) > 0 {
		imageURLs := make([]string, len(newImageKeys))
		for i, k := range newImageKeys {
			imageURLs[i] = "/media/productos/" + k
		}
		resp["imageUrls"] = imageURLs
	}
	c.JSON(http.StatusOK, resp)
}

// DeleteProduct — DELETE /api/admin/productos/:id
func DeleteProduct(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de producto inválido."})
		return
	}

	imageKeys, err := models.DeleteProduct(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado."})
		return
	}

	// Borrado del bucket best-effort: si falla, no tumbamos la
	// respuesta — el registro en BD ya se fue.
	for _, k := range imageKeys {
		if k != "" {
			storage.DeleteObject(c.Request.Context(), "productos/"+k)
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
