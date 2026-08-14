package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/storage"
)

// ServeLogoImage — GET /media/logos/*key
// Sirve los logos de marca, guardados en su propia carpeta logos/ del
// bucket privado — separada de productos/ a propósito, porque un
// mismo logo se reutiliza entre varios productos (cada uno con su
// copia), mientras que las fotos en productos/ son exclusivas de cada
// producto. Usa *key (wildcard) igual que productos, por si en algún
// momento se organiza en subcarpetas.
func ServeLogoImage(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")

	body, contentType, err := storage.GetObject(c.Request.Context(), "logos/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()

	c.Header("Cache-Control", "public, max-age=86400")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
