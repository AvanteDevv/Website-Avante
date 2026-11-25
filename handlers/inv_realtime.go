package handlers

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// INVENTARIO EN TIEMPO REAL (push).
// Cada pantalla de Inventario abierta (Artículos, Movimientos) se queda
// escuchando GET /api/inventario/eventos (Server-Sent Events). En cuanto
// alguien guarda algo que cambia el inventario — alta, edición, ajuste,
// venta, cancelación, borrado — el servidor avisa a TODOS los que tengan
// la pantalla abierta y cada uno recarga sus datos al instante.
//
// Vive en memoria del proceso (como realtime.Default). Si la conexión se
// cae, el navegador sigue revisando la firma del inventario cada poco
// tiempo, así que nunca se queda desactualizado.

type invBroker struct {
	mu   sync.Mutex
	subs map[chan struct{}]bool
}

var invEvents = &invBroker{subs: map[chan struct{}]bool{}}

func (b *invBroker) subscribe() chan struct{} {
	ch := make(chan struct{}, 1)
	b.mu.Lock()
	b.subs[ch] = true
	b.mu.Unlock()
	return ch
}

func (b *invBroker) unsubscribe(ch chan struct{}) {
	b.mu.Lock()
	delete(b.subs, ch)
	b.mu.Unlock()
}

// BroadcastInventarioChanged avisa a todas las pantallas de Inventario
// abiertas. No bloquea: si una ya tiene un aviso pendiente, no se apila.
func BroadcastInventarioChanged() {
	invEvents.mu.Lock()
	defer invEvents.mu.Unlock()
	for ch := range invEvents.subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// NotifyInventarioChanged — middleware: si la petición cambió algo (no es
// GET) y salió bien, avisa a todos.
func NotifyInventarioChanged() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if c.Request.Method == http.MethodGet {
			return
		}
		if s := c.Writer.Status(); s >= 200 && s < 400 {
			BroadcastInventarioChanged()
		}
	}
}

// InvEventos — GET /api/inventario/eventos (text/event-stream)
func InvEventos(c *gin.Context) {
	w := c.Writer
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no") // que el proxy no lo retenga
	w.WriteHeader(http.StatusOK)
	flusher, ok := w.(http.Flusher)
	if !ok {
		return
	}
	ch := invEvents.subscribe()
	defer invEvents.unsubscribe(ch)
	fmt.Fprint(w, "retry: 3000\nevent: hola\ndata: 1\n\n")
	flusher.Flush()

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ch:
			fmt.Fprintf(w, "event: inventario\ndata: %d\n\n", time.Now().Unix())
			flusher.Flush()
		case <-ping.C:
			// Mantiene viva la conexión (proxies cortan las que no hablan).
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}
