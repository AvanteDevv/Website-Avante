package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"image"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"regexp"
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
// Clarito · Firma desde el celular del cliente
//
// 1. Recepción llena el formato y en la firma del cliente da clic en
//    "Firmar con su celular". El panel sube una copia del PDF (para que el
//    cliente vea lo que firma) y pide un link: /firmar/<token>.
// 2. El cliente abre el link (QR, WhatsApp o copiado), ve el formato y
//    firma con el dedo. La firma se guarda en clarito_sign_requests.
// 3. El panel pregunta cada pocos segundos; cuando ya firmó, pone la firma
//    en el PDF y recepción solo da "Guardar".
//
// El link vence en 24 h y solo se puede firmar una vez. El token tiene
// 256 bits aleatorios: no se puede adivinar.
// =====================================================================

const (
	claritoSignPrefix   = "clarito/firmas/"
	claritoSignHours    = 24
	claritoSignMaxBytes = 1500 << 10
)

var claritoTokenRe = regexp.MustCompile(`^[a-f0-9]{64}$`)

func claritoBaseURL(c *gin.Context) string {
	scheme := "https"
	if p := c.GetHeader("X-Forwarded-Proto"); p != "" {
		scheme = strings.TrimSpace(strings.Split(p, ",")[0])
	} else if c.Request.TLS == nil && (strings.HasPrefix(c.Request.Host, "localhost") || strings.HasPrefix(c.Request.Host, "127.0.0.1")) {
		scheme = "http"
	}
	return scheme + "://" + c.Request.Host
}

func claritoCleanText(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > max {
		s = string(r[:max])
	}
	return s
}

// claritoSignCleanup borra los PDF de vista previa que ya no se ocupan.
func claritoSignCleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	drafts, err := models.OldClaritoSignDrafts(50)
	if err != nil {
		return
	}
	for token, key := range drafts {
		if storage.Ready() && strings.HasPrefix(key, claritoSignPrefix) {
			if err := storage.DeleteObject(ctx, key); err != nil && !storage.IsNotFound(err) {
				continue
			}
		}
		_ = models.ClearClaritoSignDraft(token)
	}
	_ = models.PurgeClaritoSignRequests()
}

/* ---------------------------------------------------------------------
   Panel (recepción / admin)
   --------------------------------------------------------------------- */

// ClaritoCreateSignRequest — POST /api/clarito/sign-requests (multipart)
//
//	file         cómo va el formato (JPEG ligero, o PDF) para que el cliente lo vea
//	form_name    "Garantía Clarito+"
//	client       nombre del cliente
//	field_label  "Nombre y firma del cliente"
func ClaritoCreateSignRequest(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, claritoMaxUpload+(1<<20))
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el link."})
		return
	}
	token := hex.EncodeToString(b)
	req := models.ClaritoSignRequest{
		Token:      token,
		FormName:   claritoCleanText(c.PostForm("form_name"), 160),
		ClientName: claritoCleanText(c.PostForm("client"), 190),
		FieldLabel: claritoCleanText(c.PostForm("field_label"), 190),
		CreatedBy:  staffName(c),
	}
	if req.FieldLabel == "" {
		req.FieldLabel = "Firma del cliente"
	}

	// Copia del PDF para que el cliente vea lo que firma.
	if fh, err := c.FormFile("file"); err == nil && storage.Ready() && fh.Size <= claritoMaxUpload {
		if f, err := fh.Open(); err == nil {
			content, err := io.ReadAll(f)
			f.Close()
			ext, ctype := "", ""
			switch {
			case bytes.HasPrefix(content, []byte("%PDF")):
				ext, ctype = ".pdf", "application/pdf"
			case bytes.HasPrefix(content, []byte{0xFF, 0xD8, 0xFF}):
				ext, ctype = ".jpg", "image/jpeg"
			}
			if err == nil && ext != "" {
				ctx, cancel := claritoCtx(c)
				key := claritoSignPrefix + token + ext
				if err := storage.UploadObject(ctx, key, bytes.NewReader(content), int64(len(content)), ctype); err == nil {
					req.DraftKey = key
				} else {
					log.Printf("clarito.SignRequest: vista previa: %v", err)
				}
				cancel()
			}
		}
	}
	if err := models.CreateClaritoSignRequest(req, claritoSignHours); err != nil {
		log.Printf("clarito.SignRequest: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el link. ¿Ya se creó la tabla clarito_sign_requests?"})
		return
	}
	go claritoSignCleanup()
	c.Set("clarito_name", req.ClientName)
	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"url":        claritoBaseURL(c) + "/firmar/" + token,
		"expires_in": claritoSignHours * 3600,
	})
}

