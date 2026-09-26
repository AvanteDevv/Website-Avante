// Package realtime mantiene las conexiones WebSocket abiertas del staff
// (recepción / optometría / empleado) y reparte eventos en vivo: mensajes
// de chat nuevos, conversaciones nuevas y avisos del admin.
//
// Vive en memoria del proceso, igual que bazarState en main.go: funciona
// perfecto con UNA sola instancia del servidor (como está hoy en Railway).
// Si algún día escalas a varias réplicas, cada una tendría su propio Hub
// y un mensaje enviado en la réplica A no llegaría a quien está conectado
// en la B — ahí habría que meter Redis pub/sub entre réplicas. Los datos
// en sí siempre se guardan en MySQL, así que nada se pierde: al recargar
// la página se ven todos los mensajes.
package realtime

import (
	"encoding/json"
	"log"
	"sync"
)

// Client es una pestaña/conexión abierta. Una misma persona puede tener
// varias (celular + computadora, dos pestañas) — todas reciben el evento.
type Client struct {
	Key  string      // "employee:3", "receptionist:5", … (ver models.StaffKey)
	Send chan []byte // mensajes ya serializados que el writer manda al socket
}

// Event es lo que viaja al navegador: {"type": "...", "data": {...}}.
type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Hub agrupa los clientes por persona (Key).
type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*Client]struct{}
}

// Default es el hub global que usan los handlers.
var Default = NewHub()

func NewHub() *Hub {
	return &Hub{clients: make(map[string]map[*Client]struct{})}
}

// Register agrega la conexión. first = era la primera conexión de esa
// persona (acaba de "entrar en línea").
func (h *Hub) Register(c *Client) (first bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set, ok := h.clients[c.Key]
	if !ok {
		set = make(map[*Client]struct{})
		h.clients[c.Key] = set
	}
	set[c] = struct{}{}
	return len(set) == 1
}

// Unregister quita la conexión y cierra su canal. last = era la última
// conexión de esa persona (acaba de "salir de línea").
func (h *Hub) Unregister(c *Client) (last bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set, ok := h.clients[c.Key]
	if !ok {
		return false
	}
	if _, exists := set[c]; !exists {
		return false
	}
	delete(set, c)
	close(c.Send)
	if len(set) == 0 {
		delete(h.clients, c.Key)
		return true
	}
	return false
}

// IsOnline indica si la persona tiene al menos una pestaña conectada
// (para el puntito verde de "en línea" en el chat).
func (h *Hub) IsOnline(key string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[key]) > 0
}

// OnlineKeys devuelve todas las personas conectadas ahora mismo.
func (h *Hub) OnlineKeys() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]string, 0, len(h.clients))
	for k := range h.clients {
		out = append(out, k)
	}
	return out
}

// SendTo manda el evento a todas las conexiones de esas personas. Si el
// buffer de una conexión está lleno (pestaña colgada / red muy lenta) se
// descarta ESE evento para esa conexión en vez de bloquear a todos — la
// info sigue en MySQL y se recupera al recargar.
func (h *Hub) SendTo(keys []string, ev Event) {
	payload, err := json.Marshal(ev)
	if err != nil {
		log.Printf("realtime: no se pudo serializar evento %q: %v", ev.Type, err)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, k := range keys {
		for c := range h.clients[k] {
			select {
			case c.Send <- payload:
			default:
			}
		}
	}
}

// Broadcast manda el evento a TODOS los conectados (p. ej. cambios de
// presencia "en línea / desconectado").
func (h *Hub) Broadcast(ev Event) {
	h.SendTo(h.OnlineKeys(), ev)
}
