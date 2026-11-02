package admin

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/storage"
)

// Probador virtual (Elementor → Ecommerce): estilos de armazón con su
// imagen PNG frontal sin fondo. La imagen se recorta sola (quita el
// margen transparente) para que el armazón quede bien centrado sobre
// la cara.
//
//	GET    /api/admin/probador/estilos
//	POST   /api/admin/probador/estilos          (multipart: nombre, imagen)
//	PUT    /api/admin/probador/estilos/:id      (multipart: nombre, imagen?, quitar_imagen?)
//	DELETE /api/admin/probador/estilos/:id
//	PUT    /api/admin/probador/estilos-orden    {ids: [..]}

const tryonPrefix = "probador/"
const tryonMaxBytes = 6 << 20

func uploadTryonImage(c *gin.Context) (string, error) {
	fh, err := c.FormFile("imagen")
	if err != nil {
		return "", nil // no se mandó imagen
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if ext != ".png" && ext != ".webp" {
		return "", errors.New("Usa una imagen PNG o WEBP sin fondo (transparente).")
	}
	if fh.Size > tryonMaxBytes {
		return "", errors.New("La imagen pesa más de 6 MB.")
	}
	f, err := fh.Open()
	if err != nil {
		return "", errors.New("No se pudo leer la imagen.")
	}
	raw, err := io.ReadAll(f)
	f.Close()
	if err != nil {
		return "", errors.New("No se pudo leer la imagen.")
	}
	data, finalExt, procErr := autoCropLogoContent(raw, ext)
	if procErr != nil {
		data, finalExt = raw, ext
	}
	ct := "image/png"
	if finalExt == ".webp" {
		ct = "image/webp"
	}
	key := fmt.Sprintf("%d%s", time.Now().UnixNano(), finalExt)
	if err := storage.UploadObject(c.Request.Context(), tryonPrefix+key, bytes.NewReader(data), int64(len(data)), ct); err != nil {
		return "", errors.New("No se pudo subir la imagen al bucket.")
	}
	return key, nil
}

func dropTryonImage(c *gin.Context, key string) {
	if key == "" {
		return
	}
	if err := storage.DeleteObject(c.Request.Context(), tryonPrefix+key); err != nil {
		log.Printf("probador: no se borró %s: %v", key, err)
	}
}

func tryonNombre(s string) (string, error) {
	s = strings.Join(strings.Fields(s), " ")
	if s == "" {
		return "", errors.New("Escribe el nombre del estilo.")
	}
	if utf8.RuneCountInString(s) > 40 {
		return "", errors.New("El nombre es muy largo (máximo 40 letras).")
	}
	return s, nil
}

func tryonID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Estilo inválido."})
		return 0, false
	}
	return id, true
}

func ListTryonEstilos(c *gin.Context) {
	items, err := models.ListTryonEstilos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los estilos."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func CreateTryonEstilo(c *gin.Context) {
	nombre, err := tryonNombre(c.PostForm("nombre"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	key, err := uploadTryonImage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sube la imagen del armazón (PNG sin fondo)."})
		return
	}
	e, err := models.CreateTryonEstilo(nombre, key)
	if err != nil {
		dropTryonImage(c, key)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el estilo."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "item": e})
}

func UpdateTryonEstilo(c *gin.Context) {
	id, ok := tryonID(c)
	if !ok {
		return
	}
	cur, err := models.GetTryonEstilo(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese estilo ya no existe."})
		return
	}
	nombre := ""
	if v, has := c.GetPostForm("nombre"); has {
		if nombre, err = tryonNombre(v); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	key, err := uploadTryonImage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clear := c.PostForm("quitar_imagen") == "1" && key == ""
	if clear && !cur.Base {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Este estilo necesita su imagen; mejor quítalo."})
		return
	}
	oldKey, err := models.UpdateTryonEstilo(id, nombre, key, clear)
	if err != nil {
		dropTryonImage(c, key)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el estilo."})
		return
	}
	dropTryonImage(c, oldKey)
	e, _ := models.GetTryonEstilo(id)
	c.JSON(http.StatusOK, gin.H{"ok": true, "item": e})
}

func DeleteTryonEstilo(c *gin.Context) {
	id, ok := tryonID(c)
	if !ok {
		return
	}
	items, err := models.ListTryonEstilos()
	if err == nil && len(items) <= 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Debe quedar al menos un estilo en el probador."})
		return
	}
	key, err := models.DeleteTryonEstilo(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese estilo ya no existe."})
		return
	}
	dropTryonImage(c, key)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ReorderTryonEstilos(c *gin.Context) {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 || len(body.IDs) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Orden inválido."})
		return
	}
	if err := models.ReorderTryonEstilos(body.IDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el orden."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
