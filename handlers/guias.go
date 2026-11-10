package handlers

/*
   Administración → Guías

   Los manuales en PDF de cada rol (Inventario, Optometrista, Recepción,
   Laboratorio…). Se guardan en el mismo bucket de Railway que Clarito,
   cada rol en su carpeta:

       guias/<rol>/<nombre>.pdf

   Por ahora solo el admin los sube, los ve y los descarga.

     GET    /api/admin/guias              lista agrupada por rol
     POST   /api/admin/guias              multipart: role, file, replace=1
     DELETE /api/admin/guias?key=
     GET    /api/admin/guias/archivo?key=[&download=1]
*/

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"avante-optics/storage"

	"github.com/gin-gonic/gin"
)

const (
	guiasPrefix    = "guias/"
	guiasMaxUpload = 60 << 20
)

// guiaRol: los roles que pueden tener guía, en el orden en que salen.
type guiaRol struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Desc  string `json:"desc"`
	Icon  string `json:"icon"`
}

var guiasRoles = []guiaRol{
	{RoleInventario, "Inventario", "Artículos, categorías, ajustes y movimientos.", "package"},
	{RoleOptometrist, "Optometrista", "Agenda, expedientes, exámenes y pedidos.", "eye"},
	{RoleReceptionist, "Recepción", "Citas, punto de venta, Clarito y pedidos.", "monitor"},
	{RoleLaboratorio, "Laboratorio", "Trabajos, estados y entregas.", "tool"},
	{RoleAdmin, "Administrador", "Todo el panel de administración.", "shield"},
	{RoleBlogger, "Blog", "Crear y publicar entradas del blog.", "edit-3"},
}

func guiaRolValido(r string) bool {
	for _, g := range guiasRoles {
		if g.Key == r {
			return true
		}
	}
	return false
}

// guiaKeyValida: guias/<rol>/<archivo>.pdf, sin subcarpetas.
func guiaKeyValida(key string) (string, bool) {
	if !claritoValidKey(key, guiasPrefix) {
		return "", false
	}
	parts := strings.Split(strings.TrimPrefix(key, guiasPrefix), "/")
	if len(parts) != 2 || !guiaRolValido(parts[0]) || parts[1] == "" ||
		!strings.EqualFold(filepath.Ext(parts[1]), ".pdf") {
		return "", false
	}
	return parts[0], true
}

type guiaJSON struct {
	Key      string    `json:"key"`
	Name     string    `json:"name"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

// AdminGuiasPage — GET /admin/guias
func AdminGuiasPage(c *gin.Context) {
	c.HTML(http.StatusOK, "guias.html", WithStaff(c, gin.H{
		"ActivePage": "admin-guias",
	}))
}

// AdminContabilidadPage — GET /admin/contabilidad (todavía vacía)
func AdminContabilidadPage(c *gin.Context) {
	c.HTML(http.StatusOK, "contabilidad.html", WithStaff(c, gin.H{
		"ActivePage": "admin-contabilidad",
	}))
}

// GuiasList — GET /api/admin/guias
func GuiasList(c *gin.Context) {
	if !storage.Ready() {
		c.JSON(http.StatusOK, gin.H{"ready": false, "roles": guiasRoles, "items": gin.H{}})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	objs, err := storage.ListPrefix(ctx, guiasPrefix, 5000)
	if err != nil {
		log.Printf("guias.List: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "El almacenamiento no respondió. Intenta de nuevo."})
		return
	}
	items := map[string][]guiaJSON{}
	for _, g := range guiasRoles {
		items[g.Key] = []guiaJSON{}
	}
	for _, o := range objs {
		rol, ok := guiaKeyValida(o.Key)
		if !ok {
			continue
		}
		items[rol] = append(items[rol], guiaJSON{Key: o.Key, Name: claritoBaseName(o.Key), Size: o.Size, Modified: o.Modified})
	}
	for k := range items {
		l := items[k]
		sort.Slice(l, func(i, j int) bool { return strings.ToLower(l[i].Name) < strings.ToLower(l[j].Name) })
	}
	c.JSON(http.StatusOK, gin.H{"ready": true, "roles": guiasRoles, "items": items})
}

// GuiasUpload — POST /api/admin/guias (multipart: role, file, replace)
func GuiasUpload(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, guiasMaxUpload+(1<<20))
	rol := c.PostForm("role")
	if !guiaRolValido(rol) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige el rol de la guía."})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No llegó el PDF (máximo 60 MB)."})
		return
	}
	if fh.Size > guiasMaxUpload {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "El PDF pesa más de 60 MB."})
		return
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el PDF."})
		return
	}
	content, err := io.ReadAll(f)
	f.Close()
	head := content
	if len(head) > 1024 {
		head = head[:1024]
	}
	if err != nil || !bytes.HasPrefix(bytes.TrimLeft(head, "\xef\xbb\xbf \r\n\t"), []byte("%PDF")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo no es un PDF."})
		return
	}
	name := claritoPDFName(fh.Filename)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo no tiene un nombre válido."})
		return
	}
	key := guiasPrefix + rol + "/" + name
	ctx, cancel := claritoCtx(c)
	defer cancel()
	prev, err := storage.StatObject(ctx, key)
	if err != nil {
		claritoBucketErr(c, "GuiasUpload", err)
		return
	}
	if prev != nil && c.PostForm("replace") != "1" {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya hay una guía llamada «" + name + "» en este rol.", "code": "exists", "name": name})
		return
	}
	if err := storage.UploadObject(ctx, key, bytes.NewReader(content), int64(len(content)), "application/pdf"); err != nil {
		claritoBucketErr(c, "GuiasUpload", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "replaced": prev != nil,
		"item": guiaJSON{Key: key, Name: name, Size: int64(len(content)), Modified: time.Now().UTC()}})
}

// GuiasDelete — DELETE /api/admin/guias?key=
func GuiasDelete(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key := c.Query("key")
	if _, ok := guiaKeyValida(key); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Guía inválida."})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if err := storage.DeleteObject(ctx, key); err != nil && !storage.IsNotFound(err) {
		claritoBucketErr(c, "GuiasDelete", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GuiasFile — GET /api/admin/guias/archivo?key=[&download=1]
func GuiasFile(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	key := c.Query("key")
	if _, ok := guiaKeyValida(key); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Guía inválida."})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	body, _, err := storage.GetObject(ctx, key)
	if err != nil {
		if storage.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Esa guía ya no existe."})
			return
		}
		claritoBucketErr(c, "GuiasFile", err)
		return
	}
	defer body.Close()
	name := claritoBaseName(key)
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
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", disp+`; filename="`+ascii+`"; filename*=UTF-8''`+url.PathEscape(name))
	if c.Query("v") != "" {
		c.Header("Cache-Control", "private, max-age=31536000, immutable")
	} else {
		c.Header("Cache-Control", "private, max-age=30")
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, body); err != nil {
		log.Printf("guias.File: %v", err)
	}
}
