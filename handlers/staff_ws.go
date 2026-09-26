package handlers

import (
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"avante-optics/realtime"
)

// ⚠️ Requiere: go get github.com/gorilla/websocket
//
// StaffWebSocket — GET /ws/staff
// Una sola conexión por pestaña para todo lo que llega en vivo: mensajes
// de chat, conversaciones nuevas, avisos del admin y quién está en línea.
// La cookie de sesión de staff viaja sola en el handshake (mismo
// dominio), así que RequireAdminAuth + RequireRole funcionan igual que
// en cualquier otra ruta.
//
// El navegador solo ESCUCHA por aquí; para mandar un mensaje usa el POST
// normal (/api/staff/chat/conversaciones/:id/mensajes). Así la
// validación, el guardado en MySQL y los errores viven en un solo lugar.

const (
	wsWriteWait  = 10 * time.Second
	wsPongWait   = 70 * time.Second
	wsPingPeriod = 30 * time.Second // debe ser menor que wsPongWait
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	// Solo se aceptan conexiones que vengan de tu propio dominio — evita
	// que otra página abra un socket usando la cookie de tu staff.
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		return u.Host == r.Host
	},
}

func StaffWebSocket(c *gin.Context) {
	me := currentStaff(c)
	if me.ID == 0 {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws: upgrade falló para %s: %v", me.Key(), err)
		return
	}

	client := &realtime.Client{Key: me.Key(), Send: make(chan []byte, 64)}
	if first := realtime.Default.Register(client); first {
		realtime.Default.Broadcast(realtime.Event{
			Type: "presence", Data: gin.H{"key": me.Key(), "online": true},
		})
	}

	go wsWritePump(conn, client)
	wsReadPump(conn) // bloquea hasta que se cierre la conexión

	if last := realtime.Default.Unregister(client); last {
		realtime.Default.Broadcast(realtime.Event{
			Type: "presence", Data: gin.H{"key": me.Key(), "online": false},
		})
	}
}

// wsReadPump solo existe para detectar cuando el navegador se va y para
// procesar los pong del keep-alive. Lo que mande el cliente se ignora.
func wsReadPump(conn *websocket.Conn) {
	defer conn.Close()
	conn.SetReadLimit(1024)
	conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

// wsWritePump manda los eventos del hub y un ping cada 30 s (Railway y
// los proxies cortan conexiones que se quedan calladas mucho tiempo).
func wsWritePump(conn *websocket.Conn, client *realtime.Client) {
	ticker := time.NewTicker(wsPingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()
	for {
		select {
		case msg, ok := <-client.Send:
			conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
