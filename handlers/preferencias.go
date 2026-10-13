package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/storage"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Configuración (optometría y recepción): sonido y anticipación de los
// avisos de cita. Cada quien guarda las suyas.

// GetMyPreferences — GET /api/staff/preferencias
func GetMyPreferences(c *gin.Context) {
	me := currentStaff(c)
	data, err := models.GetStaffPreferences(me.Role, me.ID)
	if err != nil {
		log.Println("preferencias: leer:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar tu configuración."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// SaveMyPreferences — PUT /api/staff/preferencias  {"data": {...}}
func SaveMyPreferences(c *gin.Context) {
	me := currentStaff(c)
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 16<<10))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	var in struct {
		Data json.RawMessage `json:"data"`
	}
	var probe map[string]any
	if json.Unmarshal(body, &in) != nil || len(in.Data) == 0 || json.Unmarshal(in.Data, &probe) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if err := models.SaveStaffPreferences(me.Role, me.ID, in.Data); err != nil {
		log.Println("preferencias: guardar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar tu configuración."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": in.Data})
}

// ConfigPage — GET /optometrist/configuracion y /receptionist/configuracion
func ConfigPage(tmpl, active string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.HTML(http.StatusOK, tmpl, WithStaff(c, gin.H{"ActivePage": active}))
	}
}

/* =========================================================
   Sonido propio (MP3) para los avisos de cita
   Se guarda en el bucket como staff-sonidos/<rol>-<id>.<ext> (uno por
   cuenta; al subir otro se reemplaza) y en sus preferencias queda
   avisosCita.custom = {name, ext, v} y avisosCita.sound = "custom".
   ========================================================= */

const staffSoundMax = 5 << 20 // 5 MB

var staffSoundTypes = map[string]string{
	".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
	".wav": "audio/wav", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".webm": "audio/webm",
}

func staffSoundKey(me models.StaffRef, ext string) string {
	return fmt.Sprintf("staff-sonidos/%s-%d%s", me.Role, me.ID, ext)
}

// looksLikeAudio revisa la "firma" del archivo (no solo la extensión).
func looksLikeAudio(head []byte) bool {
	switch {
	case bytes.HasPrefix(head, []byte("ID3")): // mp3 con etiquetas
		return true
	case len(head) > 2 && head[0] == 0xFF && (head[1]&0xE0) == 0xE0: // mp3/aac sin etiquetas
		return true
	case len(head) > 12 && bytes.Equal(head[4:8], []byte("ftyp")): // m4a
		return true
	case bytes.HasPrefix(head, []byte("RIFF")) && len(head) > 12 && bytes.Equal(head[8:12], []byte("WAVE")):
		return true
	case bytes.HasPrefix(head, []byte("OggS")), bytes.HasPrefix(head, []byte{0x1A, 0x45, 0xDF, 0xA3}):
		return true
	}
	return false
}

// prefsMap: las preferencias guardadas como mapa (para tocar solo avisosCita).
func prefsMap(me models.StaffRef) (map[string]any, map[string]any) {
	all := map[string]any{}
	if raw, err := models.GetStaffPreferences(me.Role, me.ID); err == nil {
		json.Unmarshal(raw, &all)
	}
	if all == nil {
		all = map[string]any{}
	}
	av, _ := all["avisosCita"].(map[string]any)
	if av == nil {
		av = map[string]any{}
	}
	return all, av
}

// UploadMySound — POST /api/staff/preferencias/sonido (multipart "file")
func UploadMySound(c *gin.Context) {
	if !storage.Ready() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "El almacenamiento de archivos no está disponible."})
		return
	}
	me := currentStaff(c)
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, staffSoundMax+(1<<20))
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No llegó el archivo (máximo 5 MB)."})
		return
	}
	if fh.Size > staffSoundMax {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "El archivo pesa más de 5 MB. Usa un tono corto."})
		return
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	ctype, ok := staffSoundTypes[ext]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sube un MP3 (también sirve M4A, WAV u OGG)."})
		return
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el archivo."})
		return
	}
	content, err := io.ReadAll(f)
	f.Close()
	if err != nil || !looksLikeAudio(content[:min(len(content), 64)]) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo no parece ser un audio."})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	all, av := prefsMap(me)
	// Si antes tenía otro formato, se borra el anterior.
	if old, _ := av["custom"].(map[string]any); old != nil {
		if oe, _ := old["ext"].(string); oe != "" && oe != ext {
			storage.DeleteObject(ctx, staffSoundKey(me, oe))
		}
	}
	if err := storage.UploadObject(ctx, staffSoundKey(me, ext), bytes.NewReader(content), int64(len(content)), ctype); err != nil {
		log.Println("sonido propio: subir:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo subir el sonido."})
		return
	}
	name := strings.TrimSuffix(filepath.Base(fh.Filename), filepath.Ext(fh.Filename))
	if r := []rune(name); len(r) > 60 {
		name = string(r[:60])
	}
	av["custom"] = map[string]any{"name": name, "ext": ext, "v": time.Now().Unix()}
	av["sound"] = "custom"
	all["avisosCita"] = av
	raw, _ := json.Marshal(all)
	if err := models.SaveStaffPreferences(me.Role, me.ID, raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Se subió pero no se pudo guardar en tu configuración."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": json.RawMessage(raw)})
}

// GetMySound — GET /api/staff/preferencias/sonido (el audio, para tocarlo)
func GetMySound(c *gin.Context) {
	me := currentStaff(c)
	_, av := prefsMap(me)
	cu, _ := av["custom"].(map[string]any)
	ext, _ := cu["ext"].(string)
	if ext == "" || !storage.Ready() {
		c.Status(http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rc, ctype, err := storage.GetObject(ctx, staffSoundKey(me, ext))
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer rc.Close()
	if ctype == "" {
		ctype = staffSoundTypes[ext]
	}
	data, err := io.ReadAll(rc)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Content-Type", ctype)
	c.Header("Cache-Control", "private, max-age=86400")
	// ServeContent permite que el navegador pida pedazos (Range), como le gusta a <audio>.
	http.ServeContent(c.Writer, c.Request, "sonido"+ext, time.Time{}, bytes.NewReader(data))
}

// DeleteMySound — DELETE /api/staff/preferencias/sonido (vuelve a la Campanita)
func DeleteMySound(c *gin.Context) {
	me := currentStaff(c)
	all, av := prefsMap(me)
	if cu, _ := av["custom"].(map[string]any); cu != nil {
		if ext, _ := cu["ext"].(string); ext != "" && storage.Ready() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			storage.DeleteObject(ctx, staffSoundKey(me, ext))
			cancel()
		}
	}
	delete(av, "custom")
	if s, _ := av["sound"].(string); s == "custom" {
		av["sound"] = "campana"
	}
	all["avisosCita"] = av
	raw, _ := json.Marshal(all)
	if err := models.SaveStaffPreferences(me.Role, me.ID, raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo quitar el sonido."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": json.RawMessage(raw)})
}
