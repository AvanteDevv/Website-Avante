package handlers

import (
	"io"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// ⚠️ Adjust "avante-optics" wherever this package is imported to match
// the module name declared in your go.mod, igual que en el resto del
// proyecto.
//
// Este webhook NO procesa nada todavía — solo existe para que Meta
// pueda verificarlo y marcar como completo el paso "Set up Webhooks"
// del panel de developers (Step 2. Production setup). No es necesario
// para nada de lo que ya armamos (recordatorios, avisos de cita
// agendada/cancelada/no-show) — eso es todo salida (tú le mandas
// WhatsApp al cliente), nunca entrada. Este webhook sirve para el día
// que quieras RECIBIR algo de Meta: respuestas del cliente, o
// confirmaciones de entrega/lectura de tus mensajes.
//
// Requiere la variable de entorno:
//
//	WHATSAPP_WEBHOOK_VERIFY_TOKEN — un texto que tú inventas (cualquier
//	    cadena, ej. "avante-optics-2026") y that pones IGUAL en el campo
//	    "Verify token" del panel de Meta. Meta te lo regresa en la
//	    verificación para confirmar que el endpoint es tuyo.

func webhookVerifyToken() string {
	return os.Getenv("WHATSAPP_WEBHOOK_VERIFY_TOKEN")
}

// VerifyWebhook responde al "handshake" que Meta hace UNA VEZ cuando
// guardas la configuración del webhook (botón "Verify and save").
// Manda un GET con ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// y espera que le regreses el challenge tal cual, en texto plano, con
// 200 — solo si el verify_token coincide con el que configuraste aquí.
// GET /webhook/whatsapp.
func VerifyWebhook(c *gin.Context) {
	mode := c.Query("hub.mode")
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	if mode == "subscribe" && token != "" && token == webhookVerifyToken() {
		c.String(http.StatusOK, challenge)
		return
	}

	c.Status(http.StatusForbidden)
}

// ReceiveWebhookEvent recibe los eventos reales de WhatsApp (mensajes
// entrantes, cambios de estado de tus mensajes salientes, etc.) una vez
// que el webhook ya quedó verificado y suscrito. Por ahora solo los
// registra en el log — no hace falta procesarlos para lo que ya
// armamos. Meta espera 200 rápido (menos de unos segundos) sin importar
// el contenido, o reintenta y eventualmente pausa el webhook.
// POST /webhook/whatsapp.
func ReceiveWebhookEvent(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		log.Println("[webhook] error leyendo body:", err)
		c.Status(http.StatusOK) // 200 de todos modos: no se quiere que Meta reintente por esto
		return
	}
	log.Println("[webhook] evento recibido:", string(body))

	c.Status(http.StatusOK)
}
