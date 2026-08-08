package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/storage"
)

// ServeBlogImage — GET /media/blog/:key
// Igual que ServeAdImage pero para las portadas del blog, guardadas
// en la carpeta blog/ del mismo bucket privado.
func ServeBlogImage(c *gin.Context) {
	key := c.Param("key")

	body, contentType, err := storage.GetObject(c.Request.Context(), "blog/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()

	c.Header("Cache-Control", "public, max-age=86400")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
