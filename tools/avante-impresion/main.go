// Avante Impresión — programa chiquito que vive en la compu de caja.
//
// El panel (Plantillas y Punto de venta) le manda el ticket ya listo
// en comandos ESC/POS y este programa lo entrega TAL CUAL a la
// impresora de Windows que se eligió (la ticketera WL88S de SICAR).
// Así el ticket sale directo, sin el diálogo de Chrome, y la impresora
// predeterminada de Windows no se toca: lo demás se sigue imprimiendo
// en la impresora de hojas como siempre.
//
// Escucha solo en 127.0.0.1:17771 (no se ve desde la red) y solo acepta
// peticiones de las páginas del panel (ver allowedOrigin).
//
//	GET  /status  → versión, impresoras instaladas y la predeterminada
//	POST /print   → {"printer":"WL88S","data":"<base64 ESC/POS>","name":"Ticket 1024"}
//
// Uso:
//
//	avante-impresion.exe              → se activa y queda abriendo con Windows
//	avante-impresion.exe --desinstalar → deja de abrir con Windows y se cierra
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	version = "1.0.0"
	addr    = "127.0.0.1:17771"
	maxJob  = 4 << 20 // 4 MB es muchísimo para un ticket
)

var extraOrigins []string

func main() {
	background := flag.Bool("background", false, "arranque automático con Windows (sin avisos)")
	uninstall := flag.Bool("desinstalar", false, "quitar el arranque automático")
	origins := flag.String("origins", "", "orígenes extra permitidos, separados por coma")
	flag.Parse()

	setupLog()
	if *origins != "" {
		extraOrigins = strings.Split(*origins, ",")
	}
	if env := os.Getenv("AVANTE_PRINT_ORIGINS"); env != "" {
		extraOrigins = append(extraOrigins, strings.Split(env, ",")...)
	}

	if *uninstall {
		err := removeAutostart()
		stopRunning()
		if err != nil {
			notify("Avante Impresión", "No se pudo quitar el arranque automático:\n"+err.Error())
		} else {
			notify("Avante Impresión", "Listo. Avante Impresión ya no abrirá con Windows.\n\nPara volver a activarlo, abre el programa otra vez.")
		}
		return
	}

	if err := installAutostart(); err != nil {
		log.Printf("arranque automático: %v", err)
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Ya hay uno abierto (o el puerto está ocupado).
		if !*background {
			if pingRunning() {
				notify("Avante Impresión", "Avante Impresión ya está activo.\n\nYa puedes imprimir tickets desde el panel.")
			} else {
				notify("Avante Impresión", "No se pudo iniciar: el puerto 17771 está ocupado por otro programa.")
			}
		}
		return
	}

	if !*background {
		notify("Avante Impresión", "Avante Impresión está activo.\n\nYa no hace falta abrirlo de nuevo: arranca solo cada vez que se enciende la compu.\n\nAhora en el panel ve a Plantillas → Ticketera y elige la impresora del ticket.")
	}
	log.Printf("Avante Impresión %s escuchando en %s", version, addr)

	mux := http.NewServeMux()
	mux.HandleFunc("/status", withCORS(handleStatus))
	mux.HandleFunc("/print", withCORS(handlePrint))
	mux.HandleFunc("/quit", handleQuit)
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("servidor: %v", err)
	}
}

/* ---------------- CORS / orígenes permitidos ---------------- */

// Solo las páginas del panel pueden pedir impresiones.
func allowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	switch {
	case host == "avanteopticsmx.com" || strings.HasSuffix(host, ".avanteopticsmx.com"):
		return u.Scheme == "https" || u.Scheme == "http"
	case strings.HasSuffix(host, ".up.railway.app"):
		return u.Scheme == "https"
	case host == "localhost" || host == "127.0.0.1":
		return true
	}
	for _, o := range extraOrigins {
		if strings.EqualFold(strings.TrimRight(strings.TrimSpace(o), "/"), strings.TrimRight(origin, "/")) {
			return true
		}
	}
	return false
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if !allowedOrigin(origin) {
			writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "origen no permitido"})
			return
		}
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Vary", "Origin")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		// Chrome pide esto para que una página de internet hable con la compu local.
		h.Set("Access-Control-Allow-Private-Network", "true")
		h.Set("Access-Control-Allow-Local-Network", "true")
		h.Set("Access-Control-Max-Age", "600")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

/* ---------------- rutas ---------------- */

func handleStatus(w http.ResponseWriter, r *http.Request) {
	printers, err := listPrinters()
	resp := map[string]any{
		"ok":       true,
		"app":      "avante-impresion",
		"version":  version,
		"printers": printers,
		"default":  defaultPrinter(),
	}
	if err != nil {
		resp["error"] = err.Error()
	}
	writeJSON(w, http.StatusOK, resp)
}

var printMu sync.Mutex

func handlePrint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "usa POST"})
		return
	}
	var body struct {
		Printer string `json:"printer"`
		Data    string `json:"data"`
		Name    string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxJob*2)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "datos inválidos"})
		return
	}
	body.Printer = strings.TrimSpace(body.Printer)
	if body.Printer == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "falta la impresora"})
		return
	}
	raw, err := base64.StdEncoding.DecodeString(body.Data)
	if err != nil || len(raw) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "el ticket viene vacío"})
		return
	}
	if len(raw) > maxJob {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"ok": false, "error": "el ticket es demasiado grande"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Ticket Avante"
	}

	printMu.Lock()
	err = printRaw(body.Printer, name, raw)
	printMu.Unlock()
	if err != nil {
		log.Printf("imprimir en %q: %v", body.Printer, err)
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	log.Printf("impreso %q en %q (%d bytes)", name, body.Printer, len(raw))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// /quit solo se acepta desde la misma compu y sin Origin (lo usa --desinstalar).
func handleQuit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || r.Header.Get("Origin") != "" || r.Header.Get("X-Avante-Quit") != "1" {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	w.WriteHeader(http.StatusNoContent)
	go func() { time.Sleep(200 * time.Millisecond); os.Exit(0) }()
}

/* ---------------- utilidades ---------------- */

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func pingRunning() bool {
	c := http.Client{Timeout: 1500 * time.Millisecond}
	req, _ := http.NewRequest(http.MethodGet, "http://"+addr+"/status", nil)
	req.Header.Set("Origin", "http://localhost")
	res, err := c.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	var s struct {
		App string `json:"app"`
	}
	_ = json.NewDecoder(res.Body).Decode(&s)
	return s.App == "avante-impresion"
}

func stopRunning() {
	c := http.Client{Timeout: 1500 * time.Millisecond}
	req, _ := http.NewRequest(http.MethodPost, "http://"+addr+"/quit", nil)
	req.Header.Set("X-Avante-Quit", "1")
	if res, err := c.Do(req); err == nil {
		res.Body.Close()
	}
}

// Bitácora chiquita junto al .exe (se reinicia si pasa de 1 MB).
func setupLog() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	p := filepath.Join(filepath.Dir(exe), "avante-impresion.log")
	if st, err := os.Stat(p); err == nil && st.Size() > 1<<20 {
		_ = os.Remove(p)
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	log.SetOutput(f)
	log.SetFlags(log.LstdFlags)
	log.Printf("---- inicio v%s ----", version)
}
