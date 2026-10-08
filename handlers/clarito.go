package handlers

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/storage"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// =====================================================================
// Administración → Clarito · Bucket de Railway
//
// Todo vive en el mismo bucket que ya usa la página (storage.Connect),
// separado por carpetas para que nunca se mezclen:
//
//   clarito/plantillas/Registro Clarito+.pdf          ← plantillas en blanco
//   clarito/guardados/Octubre 2026/Garantía - Juan.pdf ← formatos ya llenos
//   clarito/guardados/Octubre 2026/.carpeta            ← marca de carpeta
//
// · Las plantillas se suben con un botón y se guardan con el MISMO nombre
//   que trae el .pdf. Si ya existe una con ese nombre se pregunta antes de
//   reemplazarla.
// · Los formatos llenos van a "guardados", organizados en las carpetas
//   que cree recepción (ej. "Octubre 2026"). En S3 no existen carpetas
//   vacías, por eso cada carpeta lleva un archivo ".carpeta" de 0 bytes.
// · La tabla clarito_documents guarda quién llenó qué (para "Guardados
//   recientemente"); el archivo en sí solo está en el bucket.
// =====================================================================

const (
	claritoTplPrefix   = "clarito/plantillas/"
	claritoSavedPrefix = "clarito/guardados/"
	claritoSeedMarker  = "clarito/.plantillas-iniciales"
	// Imagen de cada hoja de la plantilla, ya dibujada. Se hace una sola
	// vez (en el navegador de quien la abre primero) y se reutiliza: así
	// la plantilla se ve al instante aunque el PDF sea pesado.
	claritoPreviewPrefix = "clarito/.vistas/"
	// Imagen ligera de cada formato lleno (para verlo rápido sin dibujar el PDF).
	claritoSavedPreviewPrefix = "clarito/.vistas-guardados/"
	claritoFolderMark         = ".carpeta"
	claritoRootName           = "Formatos llenos"
	claritoMaxUpload          = 25 << 20
	claritoMaxRename          = 2000
)

var (
	claritoBadChars = regexp.MustCompile(`[\\/:*?"<>|\x00-\x1f\x7f]+`)
	claritoLoc      = func() *time.Location {
		if l, err := time.LoadLocation("America/Hermosillo"); err == nil {
			return l
		}
		return time.FixedZone("MST", -7*3600)
	}()
	claritoMeses   = []string{"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"}
	errClaritoPath = errors.New("Nombre de carpeta inválido.")
)

// ClaritoSettings es cómo se nombran y organizan los formatos llenos.
type ClaritoSettings struct {
	Organize      string `json:"organize"`       // ninguna | mes | formato | formato_mes | mes_formato | cliente | formato_cliente
	FileName      string `json:"file_name"`      // ej. "{formato} - {cliente} - {fecha}"
	DefaultFolder string `json:"default_folder"` // carpeta base, ej. "Octubre 2026" ("" = Formatos llenos)
}

var claritoOrganizeValid = map[string]bool{
	"ninguna": true, "mes": true, "formato": true, "formato_mes": true,
	"mes_formato": true, "cliente": true, "formato_cliente": true,
}

func defaultClaritoSettings() ClaritoSettings {
	return ClaritoSettings{Organize: "ninguna", FileName: "{formato} - {cliente} - {fecha}"}
}

func loadClaritoSettings() ClaritoSettings {
	s := defaultClaritoSettings()
	if raw, err := models.GetClaritoSettings(); err == nil && raw != "" {
		_ = json.Unmarshal([]byte(raw), &s)
	}
	if !claritoOrganizeValid[s.Organize] {
		s.Organize = "ninguna"
	}
	if strings.TrimSpace(s.FileName) == "" {
		s.FileName = "{formato} - {cliente} - {fecha}"
	}
	if p, err := cleanClaritoPath(s.DefaultFolder); err == nil {
		s.DefaultFolder = p
	} else {
		s.DefaultFolder = ""
	}
	return s
}

/* ---------------------------------------------------------------------
   Nombres, rutas y keys
   --------------------------------------------------------------------- */

// cleanClaritoName limpia un nombre de archivo o carpeta (sin "/").
func cleanClaritoName(s string) string {
	s = claritoBadChars.ReplaceAllString(strings.TrimSpace(s), " ")
	s = strings.Join(strings.Fields(s), " ")
	s = strings.Trim(s, ". ")
	if r := []rune(s); len(r) > 120 {
		s = strings.TrimSpace(string(r[:120]))
	}
	return s
}

