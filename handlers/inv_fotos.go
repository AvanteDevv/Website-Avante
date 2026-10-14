package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"avante-optics/models"
	"avante-optics/storage"

	"github.com/gin-gonic/gin"
)

// Fotos de artículos del inventario. El navegador ya las reduce antes de
// subirlas; aquí solo se valida que sean imágenes y que no pesen de más.
const invFotoMax = 8 << 20

var invFotoExt = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func invFotoID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("fotoId"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Foto inválida."})
		return 0, false
	}
	return id, true
}

// InvUploadFotos — POST /api/inventario/articulos/:id/fotos (multipart "files")
func InvUploadFotos(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	if !storage.Ready() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "El almacenamiento de archivos no está disponible."})
		return
	}
	if _, err := models.GetInvArticulo(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese artículo ya no existe."})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, int64(models.MaxInvFotos)*invFotoMax+(1<<20))
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No llegaron las fotos (máximo 8 MB cada una)."})
		return
	}
	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige al menos una foto."})
		return
	}
	n, err := models.CountInvFotos(id)
	if err != nil {
		invFail(c, "CountFotos", err, "No se pudieron subir las fotos.")
		return
	}
	if n+len(files) > models.MaxInvFotos {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Cada artículo puede tener hasta %d fotos (ya tiene %d).", models.MaxInvFotos, n)})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	for _, fh := range files {
		if fh.Size > invFotoMax {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Una foto pesa más de 8 MB."})
			return
		}
		f, err := fh.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer una foto."})
			return
		}
		content, err := io.ReadAll(f)
		f.Close()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer una foto."})
			return
		}
		ctype := http.DetectContentType(content)
		ext, ok := invFotoExt[ctype]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Solo se aceptan fotos JPG, PNG o WEBP."})
			return
		}
		key := fmt.Sprintf("inventario/fotos/%d-%d%s", id, time.Now().UnixNano(), ext)
		if err := storage.UploadObject(ctx, key, bytes.NewReader(content), int64(len(content)), ctype); err != nil {
			invFail(c, "UploadFoto", err, "No se pudo subir la foto.")
			return
		}
		if _, err := models.AddInvFoto(id, key, ctype); err != nil {
			storage.DeleteObject(ctx, key)
			invFail(c, "AddFoto", err, "No se pudo guardar la foto.")
			return
		}
	}
	fotos, _ := models.ListInvFotos(id)
	c.JSON(http.StatusOK, gin.H{"ok": true, "fotos": fotos})
}

// InvDeleteFoto — DELETE /api/inventario/fotos/:fotoId
func InvDeleteFoto(c *gin.Context) {
	fid, ok := invFotoID(c)
	if !ok {
		return
	}
	f, err := models.GetInvFoto(fid)
	if errors.Is(err, models.ErrInvFotoNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa foto ya no existe."})
		return
	}
	if err != nil {
		invFail(c, "GetFoto", err, "No se pudo borrar la foto.")
		return
	}
	if err := models.DeleteInvFoto(fid); err != nil {
		invFail(c, "DeleteFoto", err, "No se pudo borrar la foto.")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := storage.DeleteObject(ctx, f.ObjectKey); err != nil {
		log.Println("inventario.DeleteFoto bucket:", err)
	}
	fotos, _ := models.ListInvFotos(f.ItemID)
	c.JSON(http.StatusOK, gin.H{"ok": true, "fotos": fotos})
}

// InvFotoPrincipal — POST /api/inventario/fotos/:fotoId/principal
func InvFotoPrincipal(c *gin.Context) {
	fid, ok := invFotoID(c)
	if !ok {
		return
	}
	f, err := models.GetInvFoto(fid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa foto ya no existe."})
		return
	}
	if err := models.SetInvFotoPrincipal(fid); err != nil {
		invFail(c, "FotoPrincipal", err, "No se pudo cambiar la foto principal.")
		return
	}
	fotos, _ := models.ListInvFotos(f.ItemID)
	c.JSON(http.StatusOK, gin.H{"ok": true, "fotos": fotos})
}

// ServeInvFoto — GET /media/inventario/foto/:fotoId (la imagen)
func ServeInvFoto(c *gin.Context) {
	fid, err := strconv.ParseInt(c.Param("fotoId"), 10, 64)
	if err != nil || fid <= 0 || !storage.Ready() {
		c.Status(http.StatusNotFound)
		return
	}
	f, err := models.GetInvFoto(fid)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	body, ctype, err := storage.GetObject(c.Request.Context(), f.ObjectKey)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()
	if ctype == "" {
		ctype = f.CType
	}
	// Cada foto tiene su propio id: si se cambia, es otro id.
	c.Header("Cache-Control", "public, max-age=2592000, immutable")
	c.DataFromReader(http.StatusOK, -1, ctype, body, nil)
}

// invDeleteFotoFiles borra del bucket las fotos de un artículo eliminado.
func invDeleteFotoFiles(keys []string) {
	if len(keys) == 0 || !storage.Ready() {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		for _, k := range keys {
			storage.DeleteObject(ctx, k)
		}
	}()
}

// InvListFotos — GET /api/inventario/articulos/:id/fotos
func InvListFotos(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	fotos, err := models.ListInvFotos(id)
	if err != nil {
		invFail(c, "ListFotos", err, "No se pudieron cargar las fotos.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"fotos": fotos})
}
