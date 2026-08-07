package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/storage"
)

// ServeAdImage — GET /media/ads/:key
// El bucket de Railway es privado, así que el sitio público no puede
// apuntar directo a una URL del bucket. Este endpoint lee el objeto del
// bucket y lo transmite al navegador, con cache de 1 día.
func ServeAdImage(c *gin.Context) {
	key := c.Param("key")

	body, contentType, err := storage.GetObject(c.Request.Context(), "ads/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()

	c.Header("Cache-Control", "public, max-age=86400")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
