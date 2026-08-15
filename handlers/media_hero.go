package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/storage"
)

// ServeHeroVideo — GET /media/hero/:key
// Igual que ServeAdImage pero para el video del hero (gato-avante.webm),
// guardado en la carpeta hero/ del mismo bucket privado.
func ServeHeroVideo(c *gin.Context) {
	key := c.Param("key")

	body, contentType, err := storage.GetObject(c.Request.Context(), "hero/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()

	c.Header("Cache-Control", "public, max-age=86400")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
