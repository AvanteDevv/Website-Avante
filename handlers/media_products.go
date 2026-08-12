package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/storage"
)

// ServeProductImage — GET /media/productos/*key
// Igual que ServeAdImage/ServeBlogImage pero para las imágenes de
// productos, guardadas en la carpeta productos/ del bucket privado —
// con la diferencia de que aquí SÍ puede venir con subcarpeta (cada
// producto tiene la suya, ej. productos/lentes-plex-a3f9k2/archivo.jpg),
// así que la ruta usa *key (wildcard) en vez de :key para que Gin deje
// pasar la "/" de en medio. El wildcard de Gin siempre trae una "/" al
// inicio del valor capturado, por eso se recorta con TrimPrefix.
func ServeProductImage(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")

	body, contentType, err := storage.GetObject(c.Request.Context(), "productos/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()

	c.Header("Cache-Control", "public, max-age=86400")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
