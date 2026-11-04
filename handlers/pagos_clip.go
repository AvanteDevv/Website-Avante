package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/clip"
	"avante-optics/models"
)

// Pagos de la tienda en línea con Clip (Checkout redireccionado):
//
//  1. POST /api/pagos/clip/checkout: el servidor recalcula el total con
//     los precios de la base de datos, guarda el intento de pago y pide a
//     Clip un link de pago; el navegador se va a ese link.
//  2. El cliente paga en la página de Clip y regresa a
//     /pasarela-de-pagos?ref=… (éxito o error).
//  3. GET /api/pagos/clip/estado/:ref y el webhook de Clip consultan el
//     pago en Clip; cuando está completado se crean los pedidos (una sola
//     vez, aunque lleguen los dos al mismo tiempo).

type pagoItemInput struct {
	ProductID int64  `json:"productId"`
	Name      string `json:"name"`
	Brand     string `json:"brand"`
	Qty       int    `json:"qty"`
	RxOption  string `json:"rxOption"`
	RxOD      string `json:"rxOD"`
	RxOI      string `json:"rxOI"`
}

type pagoCheckoutInput struct {
	Items    []pagoItemInput `json:"items"`
	Nombre   string          `json:"nombre"`
	Email    string          `json:"email"`
	Telefono string          `json:"telefono"`
}

var pagoEmailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func cut(s string, n int) string {
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// PagoClipDatos — GET /api/pagos/clip/datos: si Clip está configurado y
// los datos del cliente con sesión, para llenar el formulario.
func PagoClipDatos(c *gin.Context) {
	out := gin.H{"configurado": clip.Configured()}
	if uid := optionalUserID(c); uid > 0 {
		if u, err := models.GetUserByID(uid); err == nil {
			out["nombre"] = strings.TrimSpace(u.Name + " " + u.Apellido)
			out["email"] = u.Email
			out["telefono"] = u.Phone
		}
	}
	c.JSON(http.StatusOK, out)
}

// PagoClipCheckout — POST /api/pagos/clip/checkout
func PagoClipCheckout(c *gin.Context) {
	if !clip.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Los pagos en línea todavía no están activos. Intenta más tarde o visítanos en tienda."})
		return
	}
	var in pagoCheckoutInput
	if err := c.ShouldBindJSON(&in); err != nil || len(in.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tu carrito está vacío."})
		return
	}
	if len(in.Items) > 40 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Son demasiados productos para un solo pago."})
		return
	}
	in.Nombre, in.Email, in.Telefono = cut(in.Nombre, 150), cut(in.Email, 150), cut(in.Telefono, 30)
	if in.Nombre == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe tu nombre."})
		return
	}
	if !pagoEmailRe.MatchString(in.Email) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un correo válido para enviarte el comprobante."})
		return
	}

	// El precio SIEMPRE sale de la base de datos (no del navegador).
	var items []models.PagoItem
	total := 0.0
	unidades := 0
	for _, it := range in.Items {
		if it.Qty < 1 || it.Qty > 20 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa las cantidades de tu carrito."})
			return
		}
		var (
			id           = it.ProductID
			title, brand string
			price        float64
			err          error
		)
		if id > 0 {
			title, brand, price, err = models.ProductForSale(id)
		} else {
			id, title, brand, price, err = models.ProductForSaleByName(strings.TrimSpace(it.Name), strings.TrimSpace(it.Brand))
		}
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("«%s» ya no está disponible. Quítalo del carrito para continuar.", cut(it.Name, 80))})
			return
		}
		if price <= 0 {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("«%s» no tiene precio. Quítalo del carrito o pregúntanos en tienda.", title)})
			return
		}
		items = append(items, models.PagoItem{
			ProductID: id, Name: title, Brand: brand, Qty: it.Qty, UnitPrice: price,
			RxOption: cut(it.RxOption, 60), RxOD: cut(it.RxOD, 60), RxOI: cut(it.RxOI, 60),
		})
		total += price * float64(it.Qty)
		unidades += it.Qty
	}
	total = float64(int64(total*100+0.5)) / 100
	if total < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El total debe ser de al menos $1.00."})
		return
	}

	p := &models.PagoClip{
		Ref: models.NewPagoRef(), Monto: total, Items: items,
		Nombre: in.Nombre, Email: in.Email, Tel: in.Telefono, UserID: optionalUserID(c),
	}
	if err := models.CreatePagoClip(p); err != nil {
		log.Printf("pagos: no se guardó el pago: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo iniciar el pago. Intenta de nuevo."})
		return
	}

	base := docBaseURL(c)
	desc := fmt.Sprintf("Avante Optics · %s", items[0].Name)
	if len(items) > 1 {
		desc = fmt.Sprintf("Avante Optics · %d productos", unidades)
	}
	req := clip.CheckoutRequest{
		Amount:              total,
		Currency:            "MXN",
		PurchaseDescription: cut(desc, 240),
		RedirectionURL: clip.RedirectionURL{
			Success: base + "/pasarela-de-pagos?ref=" + p.Ref + "&r=ok",
			Error:   base + "/pasarela-de-pagos?ref=" + p.Ref + "&r=error",
			Default: base + "/pasarela-de-pagos?ref=" + p.Ref,
		},
		Metadata: map[string]any{
			"external_reference": p.Ref,
			"customer_info": map[string]any{
				"name":  in.Nombre,
				"email": in.Email,
				"phone": in.Telefono,
			},
		},
		WebhookURL: base + "/api/pagos/clip/webhook",
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()
	co, err := clip.CreateCheckout(ctx, req)
	if err != nil {
		log.Printf("pagos: Clip no creó el link (%s): %v", p.Ref, err)
		models.SetPagoClipEstado(p.Ref, "ERROR_AL_CREAR", true)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Clip no respondió. Intenta de nuevo en un momento."})
		return
	}
	if err := models.SetPagoClipLink(p.Ref, co.ID, co.URL, co.Status); err != nil {
		log.Printf("pagos: no se guardó el link de Clip (%s): %v", p.Ref, err)
	}
	c.JSON(http.StatusOK, gin.H{"ref": p.Ref, "url": co.URL})
}