// cleanClaritoPath normaliza "Octubre 2026/Garantías" (relativa a
// "Formatos llenos"). "" es la carpeta principal.
func cleanClaritoPath(p string) (string, error) {
	p = strings.Trim(strings.ReplaceAll(strings.TrimSpace(p), `\`, "/"), "/")
	if p == "" {
		return "", nil
	}
	parts := strings.Split(p, "/")
	if len(parts) > 8 {
		return "", errClaritoPath
	}
	for i, seg := range parts {
		c := cleanClaritoName(seg)
		if c == "" || c != strings.TrimSpace(seg) || strings.HasPrefix(c, ".") {
			return "", errClaritoPath
		}
		parts[i] = c
	}
	return strings.Join(parts, "/"), nil
}

func claritoFolderPrefix(path string) string {
	if path == "" {
		return claritoSavedPrefix
	}
	return claritoSavedPrefix + path + "/"
}

// claritoPathOfKey: "clarito/guardados/Octubre 2026/x.pdf" → "Octubre 2026".
func claritoPathOfKey(key string) string {
	rel := strings.TrimPrefix(key, claritoSavedPrefix)
	if i := strings.LastIndex(rel, "/"); i >= 0 {
		return rel[:i]
	}
	return ""
}

func claritoValidKey(key, prefix string) bool {
	return strings.HasPrefix(key, prefix) && len(key) > len(prefix) && len(key) <= 700 &&
		!strings.Contains(key, "..") && !strings.Contains(key, "//") && !strings.HasSuffix(key, "/")
}

func claritoBaseName(key string) string {
	if i := strings.LastIndex(key, "/"); i >= 0 {
		return key[i+1:]
	}
	return key
}

// pdfName quita la extensión, limpia y vuelve a poner ".pdf".
func claritoPDFName(name string) string {
	base := strings.TrimSpace(name)
	if strings.EqualFold(filepath.Ext(base), ".pdf") {
		base = base[:len(base)-4]
	}
	base = cleanClaritoName(base)
	if base == "" {
		return ""
	}
	return base + ".pdf"
}

// claritoFreeKey regresa una key libre: "x.pdf", "x (2).pdf", "x (3).pdf"…
func claritoFreeKey(ctx context.Context, folderPrefix, fileName string) (string, string, error) {
	base := strings.TrimSuffix(fileName, ".pdf")
	name := fileName
	for i := 2; i < 200; i++ {
		info, err := storage.StatObject(ctx, folderPrefix+name)
		if err != nil {
			return "", "", err
		}
		if info == nil {
			return folderPrefix + name, name, nil
		}
		name = fmt.Sprintf("%s (%d).pdf", base, i)
	}
	return "", "", errors.New("demasiados archivos con el mismo nombre")
}

// claritoEnsureFolder crea la marca ".carpeta" de cada nivel de path.
func claritoEnsureFolder(ctx context.Context, path string) error {
	if path == "" {
		return nil
	}
	parts := strings.Split(path, "/")
	for i := range parts {
		key := claritoFolderPrefix(strings.Join(parts[:i+1], "/")) + claritoFolderMark
		info, err := storage.StatObject(ctx, key)
		if err != nil {
			return err
		}
		if info == nil {
			if err := storage.UploadObject(ctx, key, bytes.NewReader(nil), 0, "application/x-directory"); err != nil {
				return err
			}
		}
	}
	return nil
}

// claritoFolderExists: hay algo guardado con ese prefijo (o su marca).
func claritoFolderExists(ctx context.Context, path string) (bool, error) {
	if path == "" {
		return true, nil
	}
	items, err := storage.ListPrefix(ctx, claritoFolderPrefix(path), 1)
	if err != nil {
		return false, err
	}
	return len(items) > 0, nil
}

func claritoMonthFolder(t time.Time) string {
	t = t.In(claritoLoc)
	return claritoMeses[t.Month()-1] + " " + fmt.Sprint(t.Year())
}

// claritoAutoParts arma las subcarpetas automáticas según "organizar".
func claritoAutoParts(organize, formName, client string, t time.Time) []string {
	mes := claritoMonthFolder(t)
	cliente := cleanClaritoName(client)
	if cliente == "" {
		cliente = "Sin nombre"
	}
	formato := cleanClaritoName(formName)
	if formato == "" {
		formato = "Formato"
	}
	switch organize {
	case "mes":
		return []string{mes}
	case "formato":
		return []string{formato}
	case "formato_mes":
		return []string{formato, mes}
	case "mes_formato":
		return []string{mes, formato}
	case "cliente":
		return []string{cliente}
	case "formato_cliente":
		return []string{formato, cliente}
	}
	return nil
}

func claritoCtx(c *gin.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), 90*time.Second)
}

func claritoBucketErr(c *gin.Context, where string, err error) {
	log.Printf("clarito.%s: %v", where, err)
	c.JSON(http.StatusBadGateway, gin.H{"error": "El almacenamiento no respondió. Intenta de nuevo."})
}

func claritoNotReady(c *gin.Context) bool {
	if storage.Ready() {
		return false
	}
	c.JSON(http.StatusServiceUnavailable, gin.H{"error": "El bucket de Railway no está configurado en el servidor.", "code": "no_bucket"})
	return true
}

func staffName(c *gin.Context) string {
	v, _ := c.Get("staff_name")
	s, _ := v.(string)
	return s
}

// readClaritoPDF lee el archivo "file" del multipart y revisa que sea PDF.
func readClaritoPDF(c *gin.Context) ([]byte, string, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, claritoMaxUpload+(1<<20))
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No llegó el PDF (máximo 25 MB)."})
		return nil, "", false
	}
	if fh.Size > claritoMaxUpload {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "El PDF pesa más de 25 MB."})
		return nil, "", false
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el PDF."})
		return nil, "", false
	}
	content, err := io.ReadAll(f)
	f.Close()
	head := content
	if len(head) > 1024 {
		head = head[:1024]
	}
	if err != nil || !bytes.HasPrefix(bytes.TrimLeft(head, "\xef\xbb\xbf \r\n\t"), []byte("%PDF")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo no es un PDF."})
		return nil, "", false
	}
	return content, fh.Filename, true
}

type claritoFileJSON struct {
	Key      string    `json:"key"`
	Name     string    `json:"name"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

func claritoCrumbs(path string) []gin.H {
	crumbs := []gin.H{{"path": "", "name": claritoRootName}}
	if path == "" {
		return crumbs
	}
	parts := strings.Split(path, "/")
	for i, p := range parts {
		crumbs = append(crumbs, gin.H{"path": strings.Join(parts[:i+1], "/"), "name": p})
	}
	return crumbs
}

/* ---------------------------------------------------------------------
   Plantillas iniciales
   --------------------------------------------------------------------- */

// SeedClaritoTemplates sube una sola vez los 3 formatos que venían en
// static/pdf/clarito al bucket (si todavía no hay plantillas). Después
// de eso, lo que haya en el bucket manda: si las borran no se vuelven a
// subir. Llamar en main.go después de storage.Connect():
//
//	go handlers.SeedClaritoTemplates()
func SeedClaritoTemplates() {
	if !storage.Ready() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if info, err := storage.StatObject(ctx, claritoSeedMarker); err != nil || info != nil {
		return
	}
	if n, err := storage.CountPrefix(ctx, claritoTplPrefix, 1); err != nil || n > 0 {
		if err == nil {
			_ = storage.UploadObject(ctx, claritoSeedMarker, bytes.NewReader(nil), 0, "text/plain")
		}
		return
	}
	seeds := []struct{ file, name string }{
		{"static/pdf/clarito/registro-clarito.pdf", "Registro Clarito+.pdf"},
		{"static/pdf/clarito/garantia-clarito.pdf", "Garantía Clarito+.pdf"},
		{"static/pdf/clarito/descuento-nomina-unison.pdf", "Descuento por nómina UNISON.pdf"},
	}
	up := 0
	for _, s := range seeds {
		b, err := os.ReadFile(s.file)
		if err != nil {
			continue
		}
		if err := storage.UploadObject(ctx, claritoTplPrefix+s.name, bytes.NewReader(b), int64(len(b)), "application/pdf"); err != nil {
			log.Printf("clarito: no se pudo subir la plantilla %s: %v", s.name, err)
			return
		}
		up++
	}
	_ = storage.UploadObject(ctx, claritoSeedMarker, bytes.NewReader(nil), 0, "text/plain")
	log.Printf("clarito: %d plantillas iniciales subidas al bucket", up)
}

/* ---------------------------------------------------------------------
   Rutas
   --------------------------------------------------------------------- */

// ClaritoStatus — GET /api/clarito/status
func ClaritoStatus(c *gin.Context) {
	if !storage.Ready() {
		c.JSON(http.StatusOK, gin.H{"ready": false, "settings": defaultClaritoSettings()})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	tpl, err := storage.CountPrefix(ctx, claritoTplPrefix, 10000)
	if err != nil {
		log.Printf("clarito.Status: %v", err)
		c.JSON(http.StatusOK, gin.H{"ready": false, "error": "No se pudo leer el bucket de Railway.", "settings": loadClaritoSettings()})
		return
	}
	saved, _ := storage.ListPrefix(ctx, claritoSavedPrefix, 10000)
	files := 0
	for _, o := range saved {
		if !strings.HasSuffix(o.Key, "/"+claritoFolderMark) {
			files++
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"ready":     true,
		"templates": tpl,
		"saved":     files,
		"root":      claritoRootName,
		"settings":  loadClaritoSettings(),
	})
}

// ClaritoSaveSettings — PUT /api/clarito/settings
func ClaritoSaveSettings(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	var body ClaritoSettings
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if !claritoOrganizeValid[body.Organize] {
		body.Organize = "ninguna"
	}
	body.FileName = strings.TrimSpace(body.FileName)
	if body.FileName == "" || len([]rune(body.FileName)) > 200 {
		body.FileName = "{formato} - {cliente} - {fecha}"
	}
	p, err := cleanClaritoPath(body.DefaultFolder)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.DefaultFolder = p
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if err := claritoEnsureFolder(ctx, p); err != nil {
		claritoBucketErr(c, "Settings", err)
		return
	}
	b, _ := json.Marshal(body)
	if err := models.SaveClaritoSettings(string(b)); err != nil {
		log.Printf("clarito.Settings: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "settings": body})
}

// ClaritoTemplates — GET /api/clarito/templates
func ClaritoTemplates(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	_, files, err := storage.ListFolder(ctx, claritoTplPrefix)
	if err != nil {
		claritoBucketErr(c, "Templates", err)
		return
	}
	out := []claritoFileJSON{}
	for _, f := range files {
		name := claritoBaseName(f.Key)
		if !strings.EqualFold(filepath.Ext(name), ".pdf") {
			continue
		}
		out = append(out, claritoFileJSON{Key: f.Key, Name: name, Size: f.Size, Modified: f.Modified})
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	c.JSON(http.StatusOK, gin.H{"items": out})
}

// ClaritoUploadTemplate — POST /api/clarito/templates (multipart)
//
//	file     el PDF de la plantilla (se guarda con el MISMO nombre)
//	replace  "1" para reemplazar una que ya existe con ese nombre
func ClaritoUploadTemplate(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	content, original, ok := readClaritoPDF(c)
	if !ok {
		return
	}
	name := claritoPDFName(original)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo no tiene un nombre válido."})
		return
	}
	c.Set("clarito_name", name)
	key := claritoTplPrefix + name
	ctx, cancel := claritoCtx(c)
	defer cancel()
	prev, err := storage.StatObject(ctx, key)
	if err != nil {
		claritoBucketErr(c, "UploadTemplate", err)
		return
	}
	if prev != nil && c.PostForm("replace") != "1" {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una plantilla llamada «" + name + "».", "code": "exists", "name": name})
		return
	}
	if err := storage.UploadObject(ctx, key, bytes.NewReader(content), int64(len(content)), "application/pdf"); err != nil {
		claritoBucketErr(c, "UploadTemplate", err)
		return
	}
	if prev != nil {
		claritoDropPreviews(ctx, key)
	}
	c.Set("clarito_replaced", prev != nil)
	c.JSON(http.StatusOK, gin.H{"ok": true, "replaced": prev != nil,
		"item": claritoFileJSON{Key: key, Name: name, Size: int64(len(content)), Modified: time.Now().UTC()}})
}

// ClaritoDeleteTemplate — DELETE /api/clarito/templates?key=
func ClaritoDeleteTemplate(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key := c.Query("key")
	if !claritoValidKey(key, claritoTplPrefix) || strings.Contains(strings.TrimPrefix(key, claritoTplPrefix), "/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Plantilla inválida."})
		return
	}
	c.Set("clarito_name", claritoBaseName(key))
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if err := storage.DeleteObject(ctx, key); err != nil && !storage.IsNotFound(err) {
		claritoBucketErr(c, "DeleteTemplate", err)
		return
	}
	claritoDropPreviews(ctx, key)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

/* ---------- Vista rápida de los formatos llenos ---------- */

func claritoSavedPreviewKey(key string) string {
	h := sha1.Sum([]byte(key))
	return fmt.Sprintf("%s%x.jpg", claritoSavedPreviewPrefix, h[:12])
}

// claritoMoveSavedPreview mueve la imagen ligera junto con su PDF.
func claritoMoveSavedPreview(ctx context.Context, oldKey, newKey string) {
	from, to := claritoSavedPreviewKey(oldKey), claritoSavedPreviewKey(newKey)
	if info, err := storage.StatObject(ctx, from); err != nil || info == nil {
		return
	}
	if err := storage.CopyKey(ctx, from, to); err == nil {
		_ = storage.DeleteObject(ctx, from)
	}
}

// ClaritoFilePreview — GET /api/clarito/file/preview?key=  (JPEG o 404)
func ClaritoFilePreview(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key := c.Query("key")
	if !claritoValidKey(key, claritoSavedPrefix) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Archivo inválido."})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	body, _, err := storage.GetObject(ctx, claritoSavedPreviewKey(key))
	if err != nil {
		c.Header("Cache-Control", "no-store")
		if storage.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Sin vista rápida.", "code": "no_preview"})
			return
		}
		claritoBucketErr(c, "FilePreview", err)
		return
	}
	defer body.Close()
	c.Header("Content-Type", "image/jpeg")
	c.Header("Cache-Control", "private, max-age=60")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, io.LimitReader(body, 12<<20))
}

/* ---------- Vista rápida de las plantillas ---------- */

func claritoPreviewDir(key string) string {
	h := sha1.Sum([]byte(key))
	return fmt.Sprintf("%s%x/", claritoPreviewPrefix, h[:10])
}

func claritoPreviewKey(key, v string, page int) string {
	h := sha1.Sum([]byte(v))
	return fmt.Sprintf("%s%x-p%d.jpg", claritoPreviewDir(key), h[:8], page)
}

// claritoDropPreviews borra las imágenes viejas de una plantilla (al
// reemplazarla o eliminarla).
func claritoDropPreviews(ctx context.Context, key string) {
	items, err := storage.ListPrefix(ctx, claritoPreviewDir(key), 500)
	if err != nil {
		return
	}
	for _, it := range items {
		_ = storage.DeleteObject(ctx, it.Key)
	}
}

func claritoPreviewParams(c *gin.Context) (key, v string, page int, ok bool) {
	key, v = c.Query("key"), c.Query("v")
	_, err := fmt.Sscanf(c.DefaultQuery("page", "1"), "%d", &page)
	if !claritoValidKey(key, claritoTplPrefix) || strings.Contains(strings.TrimPrefix(key, claritoTplPrefix), "/") ||
		v == "" || len(v) > 64 || err != nil || page < 1 || page > 60 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return "", "", 0, false
	}
	return key, v, page, true
}

// ClaritoTemplatePreview — GET /api/clarito/templates/preview?key=&v=&page=1
// (v = fecha de la plantilla; si la reemplazan cambia y se vuelve a dibujar)
func ClaritoTemplatePreview(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key, v, page, ok := claritoPreviewParams(c)
	if !ok {
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	body, _, err := storage.GetObject(ctx, claritoPreviewKey(key, v, page))
	if err != nil {
		if storage.IsNotFound(err) {
			c.Header("Cache-Control", "no-store")
			c.JSON(http.StatusNotFound, gin.H{"error": "Todavía no hay vista rápida.", "code": "no_preview"})
			return
		}
		claritoBucketErr(c, "TemplatePreview", err)
		return
	}
	defer body.Close()
	c.Header("Content-Type", "image/jpeg")
	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, io.LimitReader(body, 12<<20))
}

// ClaritoSaveTemplatePreview — PUT /api/clarito/templates/preview?key=&v=&page=1
// Cuerpo: la imagen JPEG de esa hoja.
func ClaritoSaveTemplatePreview(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key, v, page, ok := claritoPreviewParams(c)
	if !ok {
		return
	}
	data, err := io.ReadAll(io.LimitReader(c.Request.Body, 8<<20+1))
	if err != nil || len(data) < 100 || len(data) > 8<<20 || !bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La imagen no es válida."})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if info, err := storage.StatObject(ctx, key); err != nil {
		claritoBucketErr(c, "SaveTemplatePreview", err)
		return
	} else if info == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa plantilla ya no existe."})
		return
	}
	if err := storage.UploadObject(ctx, claritoPreviewKey(key, v, page), bytes.NewReader(data), int64(len(data)), "image/jpeg"); err != nil {
		claritoBucketErr(c, "SaveTemplatePreview", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ClaritoFolder — GET /api/clarito/folders?path=Octubre 2026
// Regresa la ruta (migas), las subcarpetas y los PDF de esa carpeta.
func ClaritoFolder(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	path, err := cleanClaritoPath(c.Query("path"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	prefix := claritoFolderPrefix(path)
	folders, files, err := storage.ListFolder(ctx, prefix)
	if err != nil {
		claritoBucketErr(c, "Folder", err)
		return
	}
	if path != "" && len(folders) == 0 && len(files) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa carpeta ya no existe.", "code": "no_folder"})
		return
	}
	outFolders := []gin.H{}
	for _, f := range folders {
		name := strings.TrimSuffix(strings.TrimPrefix(f, prefix), "/")
		if name == "" || strings.HasPrefix(name, ".") {
			continue
		}
		p := name
		if path != "" {
			p = path + "/" + name
		}
		outFolders = append(outFolders, gin.H{"path": p, "name": name})
	}
	sort.Slice(outFolders, func(i, j int) bool {
		return strings.ToLower(outFolders[i]["name"].(string)) < strings.ToLower(outFolders[j]["name"].(string))
	})
	outFiles := []claritoFileJSON{}
	for _, f := range files {
		name := claritoBaseName(f.Key)
		if name == claritoFolderMark || strings.HasPrefix(name, ".") {
			continue
		}
		outFiles = append(outFiles, claritoFileJSON{Key: f.Key, Name: name, Size: f.Size, Modified: f.Modified})
	}
	sort.Slice(outFiles, func(i, j int) bool { return outFiles[i].Modified.After(outFiles[j].Modified) })
	c.JSON(http.StatusOK, gin.H{"path": path, "crumbs": claritoCrumbs(path), "folders": outFolders, "files": outFiles})
}

// ClaritoCreateFolder — POST /api/clarito/folders {parent, name}
func ClaritoCreateFolder(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	var body struct {
		Parent string `json:"parent"`
		Name   string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	parent, err := cleanClaritoPath(body.Parent)
	name := cleanClaritoName(body.Name)
	if err != nil || name == "" || strings.HasPrefix(name, ".") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un nombre válido para la carpeta."})
		return
	}
	path := name
	if parent != "" {
		path = parent + "/" + name
	}
	if strings.Count(path, "/") >= 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ya no se pueden crear más niveles de carpetas aquí."})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if ok, err := claritoFolderExists(ctx, parent); err != nil {
		claritoBucketErr(c, "CreateFolder", err)
		return
	} else if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "La carpeta de arriba ya no existe."})
		return
	}
	existed, _ := claritoFolderExists(ctx, path)
	if err := claritoEnsureFolder(ctx, path); err != nil {
		claritoBucketErr(c, "CreateFolder", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "existed": existed, "folder": gin.H{"path": path, "name": name}})
}

