package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/storage"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida
// con el nombre del módulo en tu go.mod.

// ServeCarouselImage — GET /media/carrusel/*key
// Sirve las imágenes del carrusel de marcas (franja de scroll infinito
// de index.html) directo desde el bucket, carpeta carrusel-photos/.
// Mismo patrón que ServeLogoImage/ServeProductImage.
func ServeCarouselImage(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")
	if key == "" {
		c.Status(http.StatusNotFound)
		return
	}

	body, contentType, err := storage.GetObject(c.Request.Context(), "carrusel-photos/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()

	c.Header("Cache-Control", "public, max-age=86400")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
