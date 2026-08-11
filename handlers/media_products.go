package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/storage"
)

// ServeProductImage — GET /media/productos/:key
// Igual que ServeAdImage/ServeBlogImage pero para las imágenes de marca
// del catálogo de productos, guardadas en la carpeta productos/ del
// bucket privado.
func ServeProductImage(c *gin.Context) {
	key := c.Param("key")

	body, contentType, err := storage.GetObject(c.Request.Context(), "productos/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()

	c.Header("Cache-Control", "public, max-age=86400")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