// ClaritoRenameFolder — PUT /api/clarito/folders {path, name}
// En S3 no se puede renombrar: se copia todo a la carpeta nueva y se borra la vieja.
func ClaritoRenameFolder(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	var body struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	path, err := cleanClaritoPath(body.Path)
	name := cleanClaritoName(body.Name)
	if err != nil || path == "" || name == "" || strings.HasPrefix(name, ".") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un nombre válido para la carpeta."})
		return
	}
	newPath := name
	if i := strings.LastIndex(path, "/"); i >= 0 {
		newPath = path[:i] + "/" + name
	}
	if newPath == path {
		c.JSON(http.StatusOK, gin.H{"ok": true, "path": path})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if exists, err := claritoFolderExists(ctx, newPath); err != nil {
		claritoBucketErr(c, "RenameFolder", err)
		return
	} else if exists && !strings.EqualFold(newPath, path) {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya hay una carpeta llamada «" + name + "» aquí."})
		return
	}
	oldPrefix, newPrefix := claritoFolderPrefix(path), claritoFolderPrefix(newPath)
	items, err := storage.ListPrefix(ctx, oldPrefix, claritoMaxRename+1)
	if err != nil {
		claritoBucketErr(c, "RenameFolder", err)
		return
	}
	if len(items) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa carpeta ya no existe."})
		return
	}
	if len(items) > claritoMaxRename {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La carpeta tiene demasiados archivos para renombrarla."})
		return
	}
	for _, it := range items {
		if err := storage.CopyKey(ctx, it.Key, newPrefix+strings.TrimPrefix(it.Key, oldPrefix)); err != nil {
			claritoBucketErr(c, "RenameFolder", err)
			return
		}
	}
	for _, it := range items {
		_ = storage.DeleteObject(ctx, it.Key)
		if !strings.HasSuffix(it.Key, "/"+claritoFolderMark) {
			claritoMoveSavedPreview(ctx, it.Key, newPrefix+strings.TrimPrefix(it.Key, oldPrefix))
		}
	}
	if err := models.MoveClaritoDocumentsPrefix(oldPrefix, newPrefix, path, newPath); err != nil {
		log.Printf("clarito.RenameFolder: registro: %v", err)
	}
	// Si era la carpeta base de la configuración, se actualiza.
	if s := loadClaritoSettings(); s.DefaultFolder == path || strings.HasPrefix(s.DefaultFolder, path+"/") {
		s.DefaultFolder = newPath + strings.TrimPrefix(s.DefaultFolder, path)
		if b, err := json.Marshal(s); err == nil {
			_ = models.SaveClaritoSettings(string(b))
		}
	}
	c.Set("clarito_name", path+" → "+name)
	c.JSON(http.StatusOK, gin.H{"ok": true, "path": newPath})
}

