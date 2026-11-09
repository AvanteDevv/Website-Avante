package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/storage"
)

// PublicTryonEstilos — GET /api/probador/estilos (público): los estilos
// que muestra el probador virtual, en orden.
func PublicTryonEstilos(c *gin.Context) {
	items, err := models.ListTryonEstilos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los estilos."})
		return
	}
	// Los tipos agregados desde Inventario no traen imagen: salen en el
	// probador hasta que se les sube en Elementor (los 4 de siempre se
	// dibujan con código).
	visibles := items[:0]
	for _, e := range items {
		if e.Base || e.Imagen != "" {
			visibles = append(visibles, e)
		}
	}
	c.Header("Cache-Control", "no-cache")
	c.JSON(http.StatusOK, gin.H{"items": visibles})
}

// ServeTryonImage — GET /media/probador/*key (imagen PNG del armazón).
func ServeTryonImage(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")
	if key == "" || strings.Contains(key, "/") || strings.Contains(key, "..") {
		c.Status(http.StatusNotFound)
		return
	}
	body, contentType, err := storage.GetObject(c.Request.Context(), "probador/"+key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()
	// La key cambia cada vez que se sube otra imagen: se puede guardar mucho.
	c.Header("Cache-Control", "public, max-age=2592000, immutable")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}
