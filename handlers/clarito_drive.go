package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// =====================================================================
// Administración → Clarito · Google Drive
//
// Conexión PERMANENTE: al conectar se pide acceso "offline" y Google da
// un refresh_token que se guarda en la base de datos (drive_connection).
// Con él se saca un access_token nuevo cada vez que hace falta, así que
// la cuenta se queda conectada aunque nadie entre en semanas. Solo se
// borra cuando alguien da clic en "Desconectar".
//
// Además, un proceso en segundo plano (StartDriveKeepAlive) renueva el
// token cada 12 h: así Google nunca lo da por inactivo y, si algo falla,
// se ve en el panel.
//
// Permiso que se pide: drive.file → la app SOLO ve los archivos y
// carpetas que ella misma crea (la carpeta principal y lo de adentro).
// No puede leer el resto del Drive de la cuenta.
//
// Variables de entorno (Railway → Variables):
//   GOOGLE_DRIVE_CLIENT_ID       (de Google Cloud → Credenciales)
//   GOOGLE_DRIVE_CLIENT_SECRET
//   GOOGLE_DRIVE_REDIRECT_URL    ej. https://avanteopticsmx.com/api/clarito/drive/callback
//                                (si no está, se arma con el dominio actual)
// =====================================================================

const (
	driveScope       = "https://www.googleapis.com/auth/drive.file"
	driveAPI         = "https://www.googleapis.com/drive/v3"
	driveUploadAPI   = "https://www.googleapis.com/upload/drive/v3"
	googleTokenURL   = "https://oauth2.googleapis.com/token"
	googleAuthURL    = "https://accounts.google.com/o/oauth2/v2/auth"
	googleRevokeURL  = "https://oauth2.googleapis.com/revoke"
	driveFolderMime  = "application/vnd.google-apps.folder"
	driveDefaultRoot = "Avante Optics · Clarito"
	driveStateCookie = "drive_oauth_state"
	claritoMaxUpload = 15 << 20
)

var (
	errDriveNotConnected = errors.New("Google Drive no está conectado")
	errDriveReconnect    = errors.New("Google rechazó el permiso; hay que volver a conectar Google Drive")
	driveTokenMu         sync.Mutex
	driveHTTP            = &http.Client{Timeout: 60 * time.Second}
)

// ClaritoSettings es cómo se organizan los archivos en Drive.
type ClaritoSettings struct {
	Organize        string `json:"organize"`          // ninguna | formato | formato_mes | mes_formato | cliente | formato_cliente
	FileName        string `json:"file_name"`         // ej. "{formato} - {cliente} - {fecha}"
	DefaultFolderID string `json:"default_folder_id"` // carpeta base (vacío = la principal)
	DefaultFolder   string `json:"default_folder"`    // nombre para mostrar
}

func defaultClaritoSettings() ClaritoSettings {
	return ClaritoSettings{Organize: "formato_mes", FileName: "{formato} - {cliente} - {fecha}"}
}

func loadClaritoSettings(c *models.DriveConnection) ClaritoSettings {
	s := defaultClaritoSettings()
	if c != nil && c.Settings != "" {
		_ = json.Unmarshal([]byte(c.Settings), &s)
	}
	if s.Organize == "" {
		s.Organize = "formato_mes"
	}
	if s.FileName == "" {
		s.FileName = "{formato} - {cliente} - {fecha}"
	}
	return s
}

/* ---------------------------------------------------------------------
   OAuth
   --------------------------------------------------------------------- */

func driveClientID() string     { return strings.TrimSpace(os.Getenv("GOOGLE_DRIVE_CLIENT_ID")) }
func driveClientSecret() string { return strings.TrimSpace(os.Getenv("GOOGLE_DRIVE_CLIENT_SECRET")) }

func driveRedirectURL(c *gin.Context) string {
	if u := strings.TrimSpace(os.Getenv("GOOGLE_DRIVE_REDIRECT_URL")); u != "" {
		return u
	}
	scheme := "https"
	if p := c.GetHeader("X-Forwarded-Proto"); p != "" {
		scheme = strings.Split(p, ",")[0]
	} else if c.Request.TLS == nil && strings.HasPrefix(c.Request.Host, "localhost") {
		scheme = "http"
	}
	return scheme + "://" + c.Request.Host + "/api/clarito/drive/callback"
}

