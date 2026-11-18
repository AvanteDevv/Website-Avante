package handlers

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"

	"avante-optics/models"
	"avante-optics/storage"

	"github.com/gin-gonic/gin"
)

// Clarito → "Enviar por WhatsApp": recepción pide un link del formato
// lleno y el navegador abre wa.me con el mensaje. El cliente abre el
// link y ve su PDF sin iniciar sesión (vence en 30 días).

// ClaritoShareLink — POST /api/clarito/share {key}
func ClaritoShareLink(c *gin.Context) {
	if claritoNotReady(c) {
		return
	}
	var in struct {
		Key string `json:"key"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || !claritoValidKey(in.Key, claritoSavedPrefix) ||
		claritoBaseName(in.Key) == claritoFolderMark || !strings.EqualFold(filepath.Ext(in.Key), ".pdf") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Archivo inválido."})
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	if info, err := storage.StatObject(ctx, in.Key); err != nil {
		claritoBucketErr(c, "ShareLink", err)
		return
	} else if info == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese archivo ya no existe."})
		return
	}
	token, exp, err := models.GetOrCreateClaritoShareLink(in.Key, staffName(c))
	if err != nil {
		log.Printf("clarito.ShareLink: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el link."})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"url":        claritoBaseURL(c) + "/formato/" + token,
		"expires_at": exp,
		"days":       models.ClaritoShareDays,
	})
}

var claritoShareToken = regexp.MustCompile(`^[A-Za-z0-9_-]{24}$`)

// ClaritoSharedFile — GET /formato/:token (público) — el PDF, para verlo.
func ClaritoSharedFile(c *gin.Context) {
	token := c.Param("token")
	c.Header("X-Robots-Tag", "noindex, nofollow")
	c.Header("Referrer-Policy", "no-referrer")
	notFound := func(msg string) {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusNotFound, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avante Optics</title></head>`+
			`<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px;text-align:center;color:#1b1f3b">`+
			`<div><h2 style="margin:0 0 8px">Este link ya no está disponible</h2><p style="color:#667;margin:0">`+msg+`</p></div></body></html>`)
	}
	if !claritoShareToken.MatchString(token) || !storage.Ready() {
		notFound("Pídele a Avante Optics que te lo vuelva a mandar.")
		return
	}
	key, ok, err := models.GetClaritoShareKey(token)
	if err != nil {
		log.Printf("clarito.SharedFile: %v", err)
		c.String(http.StatusInternalServerError, "Intenta de nuevo en un momento.")
		return
	}
	if !ok || !claritoValidKey(key, claritoSavedPrefix) {
		notFound("El link venció o el formato ya no existe. Pídele a Avante Optics que te lo vuelva a mandar.")
		return
	}
	ctx, cancel := claritoCtx(c)
	defer cancel()
	body, _, err := storage.GetObject(ctx, key)
	if err != nil {
		if storage.IsNotFound(err) {
			notFound("El formato ya no existe. Pídele a Avante Optics que te lo vuelva a mandar.")
			return
		}
		log.Printf("clarito.SharedFile: %v", err)
		c.String(http.StatusInternalServerError, "Intenta de nuevo en un momento.")
		return
	}
	defer body.Close()
	name := claritoBaseName(key)
	ascii := strings.Map(func(r rune) rune {
		if r < 32 || r > 126 || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", `inline; filename="`+ascii+`"; filename*=UTF-8''`+url.PathEscape(name))
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, io.LimitReader(body, 60<<20))
}
