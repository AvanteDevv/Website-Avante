package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/storage"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Administración → Documentación (recepción y admin): suben requisitos
// (UNISON, empresas, …) en PDF o Word y los comparten con un link público
// /documento/:token o su código QR. El archivo vive en el bucket de
// Railway en documentacion/<token>/<archivo>. Reemplazar el archivo NO
// cambia el link (el QR impreso sigue sirviendo).

const (
	docPrefix    = "documentacion/"
	docMaxUpload = 25 << 20 // 25 MB
)

var docCategoryLabels = map[string]string{
	"unison":   "UNISON",
	"empresas": "Empresas",
	"otros":    "Otros",
}

// docKind: "pdf" | "word" según la extensión.
func docKind(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".pdf":
		return "pdf"
	case ".doc", ".docx":
		return "word"
	}
	return ""
}

func docContentType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".pdf":
		return "application/pdf"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".doc":
		return "application/msword"
	}
	return "application/octet-stream"
}

// docSafeName deja solo el nombre del archivo (sin rutas ni caracteres raros).
func docSafeName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == '/' || r == '\\' || r == '"' || r == '?' || r == '#' || r == '%' {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if r := []rune(name); len(r) > 150 {
		ext := filepath.Ext(name)
		name = string(r[:150-len([]rune(ext))]) + ext
	}
	return name
}

func docNewToken() (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func docCtx(c *gin.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), 90*time.Second)
}

func docNotReady(c *gin.Context) bool {
	if storage.Ready() {
		return false
	}
	c.JSON(http.StatusServiceUnavailable, gin.H{"error": "El bucket de Railway no está configurado en el servidor."})
	return true
}

// readDocUpload lee el archivo "file" del multipart y revisa que de
// verdad sea PDF o Word (no solo por la extensión).
func readDocUpload(c *gin.Context) (data []byte, name string, ok bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, docMaxUpload+(1<<20))
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige un archivo PDF o Word (máximo 25 MB)."})
		return nil, "", false
	}
	name = docSafeName(fh.Filename)
	if docKind(name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Solo se aceptan archivos PDF o Word (.pdf, .doc, .docx)."})
		return nil, "", false
	}
	if fh.Size > docMaxUpload {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo pesa más de 25 MB."})
		return nil, "", false
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el archivo."})
		return nil, "", false
	}
	defer f.Close()
	data, err = io.ReadAll(io.LimitReader(f, docMaxUpload+1))
	if err != nil || len(data) == 0 || len(data) > docMaxUpload {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el archivo."})
		return nil, "", false
	}
	var magicOK bool
	switch strings.ToLower(filepath.Ext(name)) {
	case ".pdf":
		magicOK = bytes.HasPrefix(data, []byte("%PDF"))
	case ".docx":
		magicOK = bytes.HasPrefix(data, []byte("PK\x03\x04"))
	case ".doc":
		magicOK = bytes.HasPrefix(data, []byte("\xD0\xCF\x11\xE0"))
	}
	if !magicOK {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo no parece un PDF o Word válido."})
		return nil, "", false
	}
	return data, name, true
}

func docTitleFrom(title, fileName string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		title = strings.TrimSuffix(fileName, filepath.Ext(fileName))
	}
	if r := []rune(title); len(r) > 200 {
		title = string(r[:200])
	}
	return title
}

/* ---------------- API del panel ---------------- */

// DocList — GET /api/documentacion
func DocList(c *gin.Context) {
	list, err := models.ListDocumentos()
	if err != nil {
		log.Println("documentación.List:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los documentos."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"documentos": list, "ready": storage.Ready()})
}