type googleToken struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	ExpiresIn        int    `json:"expires_in"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

func postToken(form url.Values) (*googleToken, error) {
	resp, err := driveHTTP.PostForm(googleTokenURL, form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var t googleToken
	if err := json.NewDecoder(resp.Body).Decode(&t); err != nil {
		return nil, fmt.Errorf("respuesta inválida de Google (%d)", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK || t.Error != "" {
		if t.Error == "invalid_grant" {
			return &t, errDriveReconnect
		}
		return &t, fmt.Errorf("Google: %s %s", t.Error, t.ErrorDescription)
	}
	return &t, nil
}

// driveAccessToken regresa un access token válido (lo renueva si hace falta).
func driveAccessToken() (string, error) {
	driveTokenMu.Lock()
	defer driveTokenMu.Unlock()
	conn, err := models.GetDriveConnection()
	if err != nil {
		return "", err
	}
	if conn == nil {
		return "", errDriveNotConnected
	}
	if conn.AccessToken != "" && time.Until(conn.Expiry) > 2*time.Minute {
		return conn.AccessToken, nil
	}
	t, err := postToken(url.Values{
		"client_id":     {driveClientID()},
		"client_secret": {driveClientSecret()},
		"refresh_token": {conn.RefreshToken},
		"grant_type":    {"refresh_token"},
	})
	if err != nil {
		if errors.Is(err, errDriveReconnect) {
			_ = models.MarkDriveError("Google rechazó el permiso (invalid_grant). Vuelve a conectar la cuenta.")
		} else {
			_ = models.MarkDriveError(err.Error())
		}
		return "", err
	}
	exp := time.Now().Add(time.Duration(t.ExpiresIn) * time.Second)
	_ = models.UpdateDriveAccessToken(t.AccessToken, exp, t.RefreshToken)
	return t.AccessToken, nil
}

// StartDriveKeepAlive renueva el token cada 12 horas para que la cuenta
// nunca se dé por inactiva. Llamar una vez en main.go (go handlers.StartDriveKeepAlive()).
func StartDriveKeepAlive() {
	tick := func() {
		conn, err := models.GetDriveConnection()
		if err != nil || conn == nil {
			return
		}
		// Forzar renovación aunque el token actual siga vigente.
		driveTokenMu.Lock()
		_ = models.UpdateDriveAccessToken("", time.Now(), "")
		driveTokenMu.Unlock()
		if _, err := driveAccessToken(); err != nil {
			log.Printf("clarito: no se pudo renovar el token de Drive: %v", err)
		}
	}
	time.Sleep(30 * time.Second)
	tick()
	t := time.NewTicker(12 * time.Hour)
	for range t.C {
		tick()
	}
}

/* ---------------------------------------------------------------------
   Llamadas a la API de Drive
   --------------------------------------------------------------------- */

type driveFile struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	MimeType     string   `json:"mimeType"`
	ModifiedTime string   `json:"modifiedTime,omitempty"`
	Size         string   `json:"size,omitempty"`
	WebViewLink  string   `json:"webViewLink,omitempty"`
	Parents      []string `json:"parents,omitempty"`
	Trashed      bool     `json:"trashed,omitempty"`
}

func driveDo(method, rawURL string, body io.Reader, contentType string) (*http.Response, error) {
	tok, err := driveAccessToken()
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(method, rawURL, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	return driveHTTP.Do(req)
}

func driveJSON(method, rawURL string, in, out interface{}) error {
	var body io.Reader
	ct := ""
	if in != nil {
		b, _ := json.Marshal(in)
		body = bytes.NewReader(b)
		ct = "application/json"
	}
	resp, err := driveDo(method, rawURL, body, ct)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2000))
		return fmt.Errorf("Drive %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

func driveQuote(s string) string {
	return strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(s)
}

const driveFields = "id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed"

func driveGet(id string) (*driveFile, error) {
	var f driveFile
	err := driveJSON("GET", driveAPI+"/files/"+url.PathEscape(id)+"?fields="+driveFields, nil, &f)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func driveList(parent string) ([]driveFile, error) {
	q := "'" + driveQuote(parent) + "' in parents and trashed = false"
	all := []driveFile{}
	page := ""
	for i := 0; i < 10; i++ {
		u := driveAPI + "/files?pageSize=200&orderBy=folder,name_natural&fields=nextPageToken,files(" + driveFields + ")&q=" + url.QueryEscape(q)
		if page != "" {
			u += "&pageToken=" + url.QueryEscape(page)
		}
		var res struct {
			Files         []driveFile `json:"files"`
			NextPageToken string      `json:"nextPageToken"`
		}
		if err := driveJSON("GET", u, nil, &res); err != nil {
			return nil, err
		}
		all = append(all, res.Files...)
		if res.NextPageToken == "" {
			break
		}
		page = res.NextPageToken
	}
	return all, nil
}

func driveCreateFolder(parent, name string) (*driveFile, error) {
	meta := map[string]interface{}{"name": name, "mimeType": driveFolderMime}
	if parent != "" {
		meta["parents"] = []string{parent}
	}
	var f driveFile
	if err := driveJSON("POST", driveAPI+"/files?fields="+driveFields, meta, &f); err != nil {
		return nil, err
	}
	return &f, nil
}

// driveEnsureFolder busca una subcarpeta por nombre y la crea si no existe.
func driveEnsureFolder(parent, name string) (*driveFile, error) {
	q := "'" + driveQuote(parent) + "' in parents and name = '" + driveQuote(name) + "' and mimeType = '" + driveFolderMime + "' and trashed = false"
	var res struct {
		Files []driveFile `json:"files"`
	}
	if err := driveJSON("GET", driveAPI+"/files?pageSize=1&fields=files("+driveFields+")&q="+url.QueryEscape(q), nil, &res); err != nil {
		return nil, err
	}
	if len(res.Files) > 0 {
		return &res.Files[0], nil
	}
	return driveCreateFolder(parent, name)
}

func driveUpload(parent, name, mime string, content []byte) (*driveFile, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Type", "application/json; charset=UTF-8")
	part, _ := w.CreatePart(h)
	meta, _ := json.Marshal(map[string]interface{}{"name": name, "parents": []string{parent}, "mimeType": mime})
	_, _ = part.Write(meta)
	h2 := make(textproto.MIMEHeader)
	h2.Set("Content-Type", mime)
	part2, _ := w.CreatePart(h2)
	_, _ = part2.Write(content)
	_ = w.Close()

	resp, err := driveDo("POST", driveUploadAPI+"/files?uploadType=multipart&fields="+driveFields, &buf, "multipart/related; boundary="+w.Boundary())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2000))
		return nil, fmt.Errorf("Drive %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var f driveFile
	if err := json.NewDecoder(resp.Body).Decode(&f); err != nil {
		return nil, err
	}
	return &f, nil
}

// driveEnsureRoot revisa que la carpeta principal exista (y no esté en la
// papelera); si no, la crea otra vez.
func driveEnsureRoot(conn *models.DriveConnection) (string, string, error) {
	if conn.RootID != "" {
		if f, err := driveGet(conn.RootID); err == nil && !f.Trashed {
			return f.ID, f.Name, nil
		}
	}
	name := conn.RootName
	if name == "" {
		name = driveDefaultRoot
	}
	f, err := driveCreateFolder("", name)
	if err != nil {
		return "", "", err
	}
	_ = models.UpdateDriveRoot(f.ID, f.Name)
	return f.ID, f.Name, nil
}

// driveIsInside dice si una carpeta/archivo está dentro de la carpeta
// principal (sube por los padres, máximo 12 niveles).
func driveIsInside(id, root string) bool {
	cur := id
	for i := 0; i < 12 && cur != ""; i++ {
		if cur == root {
			return true
		}
		f, err := driveGet(cur)
		if err != nil || len(f.Parents) == 0 {
			return false
		}
		cur = f.Parents[0]
	}
	return false
}

func driveErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errDriveNotConnected):
		c.JSON(http.StatusConflict, gin.H{"error": "Primero conecta Google Drive.", "code": "not_connected"})
	case errors.Is(err, errDriveReconnect):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "reconnect"})
	default:
		log.Printf("clarito/drive: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Google Drive no respondió. Intenta de nuevo."})
	}
}

func staffName(c *gin.Context) string {
	v, _ := c.Get("staff_name")
	s, _ := v.(string)
	return s
}

/* ---------------------------------------------------------------------
   Rutas
   --------------------------------------------------------------------- */

// ClaritoDriveStatus — GET /api/clarito/drive/status
func ClaritoDriveStatus(c *gin.Context) {
	configured := driveClientID() != "" && driveClientSecret() != ""
	conn, err := models.GetDriveConnection()
	if err != nil {
		log.Printf("clarito.Status: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer la conexión de Drive. ¿Ya se creó la tabla drive_connection?"})
		return
	}
	if conn == nil {
		c.JSON(http.StatusOK, gin.H{"configured": configured, "connected": false, "settings": defaultClaritoSettings()})
		return
	}
	rootLink := ""
	if conn.RootID != "" {
		rootLink = "https://drive.google.com/drive/folders/" + conn.RootID
	}
	c.JSON(http.StatusOK, gin.H{
		"configured":   configured,
		"connected":    true,
		"status":       conn.Status,
		"error":        conn.LastError,
		"email":        conn.Email,
		"name":         conn.Name,
		"root":         gin.H{"id": conn.RootID, "name": conn.RootName, "link": rootLink},
		"settings":     loadClaritoSettings(conn),
		"connected_by": conn.ConnectedBy,
		"connected_at": conn.ConnectedAt,
		"checked_at":   conn.CheckedAt,
	})
}

// ClaritoDriveConnect — GET /api/clarito/drive/connect → manda a Google.
func ClaritoDriveConnect(c *gin.Context) {
	if driveClientID() == "" || driveClientSecret() == "" {
		c.String(http.StatusServiceUnavailable, "Falta configurar GOOGLE_DRIVE_CLIENT_ID y GOOGLE_DRIVE_CLIENT_SECRET en las variables del servidor.")
		return
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := hex.EncodeToString(b)
	secure := c.Request.TLS != nil || strings.HasPrefix(c.GetHeader("X-Forwarded-Proto"), "https")
	http.SetCookie(c.Writer, &http.Cookie{Name: driveStateCookie, Value: state, Path: "/", MaxAge: 600, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
	q := url.Values{
		"client_id":              {driveClientID()},
		"redirect_uri":           {driveRedirectURL(c)},
		"response_type":          {"code"},
		"scope":                  {driveScope + " openid email profile"},
		"access_type":            {"offline"}, // refresh_token → conexión permanente
		"prompt":                 {"consent select_account"},
		"include_granted_scopes": {"true"},
		"state":                  {state},
	}
	c.Redirect(http.StatusFound, googleAuthURL+"?"+q.Encode())
}

// ClaritoDriveCallback — GET /api/clarito/drive/callback (Google regresa aquí)
func ClaritoDriveCallback(c *gin.Context) {
	back := "/receptionist/administracion?tab=clarito"
	fail := func(msg string) {
		c.Redirect(http.StatusFound, back+"&drive_error="+url.QueryEscape(msg))
	}
	if e := c.Query("error"); e != "" {
		fail("Se canceló la conexión con Google.")
		return
	}
	ck, err := c.Request.Cookie(driveStateCookie)
	if err != nil || ck.Value == "" || ck.Value != c.Query("state") {
		fail("La conexión expiró. Intenta otra vez.")
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: driveStateCookie, Value: "", Path: "/", MaxAge: -1})

	t, err := postToken(url.Values{
		"code":          {c.Query("code")},
		"client_id":     {driveClientID()},
		"client_secret": {driveClientSecret()},
		"redirect_uri":  {driveRedirectURL(c)},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		log.Printf("clarito.Callback: %v", err)
		fail("Google no aceptó la conexión. Intenta otra vez.")
		return
	}
	prev, _ := models.GetDriveConnection()
	refresh := t.RefreshToken
	if refresh == "" && prev != nil {
		refresh = prev.RefreshToken
	}
	if refresh == "" {
		fail("Google no dio permiso permanente. Quita el acceso de la app en tu cuenta de Google y vuelve a conectar.")
		return
	}

	// Quién se conectó
	email, name := "", ""
	if req, err := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v3/userinfo", nil); err == nil {
		req.Header.Set("Authorization", "Bearer "+t.AccessToken)
		if resp, err := driveHTTP.Do(req); err == nil {
			var u struct {
				Email string `json:"email"`
				Name  string `json:"name"`
			}
			_ = json.NewDecoder(resp.Body).Decode(&u)
			resp.Body.Close()
			email, name = u.Email, u.Name
		}
	}

	conn := models.DriveConnection{
		Email: email, Name: name, RefreshToken: refresh, AccessToken: t.AccessToken,
		Expiry: time.Now().Add(time.Duration(t.ExpiresIn) * time.Second), ConnectedBy: staffName(c),
	}
	// Si es la misma cuenta, se conserva la carpeta principal y la configuración.
	if prev != nil && strings.EqualFold(prev.Email, email) {
		conn.RootID, conn.RootName, conn.Settings = prev.RootID, prev.RootName, prev.Settings
	}
	if err := models.SaveDriveConnection(conn); err != nil {
		log.Printf("clarito.Callback: guardar: %v", err)
		fail("No se pudo guardar la conexión.")
		return
	}
	saved, _ := models.GetDriveConnection()
	if saved != nil {
		if _, _, err := driveEnsureRoot(saved); err != nil {
			log.Printf("clarito.Callback: carpeta principal: %v", err)
		}
	}
	c.Redirect(http.StatusFound, back+"&drive=conectado")
}

// ClaritoDriveDisconnect — POST /api/clarito/drive/disconnect (solo a mano)
func ClaritoDriveDisconnect(c *gin.Context) {
	conn, err := models.GetDriveConnection()
	if err == nil && conn != nil && conn.RefreshToken != "" {
		_, _ = driveHTTP.PostForm(googleRevokeURL, url.Values{"token": {conn.RefreshToken}})
	}
	if err := models.DeleteDriveConnection(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo desconectar."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ClaritoDriveSettings — PUT /api/clarito/drive/settings
func ClaritoDriveSettings(c *gin.Context) {
	conn, err := models.GetDriveConnection()
	if err != nil || conn == nil {
		driveErr(c, errDriveNotConnected)
		return
	}
	var body struct {
		ClaritoSettings
		RootName string `json:"root_name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	valid := map[string]bool{"ninguna": true, "formato": true, "formato_mes": true, "mes_formato": true, "cliente": true, "formato_cliente": true}
	if !valid[body.Organize] {
		body.Organize = "formato_mes"
	}
	body.FileName = strings.TrimSpace(body.FileName)
	if body.FileName == "" || len(body.FileName) > 200 {
		body.FileName = "{formato} - {cliente} - {fecha}"
	}
	rootID, _, err := driveEnsureRoot(conn)
	if err != nil {
		driveErr(c, err)
		return
	}
	if body.DefaultFolderID != "" && body.DefaultFolderID != rootID && !driveIsInside(body.DefaultFolderID, rootID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Esa carpeta no está dentro de la carpeta principal."})
		return
	}
	// Renombrar la carpeta principal
	if n := strings.TrimSpace(body.RootName); n != "" && n != conn.RootName && len(n) <= 120 {
		if err := driveJSON("PATCH", driveAPI+"/files/"+url.PathEscape(rootID)+"?fields=id,name", map[string]string{"name": n}, nil); err == nil {
			_ = models.UpdateDriveRoot(rootID, n)
		}
	}
	b, _ := json.Marshal(body.ClaritoSettings)
	if err := models.UpdateDriveSettings(string(b)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "settings": body.ClaritoSettings})
}

