package admin

import (
	"database/sql"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/db"
	"avante-optics/storage"
)

// dtLayout es el formato que usa <input type="datetime-local">
// (ej. "2026-08-20T18:30"), tanto para leerlo del form como para
// rellenarlo de vuelta al editar.
const dtLayout = "2006-01-02T15:04"

// Ad representa un banner de la sección #ads del sitio.
type Ad struct {
	ID           int
	Title        string
	Position     string // main | side1 | side2
	ImageKey     string // nombre del archivo dentro de la carpeta ads/ del bucket
	ImageURL     string // ruta pública que sirve el proxy: /media/ads/<ImageKey>
	LinkURL      string
	StartAt      time.Time
	EndAt        time.Time
	Status       string // activo | programado | vencido (calculado, no se guarda en BD)
	StartAtValue string // StartAt formateado para el <input datetime-local>
	EndAtValue   string
}

func computeStatus(start, end time.Time) string {
	now := time.Now()
	switch {
	case now.Before(start):
		return "programado"
	case now.After(end):
		return "vencido"
	default:
		return "activo"
	}
}

// Ads renderiza /admin/anuncios con la lista completa y los contadores.
func Ads(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT id, title, position, image_key, link_url, start_at, end_at
		FROM ads
		ORDER BY start_at DESC
	`)
	if err != nil {
		c.HTML(http.StatusOK, "anuncios.html", gin.H{
			"ActivePage": "admin-anuncios",
			"AdsError":   "No se pudieron cargar los anuncios.",
		})
		return
	}
	defer rows.Close()

	var ads []Ad
	var activeNow, scheduled, expired int

	for rows.Next() {
		var a Ad
		var link sql.NullString
		if err := rows.Scan(&a.ID, &a.Title, &a.Position, &a.ImageKey, &link, &a.StartAt, &a.EndAt); err != nil {
			continue
		}
		a.LinkURL = link.String
		a.ImageURL = "/media/ads/" + a.ImageKey
		a.Status = computeStatus(a.StartAt, a.EndAt)
		a.StartAtValue = a.StartAt.Format(dtLayout)
		a.EndAtValue = a.EndAt.Format(dtLayout)

		switch a.Status {
		case "activo":
			activeNow++
		case "programado":
			scheduled++
		case "vencido":
			expired++
		}
		ads = append(ads, a)
	}

	c.HTML(http.StatusOK, "anuncios.html", gin.H{
		"ActivePage": "admin-anuncios",
		"Ads":        ads,
		"TotalAds":   len(ads),
		"ActiveNow":  activeNow,
		"Scheduled":  scheduled,
		"Expired":    expired,
	})
}

// allowedImageExt valida la extensión del archivo subido.
var allowedImageExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}

func parseAdForm(c *gin.Context) (title, position, link string, startAt, endAt time.Time, err error) {
	title = strings.TrimSpace(c.PostForm("titulo"))
	position = c.PostForm("position")
	link = strings.TrimSpace(c.PostForm("link"))

	if title == "" {
		err = fmt.Errorf("el título es obligatorio")
		return
	}
	if position != "main" && position != "side1" && position != "side2" {
		err = fmt.Errorf("posición inválida")
		return
	}

	startAt, e1 := time.ParseInLocation(dtLayout, c.PostForm("start_at"), time.Local)
	endAt, e2 := time.ParseInLocation(dtLayout, c.PostForm("end_at"), time.Local)
	if e1 != nil || e2 != nil {
		err = fmt.Errorf("fechas inválidas")
		return
	}
	if !endAt.After(startAt) {
		err = fmt.Errorf("la fecha de fin debe ser posterior a la de inicio")
		return
	}
	return title, position, link, startAt, endAt, nil
}

// uploadAdImage sube la imagen del form (campo "image") al bucket bajo ads/
// y regresa el nombre de archivo generado (lo que se guarda en image_key).
func uploadAdImage(c *gin.Context) (string, error) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		return "", fmt.Errorf("selecciona una imagen")
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedImageExt[ext] {
		return "", fmt.Errorf("formato de imagen no soportado (usa JPG, PNG o WEBP)")
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := storage.UploadObject(c.Request.Context(), "ads/"+filename, file, header.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir la imagen al bucket")
	}
	return filename, nil
}

// CreateAd — POST /api/admin/anuncios (multipart/form-data)
func CreateAd(c *gin.Context) {
	title, position, link, startAt, endAt, err := parseAdForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imageKey, err := uploadAdImage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec(`
		INSERT INTO ads (title, position, image_key, link_url, start_at, end_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, NOW())
	`, title, position, imageKey, link, startAt, endAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el anuncio."})
		return
	}

	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// UpdateAd — PUT /api/admin/anuncios/:id (multipart/form-data; "image" es opcional)
func UpdateAd(c *gin.Context) {
	id := c.Param("id")

	title, position, link, startAt, endAt, err := parseAdForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Si mandaron una imagen nueva, la subimos y luego borramos la anterior
	// del bucket; si no, dejamos el image_key que ya tenía.
	var newImageKey string
	if _, _, ferr := c.Request.FormFile("image"); ferr == nil {
		newImageKey, err = uploadAdImage(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if newImageKey != "" {
		var oldImageKey string
		db.DB.QueryRow(`SELECT image_key FROM ads WHERE id = ?`, id).Scan(&oldImageKey)

		_, err = db.DB.Exec(`
			UPDATE ads SET title=?, position=?, image_key=?, link_url=?, start_at=?, end_at=?
			WHERE id=?
		`, title, position, newImageKey, link, startAt, endAt, id)
		if oldImageKey != "" {
			storage.DeleteObject(c.Request.Context(), "ads/"+oldImageKey)
		}
	} else {
		_, err = db.DB.Exec(`
			UPDATE ads SET title=?, position=?, link_url=?, start_at=?, end_at=?
			WHERE id=?
		`, title, position, link, startAt, endAt, id)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar el anuncio."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteAd — DELETE /api/admin/anuncios/:id
func DeleteAd(c *gin.Context) {
	id := c.Param("id")

	var imageKey string
	if err := db.DB.QueryRow(`SELECT image_key FROM ads WHERE id = ?`, id).Scan(&imageKey); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Anuncio no encontrado."})
		return
	}

	if _, err := db.DB.Exec(`DELETE FROM ads WHERE id = ?`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar el anuncio."})
		return
	}

	// Borrado del bucket best-effort: si falla, no tumbamos la respuesta —
	// el registro en BD ya se fue, y un objeto huérfano no rompe nada.
	if imageKey != "" {
		storage.DeleteObject(c.Request.Context(), "ads/"+imageKey)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