// ClaritoDeleteFolder — DELETE /api/clarito/folders?path=  (solo si está vacía)
func ClaritoDeleteFolder(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	path, err := cleanClaritoPath(c.Query("path"))
	if err != nil || path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Carpeta inválida."})
		return
	}
	c.Set("clarito_name", path)
	ctx, cancel := claritoCtx(c)
	defer cancel()
	prefix := claritoFolderPrefix(path)
	items, err := storage.ListPrefix(ctx, prefix, 50)
	if err != nil {
		claritoBucketErr(c, "DeleteFolder", err)
		return
	}
	for _, it := range items {
		if it.Key != prefix+claritoFolderMark {
			c.JSON(http.StatusConflict, gin.H{"error": "La carpeta no está vacía. Mueve o borra primero lo que tiene adentro."})
			return
		}
	}
	for _, it := range items {
		if err := storage.DeleteObject(ctx, it.Key); err != nil {
			claritoBucketErr(c, "DeleteFolder", err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ClaritoFile — GET /api/clarito/file?key=…[&download=1]
// Sirve un PDF del bucket (plantilla o formato lleno) para verlo o descargarlo.
func ClaritoFile(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key := c.Query("key")
	if !claritoValidKey(key, claritoTplPrefix) && !claritoValidKey(key, claritoSavedPrefix) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Archivo inválido."})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	body, ctype, err := storage.GetObject(ctx, key)
	if err != nil {
		if storage.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ese archivo ya no existe."})
			return
		}
		claritoBucketErr(c, "File", err)
		return
	}
	defer body.Close()
	name := claritoBaseName(key)
	if strings.EqualFold(filepath.Ext(name), ".pdf") {
		ctype = "application/pdf"
	}
	disp := "inline"
	if c.Query("download") == "1" {
		disp = "attachment"
	}
	ascii := strings.Map(func(r rune) rune {
		if r < 32 || r > 126 || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	c.Header("Content-Type", ctype)
	c.Header("Content-Disposition", disp+`; filename="`+ascii+`"; filename*=UTF-8''`+url.PathEscape(name))
	if c.Query("v") != "" && strings.HasPrefix(key, claritoTplPrefix) {
		// La URL cambia cuando reemplazan la plantilla: el navegador la
		// puede guardar y no volver a descargarla.
		c.Header("Cache-Control", "private, max-age=31536000, immutable")
	} else {
		c.Header("Cache-Control", "private, max-age=30")
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, io.LimitReader(body, 60<<20))
}

// ClaritoUpdateFile — PUT /api/clarito/file {key, name, folder}
// Renombra y/o mueve un formato lleno a otra carpeta.
func ClaritoUpdateFile(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	var body struct {
		Key    string  `json:"key"`
		Name   string  `json:"name"`
		Folder *string `json:"folder"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !claritoValidKey(body.Key, claritoSavedPrefix) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	oldName := claritoBaseName(body.Key)
	folder := claritoPathOfKey(body.Key)
	if body.Folder != nil {
		f, err := cleanClaritoPath(*body.Folder)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		folder = f
	}
	name := oldName
	if strings.TrimSpace(body.Name) != "" {
		if name = claritoPDFName(body.Name); name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un nombre válido."})
			return
		}
	}
	newKey := claritoFolderPrefix(folder) + name
	if newKey == body.Key {
		c.JSON(http.StatusOK, gin.H{"ok": true, "key": newKey, "name": name, "folder": folder})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if ok, err := claritoFolderExists(ctx, folder); err != nil {
		claritoBucketErr(c, "UpdateFile", err)
		return
	} else if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa carpeta ya no existe."})
		return
	}
	if info, err := storage.StatObject(ctx, newKey); err != nil {
		claritoBucketErr(c, "UpdateFile", err)
		return
	} else if info != nil && !strings.EqualFold(newKey, body.Key) {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya hay un archivo llamado «" + name + "» en esa carpeta."})
		return
	}
	if err := storage.CopyKey(ctx, body.Key, newKey); err != nil {
		if storage.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ese archivo ya no existe."})
			return
		}
		claritoBucketErr(c, "UpdateFile", err)
		return
	}
	claritoMoveSavedPreview(ctx, body.Key, newKey)
	if err := storage.DeleteObject(ctx, body.Key); err != nil {
		log.Printf("clarito.UpdateFile: no se borró el original %s: %v", body.Key, err)
	}
	if err := models.UpdateClaritoDocumentKey(body.Key, newKey, name, folder); err != nil {
		log.Printf("clarito.UpdateFile: registro: %v", err)
	}
	dest := claritoRootName
	if folder != "" {
		dest = folder
	}
	c.Set("clarito_name", oldName+" → "+dest+" / "+name)
	c.JSON(http.StatusOK, gin.H{"ok": true, "key": newKey, "name": name, "folder": folder})
}

// ClaritoDeleteFile — DELETE /api/clarito/file?key=  (solo formatos llenos)
func ClaritoDeleteFile(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key := c.Query("key")
	if !claritoValidKey(key, claritoSavedPrefix) || claritoBaseName(key) == claritoFolderMark {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Archivo inválido."})
		return
	}
	c.Set("clarito_name", strings.TrimPrefix(key, claritoSavedPrefix))
	ctx, cancel := claritoCtx(c)
	defer cancel()
	// Que la carpeta no desaparezca al quedar vacía.
	if folder := claritoPathOfKey(key); folder != "" {
		_ = claritoEnsureFolder(ctx, folder)
	}
	if err := storage.DeleteObject(ctx, key); err != nil && !storage.IsNotFound(err) {
		claritoBucketErr(c, "DeleteFile", err)
		return
	}
	_ = storage.DeleteObject(ctx, claritoSavedPreviewKey(key))
	if err := models.DeleteClaritoDocumentsByKey(key); err != nil {
		log.Printf("clarito.DeleteFile: registro: %v", err)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ClaritoSaveDocument — POST /api/clarito/documents (multipart)
//
//	file       el PDF (llenado aquí, o uno ya llenado/escaneado que se sube)
//	form_key   llave del formato (vacío si se subió un PDF suelto)
//	form_name  "Garantía Clarito+"
//	client     nombre del cliente (para organizar y para el registro)
//	file_name  nombre del archivo; si viene vacío se usa el del PDF subido
//	folder     carpeta elegida a mano ("" = Formatos llenos). Si NO viene
//	           el campo, se usa la organización automática de la configuración.
func ClaritoSaveDocument(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	content, original, ok := readClaritoPDF(c)
	if !ok {
		return
	}
	formKey := strings.TrimSpace(c.PostForm("form_key"))
	formName := cleanClaritoName(c.PostForm("form_name"))
	client := strings.TrimSpace(c.PostForm("client"))
	if r := []rune(client); len(r) > 190 {
		client = string(r[:190])
	}
	name := claritoPDFName(c.PostForm("file_name"))
	if name == "" {
		name = claritoPDFName(original)
	}
	if name == "" {
		name = claritoPDFName(formName + " - " + time.Now().In(claritoLoc).Format("2006-01-02 15-04"))
	}
	if formName == "" {
		formName = "PDF subido"
	}

	settings := loadClaritoSettings()
	var folder string
	if chosen, manual := c.GetPostForm("folder"); manual {
		f, err := cleanClaritoPath(chosen)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		folder = f
	} else {
		parts := []string{}
		if settings.DefaultFolder != "" {
			parts = append(parts, settings.DefaultFolder)
		}
		parts = append(parts, claritoAutoParts(settings.Organize, formName, client, time.Now())...)
		folder = strings.Join(parts, "/")
	}

	ctx, cancel := claritoCtx(c)
	defer cancel()
	if err := claritoEnsureFolder(ctx, folder); err != nil {
		claritoBucketErr(c, "SaveDocument", err)
		return
	}
	key, finalName, err := claritoFreeKey(ctx, claritoFolderPrefix(folder), name)
	if err != nil {
		claritoBucketErr(c, "SaveDocument", err)
		return
	}
	if err := storage.UploadObject(ctx, key, bytes.NewReader(content), int64(len(content)), "application/pdf"); err != nil {
		claritoBucketErr(c, "SaveDocument", err)
		return
	}
	// Imagen ligera (opcional) para ver el formato rápido después.
	if fh, err := c.FormFile("preview"); err == nil && fh.Size > 100 && fh.Size <= 8<<20 {
		if f, err := fh.Open(); err == nil {
			img, err := io.ReadAll(f)
			f.Close()
			if err == nil && bytes.HasPrefix(img, []byte{0xFF, 0xD8, 0xFF}) {
				if err := storage.UploadObject(ctx, claritoSavedPreviewKey(key), bytes.NewReader(img), int64(len(img)), "image/jpeg"); err != nil {
					log.Printf("clarito.SaveDocument: vista rápida: %v", err)
				}
			}
		}
	}
	doc := models.ClaritoDocument{
		FormKey: formKey, FormName: formName, ClientName: client, FileName: finalName,
		ObjectKey: key, Size: int64(len(content)), FolderPath: folder, CreatedBy: staffName(c),
	}
	if id, err := models.CreateClaritoDocument(doc); err == nil {
		doc.ID = id
	} else {
		log.Printf("clarito.SaveDocument: registro: %v", err)
	}
	doc.CreatedAt = time.Now().UTC()
	dest := claritoRootName
	if folder != "" {
		dest = claritoRootName + " / " + strings.ReplaceAll(folder, "/", " / ")
	}
	c.Set("clarito_name", finalName)
	c.Set("clarito_folder", dest)
	c.JSON(http.StatusOK, gin.H{"ok": true, "document": doc, "folder": folder, "folder_label": dest})
}

// ClaritoDocuments — GET /api/clarito/documents (los últimos guardados)
func ClaritoDocuments(c *gin.Context) {
	docs, err := models.ListClaritoDocuments(60)
	if err != nil {
		log.Printf("clarito.Documents: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los formatos guardados."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": docs})
}