// ClaritoDriveList — GET /api/clarito/drive/folder?id=…  (vacío = principal)
// Regresa la carpeta, su ruta (migas) y lo que tiene adentro.
func ClaritoDriveList(c *gin.Context) {
	conn, err := models.GetDriveConnection()
	if err != nil || conn == nil {
		driveErr(c, errDriveNotConnected)
		return
	}
	rootID, rootName, err := driveEnsureRoot(conn)
	if err != nil {
		driveErr(c, err)
		return
	}
	id := c.Query("id")
	if id == "" {
		id = rootID
	}
	// Migas de pan: de la carpeta actual hacia arriba hasta la principal.
	crumbs := []gin.H{}
	cur := id
	for i := 0; i < 12; i++ {
		if cur == rootID {
			crumbs = append([]gin.H{{"id": rootID, "name": rootName}}, crumbs...)
			break
		}
		f, err := driveGet(cur)
		if err != nil {
			driveErr(c, err)
			return
		}
		if f.MimeType != driveFolderMime || len(f.Parents) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Esa carpeta no está dentro de la carpeta principal."})
			return
		}
		crumbs = append([]gin.H{{"id": f.ID, "name": f.Name}}, crumbs...)
		cur = f.Parents[0]
		if i == 11 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Esa carpeta no está dentro de la carpeta principal."})
			return
		}
	}
	files, err := driveList(id)
	if err != nil {
		driveErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":     id,
		"link":   "https://drive.google.com/drive/folders/" + id,
		"crumbs": crumbs,
		"items":  files,
	})
}

