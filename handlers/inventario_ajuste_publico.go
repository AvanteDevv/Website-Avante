package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Reporte de un ajuste de inventario para compartir por WhatsApp o
// correo: /inventario/ajuste/<folio>/<firma>. Igual que el ticket digital,
// la firma (HMAC con SESSION_SECRET) evita que alguien vea otros ajustes
// cambiando el número. No muestra costos, solo cantidades.

func ajusteSecret() []byte {
	s := os.Getenv("SESSION_SECRET")
	if s == "" {
		s = "cambia-esto-por-una-clave-larga-y-aleatoria-en-produccion"
	}
	return []byte("inv-ajuste:" + s)
}

// AjusteSig — firma corta del folio.
func AjusteSig(folio int64) string {
	m := hmac.New(sha256.New, ajusteSecret())
	m.Write([]byte(strconv.FormatInt(folio, 10)))
	return hex.EncodeToString(m.Sum(nil))[:20]
}

// AjustePublicPath — "/inventario/ajuste/12/abcd…"
func AjustePublicPath(folio int64) string {
	return "/inventario/ajuste/" + strconv.FormatInt(folio, 10) + "/" + AjusteSig(folio)
}

var ajTipos = map[string]string{"fisico": "Inventario físico", "entrada": "Entrada", "salida": "Salida", "fijar": "Existencia fijada"}

var ajMeses = []string{"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"}

func ajFechaHora(s string) string {
	t, err := time.Parse("2006-01-02T15:04:05", s)
	if err != nil {
		return s
	}
	h, ampm := t.Hour(), "a. m."
	if h >= 12 {
		ampm = "p. m."
	}
	if h%12 == 0 {
		h = 12
	} else {
		h = h % 12
	}
	return strconv.Itoa(t.Day()) + " de " + ajMeses[t.Month()-1] + " de " + strconv.Itoa(t.Year()) + ", " + strconv.Itoa(h) + ":" + t.Format("04") + " " + ampm
}

type ajLineaView struct {
	models.InvAjusteLinea
	DiffTxt string
	Clase   string
}

// PublicAjustePage — GET /inventario/ajuste/:folio/:sig
func PublicAjustePage(c *gin.Context) {
	folio, err := strconv.ParseInt(c.Param("folio"), 10, 64)
	if err != nil || folio <= 0 || !hmac.Equal([]byte(c.Param("sig")), []byte(AjusteSig(folio))) {
		c.String(http.StatusNotFound, "Ajuste no encontrado.")
		return
	}
	d, err := models.GetInvAjuste(folio)
	if errors.Is(err, models.ErrInvAjusteNotFound) {
		c.String(http.StatusNotFound, "Ajuste no encontrado.")
		return
	}
	if err != nil {
		c.String(http.StatusInternalServerError, "No se pudo cargar el ajuste.")
		return
	}
	lineas := make([]ajLineaView, 0, len(d.Lineas))
	for _, l := range d.Lineas {
		v := ajLineaView{InvAjusteLinea: l, DiffTxt: strconv.Itoa(l.Diferencia), Clase: "is-zero"}
		if l.Diferencia > 0 {
			v.DiffTxt, v.Clase = "+"+v.DiffTxt, "is-up"
		} else if l.Diferencia < 0 {
			v.DiffTxt, v.Clase = strings.Replace(v.DiffTxt, "-", "−", 1), "is-down"
		}
		lineas = append(lineas, v)
	}
	tipo := ajTipos[d.Tipo]
	if tipo == "" {
		tipo = d.Tipo
	}
	c.Header("X-Robots-Tag", "noindex")
	c.Header("Referrer-Policy", "no-referrer")
	c.HTML(http.StatusOK, "ajuste-publico.html", gin.H{
		"A":      d,
		"Tipo":   tipo,
		"Fecha":  ajFechaHora(d.Fecha),
		"Lineas": lineas,
	})
}