// DocUpload — POST /api/documentacion (multipart: file, title, category)
func DocUpload(c *gin.Context) {
	if docNotReady(c) {
		return
	}
	data, name, ok := readDocUpload(c)
	if !ok {
		return
	}
	category := strings.TrimSpace(c.PostForm("category"))
	if !models.IsDocumentoCategoria(category) {
		category = "otros"
	}
	token, err := docNewToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el link."})
		return
	}
	d := &models.Documento{
		Token:       token,
		Title:       docTitleFrom(c.PostForm("title"), name),
		Category:    category,
		FileName:    name,
		ObjectKey:   docPrefix + token + "/" + name,
		ContentType: docContentType(name),
		SizeBytes:   int64(len(data)),
		CreatedBy:   staffName(c),
	}
	c.Set("doc_name", d.Title)

	ctx, cancel := docCtx(c)
	defer cancel()
	if err := storage.UploadObject(ctx, d.ObjectKey, bytes.NewReader(data), d.SizeBytes, d.ContentType); err != nil {
		log.Println("documentación.Upload bucket:", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "El almacenamiento no respondió. Intenta de nuevo."})
		return
	}
	if err := models.CreateDocumento(d); err != nil {
		log.Println("documentación.Upload db:", err)
		_ = storage.DeleteObject(ctx, d.ObjectKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el documento."})
		return
	}
	saved, err := models.GetDocumentoByID(d.ID)
	if err != nil {
		saved = d
	}
	c.JSON(http.StatusCreated, saved)
}

type docUpdateInput struct {
	Title    string `json:"title"`
	Category string `json:"category"`
}

func docParamID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Documento inválido."})
		return 0, false
	}
	return id, true
}

// DocUpdate — PUT /api/documentacion/:id (título y categoría)
func DocUpdate(c *gin.Context) {
	id, ok := docParamID(c)
	if !ok {
		return
	}
	var in docUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	cur, err := models.GetDocumentoByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese documento ya no existe."})
		return
	}
	title := docTitleFrom(in.Title, cur.FileName)
	category := strings.TrimSpace(in.Category)
	if !models.IsDocumentoCategoria(category) {
		category = cur.Category
	}
	c.Set("doc_name", title)
	if err := models.UpdateDocumentoInfo(id, title, category, staffName(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el cambio."})
		return
	}
	d, _ := models.GetDocumentoByID(id)
	c.JSON(http.StatusOK, d)
}

// DocReplaceFile — PUT /api/documentacion/:id/archivo (multipart: file).
// El link y el QR siguen siendo los mismos.
func DocReplaceFile(c *gin.Context) {
	if docNotReady(c) {
		return
	}
	id, ok := docParamID(c)
	if !ok {
		return
	}
	cur, err := models.GetDocumentoByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese documento ya no existe."})
		return
	}
	data, name, ok := readDocUpload(c)
	if !ok {
		return
	}
	c.Set("doc_name", cur.Title)
	key := docPrefix + cur.Token + "/" + name
	ctype := docContentType(name)
	ctx, cancel := docCtx(c)
	defer cancel()
	if err := storage.UploadObject(ctx, key, bytes.NewReader(data), int64(len(data)), ctype); err != nil {
		log.Println("documentación.Replace bucket:", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "El almacenamiento no respondió. Intenta de nuevo."})
		return
	}
	if err := models.ReplaceDocumentoFile(id, name, key, ctype, int64(len(data)), staffName(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el cambio."})
		return
	}
	if key != cur.ObjectKey {
		if err := storage.DeleteObject(ctx, cur.ObjectKey); err != nil {
			log.Println("documentación.Replace borrar anterior:", err)
		}
	}
	d, _ := models.GetDocumentoByID(id)
	c.JSON(http.StatusOK, d)
}

// DocDelete — DELETE /api/documentacion/:id (el link deja de servir).
func DocDelete(c *gin.Context) {
	id, ok := docParamID(c)
	if !ok {
		return
	}
	cur, err := models.GetDocumentoByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese documento ya no existe."})
		return
	}
	c.Set("doc_name", cur.Title)
	if err := models.DeleteDocumento(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar el documento."})
		return
	}
	if storage.Ready() {
		ctx, cancel := docCtx(c)
		defer cancel()
		if err := storage.DeleteObject(ctx, cur.ObjectKey); err != nil && !storage.IsNotFound(err) {
			log.Println("documentación.Delete bucket:", err)
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

/* ---------------- Página pública ---------------- */

func docSizeLabel(n int64) string {
	switch {
	case n >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(n)/float64(1<<20))
	case n >= 1<<10:
		return fmt.Sprintf("%d KB", n>>10)
	}
	return fmt.Sprintf("%d bytes", n)
}

var docMonths = [...]string{"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"}

func docBaseURL(c *gin.Context) string {
	scheme := "https"
	if p := c.GetHeader("X-Forwarded-Proto"); p != "" {
		scheme = strings.TrimSpace(strings.Split(p, ",")[0])
	} else if c.Request.TLS == nil && (strings.HasPrefix(c.Request.Host, "localhost") || strings.HasPrefix(c.Request.Host, "127.")) {
		scheme = "http"
	}
	return scheme + "://" + c.Request.Host
}

func docValidToken(t string) bool {
	if len(t) < 16 || len(t) > 40 {
		return false
	}
	for _, r := range t {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f') {
			return false
		}
	}
	return true
}