// ClaritoGetSignRequest — GET /api/clarito/sign-requests/:token
// El panel lo consulta cada pocos segundos hasta que el cliente firma.
func ClaritoGetSignRequest(c *gin.Context) {
	token := c.Param("token")
	if !claritoTokenRe.MatchString(token) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Link inválido."})
		return
	}
	r, err := models.GetClaritoSignRequest(token)
	if err != nil {
		log.Printf("clarito.GetSign: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo revisar la firma."})
		return
	}
	if r == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese link ya no existe."})
		return
	}
	status := r.Status
	if status == "pendiente" && r.Expired {
		status = "vencida"
	}
	out := gin.H{"status": status}
	if status == "firmada" {
		out["signature"] = r.Signature
		out["signed_at"] = r.SignedAt
	}
	c.JSON(http.StatusOK, out)
}

// ClaritoCancelSignRequest — DELETE /api/clarito/sign-requests/:token
func ClaritoCancelSignRequest(c *gin.Context) {
	token := c.Param("token")
	if !claritoTokenRe.MatchString(token) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Link inválido."})
		return
	}
	if err := models.CancelClaritoSignRequest(token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cancelar."})
		return
	}
	go claritoSignCleanup()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

/* ---------------------------------------------------------------------
   Página pública del cliente (sin iniciar sesión)
   --------------------------------------------------------------------- */

// ClaritoSignPage — GET /firmar/:token
func ClaritoSignPage(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("X-Robots-Tag", "noindex, nofollow")
	c.Header("Referrer-Policy", "no-referrer")
	token := c.Param("token")
	state, r := "invalida", (*models.ClaritoSignRequest)(nil)
	if claritoTokenRe.MatchString(token) {
		if got, err := models.GetClaritoSignRequest(token); err == nil && got != nil {
			r = got
			switch {
			case got.Status == "firmada":
				state = "firmada"
			case got.Status == "cancelada":
				state = "cancelada"
			case got.Expired:
				state = "vencida"
			default:
				state = "pendiente"
			}
		}
	}
	data := gin.H{"State": state, "Token": token}
	if r != nil {
		data["FormName"] = r.FormName
		data["ClientName"] = r.ClientName
		data["FieldLabel"] = r.FieldLabel
		data["HasDoc"] = r.DraftKey != "" && state == "pendiente"
		data["DocIsImage"] = strings.HasSuffix(r.DraftKey, ".jpg")
	}
	c.HTML(http.StatusOK, "firmar-clarito.html", data)
}

// ClaritoSignDocument — GET /firmar/:token/documento (el PDF a firmar)
func ClaritoSignDocument(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	token := c.Param("token")
	if !claritoTokenRe.MatchString(token) || !storage.Ready() {
		c.Status(http.StatusNotFound)
		return
	}
	r, err := models.GetClaritoSignRequest(token)
	if err != nil || r == nil || r.Status != "pendiente" || r.Expired || r.DraftKey == "" {
		c.Status(http.StatusNotFound)
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	body, _, err := storage.GetObject(ctx, r.DraftKey)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()
	if strings.HasSuffix(r.DraftKey, ".jpg") {
		c.Header("Content-Type", "image/jpeg")
	} else {
		c.Header("Content-Type", "application/pdf")
	}
	c.Header("Content-Disposition", "inline")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, io.LimitReader(body, 60<<20))
}

// ClaritoSignSubmit — POST /firmar/:token  {signature: "data:image/png;base64,…"}
func ClaritoSignSubmit(c *gin.Context) {
	token := c.Param("token")
	if !claritoTokenRe.MatchString(token) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Este link no es válido."})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 3<<20)
	var body struct {
		Signature string `json:"signature"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No llegó la firma. Intenta de nuevo."})
		return
	}
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(body.Signature, prefix) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La firma no es válida."})
		return
	}
	raw, err := base64.StdEncoding.DecodeString(body.Signature[len(prefix):])
	if err != nil || len(raw) == 0 || len(raw) > claritoSignMaxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La firma no es válida."})
		return
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || format != "png" || cfg.Width < 20 || cfg.Height < 10 || cfg.Width > 4000 || cfg.Height > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La firma no es válida."})
		return
	}
	ua := c.Request.UserAgent()
	if len(ua) > 250 {
		ua = ua[:250]
	}
	ok, err := models.SignClaritoRequest(token, body.Signature, c.ClientIP(), ua)
	if err != nil {
		log.Printf("clarito.SignSubmit: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la firma. Intenta de nuevo."})
		return
	}
	if !ok {
		c.JSON(http.StatusConflict, gin.H{"error": "Este link ya se usó o ya venció. Pide uno nuevo en la óptica."})
		return
	}
	go claritoSignCleanup()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
