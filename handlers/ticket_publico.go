package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strconv"

	"avante-optics/models"

	"github.com/gin-gonic/gin"
)

// Ticket digital: el cliente lo abre desde el enlace que le manda
// recepción por WhatsApp (/ticket/<folio>/<firma>). La firma (HMAC con
// SESSION_SECRET) evita que alguien vea otros tickets cambiando el número.

func ticketSecret() []byte {
	s := os.Getenv("SESSION_SECRET")
	if s == "" {
		s = "cambia-esto-por-una-clave-larga-y-aleatoria-en-produccion"
	}
	return []byte("ticket-digital:" + s)
}

// TicketSig — firma corta del folio.
func TicketSig(folio int64) string {
	m := hmac.New(sha256.New, ticketSecret())
	m.Write([]byte(strconv.FormatInt(folio, 10)))
	return hex.EncodeToString(m.Sum(nil))[:20]
}

// TicketPublicPath — "/ticket/123/abcd…"
func TicketPublicPath(folio int64) string {
	return "/ticket/" + strconv.FormatInt(folio, 10) + "/" + TicketSig(folio)
}

func ticketFromParams(c *gin.Context) (int64, bool) {
	folio, err := strconv.ParseInt(c.Param("folio"), 10, 64)
	if err != nil || folio <= 0 {
		return 0, false
	}
	return folio, hmac.Equal([]byte(c.Param("sig")), []byte(TicketSig(folio)))
}

// PublicTicketPage — GET /ticket/:folio/:sig
func PublicTicketPage(c *gin.Context) {
	folio, ok := ticketFromParams(c)
	if !ok {
		c.String(http.StatusNotFound, "Ticket no encontrado.")
		return
	}
	c.Header("X-Robots-Tag", "noindex")
	c.Header("Referrer-Policy", "no-referrer")
	c.HTML(http.StatusOK, "ticket-digital.html", gin.H{
		"Folio": folio,
		"Sig":   c.Param("sig"),
	})
}

type publicTicketItem struct {
	Descripcion string   `json:"descripcion"`
	Cantidad    int      `json:"cantidad"`
	Precio      float64  `json:"precio"`
	Descuento   float64  `json:"descuento"`
	Rastreo     []string `json:"rastreo,omitempty"`
}

// PublicTicketData — GET /api/ticket/:folio/:sig
// Lo mínimo para dibujar el ticket (sin teléfonos ni datos internos).
func PublicTicketData(c *gin.Context) {
	folio, ok := ticketFromParams(c)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ticket no encontrado."})
		return
	}
	d, err := models.GetPosSale(folio)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ticket no encontrado."})
		return
	}
	items := make([]publicTicketItem, 0, len(d.Productos))
	for _, p := range d.Productos {
		items = append(items, publicTicketItem{p.Descripcion, p.Cantidad, p.Precio, p.Descuento, p.Rastreo})
	}
	var tpl json.RawMessage
	if t, err := models.GetTicketTemplate(ticketKindVenta); err == nil && t != nil {
		tpl = json.RawMessage(t.Data)
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"plantilla": tpl,
		"venta": gin.H{
			"folio":     d.Folio,
			"fecha":     d.Fecha,
			"cliente":   d.Cliente,
			"cajero":    d.Cajero,
			"productos": items,
			"pagos": gin.H{
				"efectivo": d.EfectivoRecibido, "tarjeta": d.Tarjeta, "transferencia": d.Transferencia,
				"vales": d.Vales, "cheque": d.Cheque, "credito": d.Credito,
			},
			"cambio":        d.Cambio,
			"total":         d.Total,
			"vence":         d.Vence,
			"pedido_code":   d.PedidoCode,
			"pedido_status": d.PedidoStatus,
		},
	})
}
