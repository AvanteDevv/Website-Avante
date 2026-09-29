package handlers

import (
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/auth"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Errores visibles sin entrar a los logs de Railway:
//
//  1. CaptureLogs() guarda en memoria las últimas líneas del log (todo lo
//     que imprime log.Printf, gin, etc.). El admin las ve en
//     GET /admin/logs.
//  2. ErrorRecovery() reemplaza el Recovery de gin: si una página truena
//     (panic, error en una plantilla…), en vez de una pantalla en blanco
//     muestra el error y dónde pasó — el detalle completo solo si tienes
//     sesión de admin; a los demás les sale un mensaje genérico.

const maxLogLines = 1000

type logRing struct {
	mu    sync.Mutex
	lines []string
	part  string
}

var capturedLogs = &logRing{}

func (r *logRing) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	text := r.part + string(p)
	parts := strings.Split(text, "\n")
	r.part = parts[len(parts)-1] // lo que quedó sin salto de línea
	for _, l := range parts[:len(parts)-1] {
		r.lines = append(r.lines, l)
	}
	if over := len(r.lines) - maxLogLines; over > 0 {
		r.lines = append([]string(nil), r.lines[over:]...)
	}
	return len(p), nil
}

func (r *logRing) snapshot() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := append([]string(nil), r.lines...)
	if r.part != "" {
		out = append(out, r.part)
	}
	return out
}

// CaptureLogs va al PRINCIPIO de main(), antes que todo.
func CaptureLogs() {
	w := io.MultiWriter(os.Stderr, capturedLogs)
	log.SetOutput(w)
	gin.DefaultWriter = io.MultiWriter(os.Stdout, capturedLogs)
	gin.DefaultErrorWriter = w
	log.Printf("servidor arrancando %s", time.Now().Format("2006-01-02 15:04:05"))
}

func isAdminSession(c *gin.Context) bool {
	session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
	role, _ := session.Values["staff_role"].(string)
	return role == RoleAdmin
}

// ErrorRecovery reemplaza gin.Recovery() (ver main.go: gin.New() + Use).
func ErrorRecovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			stack := string(debug.Stack())
			log.Printf("[ERROR] %s %s: %v\n%s", c.Request.Method, c.Request.URL.Path, rec, stack)

			// Llamadas de fetch (JSON)
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				msg := "Error del servidor."
				if isAdminSession(c) {
					msg = fmt.Sprintf("Error del servidor: %v", rec)
				}
				if !c.Writer.Written() {
					c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
				}
				c.Abort()
				return
			}

			var body string
			if isAdminSession(c) {
				body = `<div style="font-family:system-ui,sans-serif;max-width:1000px;margin:40px auto;padding:0 20px;color:#15161a">` +
					`<h1 style="color:#c0392b;font-size:22px">Esta página tuvo un error</h1>` +
					`<p><b>Ruta:</b> ` + html.EscapeString(c.Request.Method+" "+c.Request.URL.Path) + `</p>` +
					`<p><b>Error:</b></p><pre style="white-space:pre-wrap;background:#fdecea;color:#a3231b;padding:14px;border-radius:10px">` +
					html.EscapeString(fmt.Sprint(rec)) + `</pre>` +
					`<p><b>Dónde pasó:</b></p><pre style="white-space:pre-wrap;background:#f4f5fb;padding:14px;border-radius:10px;font-size:12px">` +
					html.EscapeString(stack) + `</pre>` +
					`<p><a href="/admin/logs">Ver todos los logs del servidor</a></p></div>`
			} else {
				body = `<div style="font-family:system-ui,sans-serif;text-align:center;margin-top:80px">` +
					`<h1>Algo salió mal</h1><p>Intenta de nuevo en un momento.</p></div>`
			}

			if !c.Writer.Written() {
				c.Header("Content-Type", "text/html; charset=utf-8")
				c.Status(http.StatusInternalServerError)
			}
			_, _ = c.Writer.Write([]byte(body))
			c.Abort()
		}()
		c.Next()
	}
}

// ViewLogs — GET /admin/logs (solo admin). ?q=texto filtra las líneas.
func ViewLogs(c *gin.Context) {
	lines := capturedLogs.snapshot()
	q := strings.ToLower(strings.TrimSpace(c.Query("q")))

	var sb strings.Builder
	sb.WriteString(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">`)
	sb.WriteString(`<title>Logs del servidor</title></head><body style="font-family:system-ui,sans-serif;margin:0;background:#0f1117;color:#e6e6e6">`)
	sb.WriteString(`<div style="position:sticky;top:0;background:#161a23;padding:14px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #2b2f3a">`)
	sb.WriteString(`<b>Logs del servidor</b><span style="opacity:.6">(últimas ` + fmt.Sprint(len(lines)) + ` líneas, lo más nuevo abajo — se borran al reiniciar)</span>`)
	sb.WriteString(`<form style="margin-left:auto;display:flex;gap:8px"><input name="q" value="` + html.EscapeString(c.Query("q")) + `" placeholder="Filtrar (p. ej. ERROR, bitacora)" style="padding:7px 10px;border-radius:8px;border:1px solid #3a3f4b;background:#0f1117;color:#fff">`)
	sb.WriteString(`<button style="padding:7px 14px;border-radius:8px;border:0;background:#041cff;color:#fff">Filtrar</button>`)
	sb.WriteString(`<a href="/admin/logs" style="color:#9aa4ff;align-self:center">Todo</a></form></div>`)
	sb.WriteString(`<pre style="margin:0;padding:16px 20px;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5">`)
	for _, l := range lines {
		if q != "" && !strings.Contains(strings.ToLower(l), q) {
			continue
		}
		esc := html.EscapeString(l)
		low := strings.ToLower(l)
		if strings.Contains(low, "error") || strings.Contains(low, "panic") || strings.Contains(low, "no se pudo") {
			esc = `<span style="color:#ff8b7d">` + esc + `</span>`
		}
		sb.WriteString(esc + "\n")
	}
	sb.WriteString(`</pre><script>window.scrollTo(0,document.body.scrollHeight)</script></body></html>`)
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(sb.String()))
}