// ClaritoDriveCreateFolder — POST /api/clarito/drive/folder {parent, name}
func ClaritoDriveCreateFolder(c *gin.Context) {
	conn, err := models.GetDriveConnection()
	if err != nil || conn == nil {
		driveErr(c, errDriveNotConnected)
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
	name := cleanDriveName(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe el nombre de la carpeta."})
		return
	}
	rootID, _, err := driveEnsureRoot(conn)
	if err != nil {
		driveErr(c, err)
		return
	}
	parent := body.Parent
	if parent == "" {
		parent = rootID
	}
	if parent != rootID && !driveIsInside(parent, rootID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Esa carpeta no está dentro de la carpeta principal."})
		return
	}
	f, err := driveEnsureFolder(parent, name)
	if err != nil {
		driveErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": f})
}

// ClaritoDriveFile — GET /api/clarito/drive/file/:id  → el PDF para la
// vista previa dentro del panel (sin tener que iniciar sesión en Google).
func ClaritoDriveFile(c *gin.Context) {
	conn, err := models.GetDriveConnection()
	if err != nil || conn == nil {
		driveErr(c, errDriveNotConnected)
		return
	}
	id := c.Param("id")
	if !driveIsInside(id, conn.RootID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese archivo no está en la carpeta de Clarito."})
		return
	}
	resp, err := driveDo("GET", driveAPI+"/files/"+url.PathEscape(id)+"?alt=media", nil, "")
	if err != nil {
		driveErr(c, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "No se pudo abrir el archivo."})
		return
	}
	c.Header("Content-Type", resp.Header.Get("Content-Type"))
	c.Header("Cache-Control", "private, max-age=60")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, io.LimitReader(resp.Body, 50<<20))
}