// DocPublicPage — GET /documento/:token (sin sesión)
func DocPublicPage(c *gin.Context) {
	c.Header("X-Robots-Tag", "noindex, nofollow")
	token := c.Param("token")
	var d *models.Documento
	var err error
	if docValidToken(token) {
		d, err = models.GetDocumentoByToken(token)
	} else {
		err = models.ErrDocumentoNotFound
	}
	if err != nil {
		if !errors.Is(err, models.ErrDocumentoNotFound) {
			log.Println("documentación.PublicPage:", err)
		}
		c.HTML(http.StatusNotFound, "documento.html", gin.H{"State": "no_encontrado"})
		return
	}
	go models.AddDocumentoView(d.ID)

	loc := time.Local
	if l, err := time.LoadLocation("America/Hermosillo"); err == nil {
		loc = l
	}
	u := d.UpdatedAt.In(loc)
	fileURL := "/documento/" + d.Token + "/archivo"
	data := gin.H{
		"State":         "ok",
		"Title":         d.Title,
		"Category":      docCategoryLabels[d.Category],
		"FileName":      d.FileName,
		"Kind":          docKind(d.FileName),
		"Size":          docSizeLabel(d.SizeBytes),
		"Updated":       fmt.Sprintf("%d de %s de %d", u.Day(), docMonths[u.Month()-1], u.Year()),
		"FileURL":       fileURL,
		"DownloadURL":   fileURL + "?descargar=1",
		"OfficeViewURL": "",
	}
	if docKind(d.FileName) == "word" {
		// Visor de Office en línea: abre el Word en el navegador del
		// celular sin tener que instalar nada.
		data["OfficeViewURL"] = "https://view.officeapps.live.com/op/view.aspx?src=" + url.QueryEscape(docBaseURL(c)+fileURL)
	}
	c.HTML(http.StatusOK, "documento.html", data)
}

// DocPublicFile — GET /documento/:token/archivo[?descargar=1] (sin sesión)
func DocPublicFile(c *gin.Context) {
	token := c.Param("token")
	if !docValidToken(token) || !storage.Ready() {
		c.String(http.StatusNotFound, "Documento no encontrado.")
		return
	}
	d, err := models.GetDocumentoByToken(token)
	if err != nil {
		c.String(http.StatusNotFound, "Documento no encontrado.")
		return
	}
	ctx, cancel := docCtx(c)
	defer cancel()
	body, _, err := storage.GetObject(ctx, d.ObjectKey)
	if err != nil {
		if !storage.IsNotFound(err) {
			log.Println("documentación.PublicFile:", err)
		}
		c.String(http.StatusNotFound, "Documento no encontrado.")
		return
	}
	defer body.Close()

	disp := "inline"
	// El PDF se abre en el navegador; el Word siempre se descarga (el
	// navegador no lo sabe mostrar — para verlo en línea está el visor
	// de Office de la página pública).
	if c.Query("descargar") == "1" || docKind(d.FileName) == "word" {
		disp = "attachment"
	}
	ascii := strings.Map(func(r rune) rune {
		if r < 32 || r > 126 || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, d.FileName)
	c.Header("Content-Type", docContentType(d.FileName))
	c.Header("Content-Disposition", disp+`; filename="`+ascii+`"; filename*=UTF-8''`+url.PathEscape(d.FileName))
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Robots-Tag", "noindex, nofollow")
	if d.SizeBytes > 0 {
		c.Header("Content-Length", strconv.FormatInt(d.SizeBytes, 10))
	}
	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, body); err != nil {
		log.Println("documentación.PublicFile copy:", err)
	}
}