// refreshPago consulta el pago en Clip y, si ya se pagó, crea los pedidos.
func refreshPago(ctx context.Context, p *models.PagoClip) *models.PagoClip {
	if p.Estado != "pendiente" || p.ClipID == "" {
		return p
	}
	co, err := clip.GetCheckout(ctx, p.ClipID)
	if err != nil {
		log.Printf("pagos: no se pudo consultar %s en Clip: %v", p.Ref, err)
		return p
	}
	switch {
	case co.Paid():
		first, err := models.MarkPagoClipPagado(p.Ref, co.Status)
		if err != nil {
			log.Printf("pagos: no se marcó %s como pagado: %v", p.Ref, err)
			return p
		}
		if first {
			crearPedidosDePago(p)
		}
	case co.Failed():
		models.SetPagoClipEstado(p.Ref, co.Status, true)
	default:
		if co.Status != "" && co.Status != p.ClipEstado {
			models.SetPagoClipEstado(p.Ref, co.Status, false)
		}
	}
	if np, err := models.GetPagoClip(p.Ref); err == nil {
		return np
	}
	return p
}

// crearPedidosDePago: un pedido por línea, como hacía el carrito.
func crearPedidosDePago(p *models.PagoClip) {
	var ids []int64
	for _, it := range p.Items {
		o, err := models.CreateOrder(it.Name, it.Brand, it.Qty, it.UnitPrice, it.RxOption, it.RxOD, it.RxOI, p.Nombre)
		if err != nil {
			log.Printf("pagos: no se creó el pedido de %s (%s): %v", p.Ref, it.Name, err)
			continue
		}
		if p.UserID > 0 {
			_ = models.AttachOrderToUser(o.ID, p.UserID)
		}
		models.SetOrderPagoRef(o.ID, p.Ref)
		ids = append(ids, o.ID)
	}
	if err := models.SetPagoClipOrders(p.Ref, ids); err != nil {
		log.Printf("pagos: no se guardaron los pedidos de %s: %v", p.Ref, err)
	}
	log.Printf("pagos: %s pagado con Clip ($%.2f) → %d pedido(s)", p.Ref, p.Monto, len(ids))
}

// PagoClipEstado — GET /api/pagos/clip/estado/:ref
func PagoClipEstado(c *gin.Context) {
	p, err := models.GetPagoClip(strings.TrimSpace(c.Param("ref")))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No encontramos ese pago."})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	p = refreshPago(ctx, p)
	unidades := 0
	for _, it := range p.Items {
		unidades += it.Qty
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"estado":   p.Estado, // pendiente | pagado | fallido
		"monto":    p.Monto,
		"lineas":   len(p.Items),
		"unidades": unidades,
		"pedidos":  len(p.OrderIDs),
		"url":      p.URL, // para reintentar si sigue pendiente
	})
}

// PagoClipWebhook — POST /api/pagos/clip/webhook (lo llama Clip).
// No se confía en el cuerpo: solo se usa para saber qué pago revisar y
// el estado real se consulta a Clip.
func PagoClipWebhook(c *gin.Context) {
	body, _ := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	m := map[string]any{}
	_ = json.Unmarshal(body, &m)
	ref := clip.Str(m, "external_reference")
	if ref == "" {
		if md, ok := m["metadata"].(map[string]any); ok {
			ref = clip.Str(md, "external_reference")
		}
	}
	clipID := clip.Str(m, "payment_request_id", "resource_id", "id")
	var p *models.PagoClip
	var err error
	if ref != "" {
		p, err = models.GetPagoClip(ref)
	}
	if p == nil && clipID != "" {
		p, err = models.GetPagoClipByClipID(clipID)
	}
	if p == nil {
		log.Printf("pagos: webhook de Clip sin pago conocido (ref=%q id=%q): %v", ref, clipID, err)
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	refreshPago(ctx, p)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