var driveBadChars = regexp.MustCompile(`[\\/:*?"<>|\x00-\x1f]+`)

func cleanDriveName(s string) string {
	s = driveBadChars.ReplaceAllString(strings.TrimSpace(s), " ")
	s = strings.Join(strings.Fields(s), " ")
	if len([]rune(s)) > 120 {
		s = string([]rune(s)[:120])
	}
	return s
}

var mesesES = []string{"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"}

// claritoSubfolders arma la ruta de subcarpetas según "organizar".
func claritoSubfolders(organize, formName, client string, t time.Time) []string {
	mes := fmt.Sprintf("%04d-%02d %s", t.Year(), int(t.Month()), mesesES[t.Month()-1])
	cliente := cleanDriveName(client)
	if cliente == "" {
		cliente = "Sin nombre"
	}
	switch organize {
	case "formato":
		return []string{formName}
	case "formato_mes":
		return []string{formName, mes}
	case "mes_formato":
		return []string{mes, formName}
	case "cliente":
		return []string{cliente}
	case "formato_cliente":
		return []string{formName, cliente}
	default:
		return nil
	}
}

// ClaritoUpload — POST /api/clarito/documents (multipart)
//
//	file        el PDF ya llenado
//	form_key    registro | garantia | unison …
//	form_name   "Registro Clarito+"
//	client      nombre del cliente (para organizar y para el registro)
//	file_name   nombre del archivo (sin .pdf)
//	folder_id   opcional: carpeta elegida a mano (entonces no se organiza)
func ClaritoUpload(c *gin.Context) {
	conn, err := models.GetDriveConnection()
	if err != nil || conn == nil {
		driveErr(c, errDriveNotConnected)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, claritoMaxUpload+(1<<20))
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No llegó el PDF."})
		return
	}
	if fh.Size > claritoMaxUpload {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "El PDF es demasiado grande."})
		return
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el PDF."})
		return
	}
	content, err := io.ReadAll(f)
	f.Close()
	if err != nil || !bytes.HasPrefix(content, []byte("%PDF")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El archivo no es un PDF."})
		return
	}

	formKey := strings.TrimSpace(c.PostForm("form_key"))
	formName := cleanDriveName(c.PostForm("form_name"))
	client := strings.TrimSpace(c.PostForm("client"))
	if formName == "" {
		formName = "Formato"
	}
	name := cleanDriveName(strings.TrimSuffix(c.PostForm("file_name"), ".pdf"))
	if name == "" {
		name = formName + " - " + time.Now().Format("2006-01-02 15-04")
	}
	name += ".pdf"

	rootID, rootName, err := driveEnsureRoot(conn)
	if err != nil {
		driveErr(c, err)
		return
	}
	settings := loadClaritoSettings(conn)

	// Carpeta destino
	target := rootID
	path := []string{rootName}
	if chosen := c.PostForm("folder_id"); chosen != "" {
		if chosen != rootID && !driveIsInside(chosen, rootID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Esa carpeta no está dentro de la carpeta principal."})
			return
		}
		target = chosen
		if fi, err := driveGet(chosen); err == nil && chosen != rootID {
			path = append(path, "…", fi.Name)
		}
	} else {
		if settings.DefaultFolderID != "" && driveIsInside(settings.DefaultFolderID, rootID) {
			target = settings.DefaultFolderID
			if settings.DefaultFolder != "" {
				path = append(path, settings.DefaultFolder)
			}
		}
		for _, sub := range claritoSubfolders(settings.Organize, formName, client, time.Now()) {
			fo, err := driveEnsureFolder(target, sub)
			if err != nil {
				driveErr(c, err)
				return
			}
			target = fo.ID
			path = append(path, sub)
		}
	}

	up, err := driveUpload(target, name, "application/pdf", content)
	if err != nil {
		driveErr(c, err)
		return
	}
	doc := models.ClaritoDocument{
		FormKey: formKey, FormName: formName, ClientName: client, FileName: up.Name,
		DriveID: up.ID, FolderID: target, FolderPath: strings.Join(path, " / "),
		WebLink: up.WebViewLink, CreatedBy: staffName(c),
	}
	if id, err := models.CreateClaritoDocument(doc); err == nil {
		doc.ID = id
	} else {
		log.Printf("clarito.Upload: registro: %v", err)
	}
	doc.CreatedAt = time.Now()
	c.JSON(http.StatusOK, gin.H{"ok": true, "document": doc, "folder_link": "https://drive.google.com/drive/folders/" + target})
}

// ClaritoDocuments — GET /api/clarito/documents (los últimos guardados)
func ClaritoDocuments(c *gin.Context) {
	docs, err := models.ListClaritoDocuments(100)
	if err != nil {
		log.Printf("clarito.Documents: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los formatos guardados."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": docs})
}
