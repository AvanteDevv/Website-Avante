package handlers

import (
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Estas rutas SOLO las debe llamar la app Android del celular-gateway,
// nunca el navegador de un cliente. Se protegen con una llave fija (no
// con la sesión de cliente/admin) porque la app no puede "iniciar
// sesión" como un usuario — es un dispositivo, no una persona.
//
// Define la variable de entorno SMS_GATEWAY_KEY en Railway con un valor
// largo y aleatorio (ej. genera uno con: openssl rand -hex 32). La app
// Android manda ese mismo valor en cada petición dentro del header:
//
//	X-Gateway-Key: <el valor de SMS_GATEWAY_KEY>
//
// Regístralas en main.go así (fuera de los grupos de cliente/admin):
//
//	gateway := router.Group("/api/gateway")
//	gateway.GET("/sms/siguiente", handlers.GetPendingSMS)
//	gateway.POST("/sms/:id/confirmar", handlers.ConfirmSMSSent)
//	gateway.POST("/sms/:id/fallido", handlers.ReportSMSFailed)

// requireGatewayKey valida el header X-Gateway-Key contra
// SMS_GATEWAY_KEY. Regresa false (y ya respondió el 401) si no coincide.
func requireGatewayKey(c *gin.Context) bool {
	expected := os.Getenv("SMS_GATEWAY_KEY")
	got := c.GetHeader("X-Gateway-Key")

	if expected == "" || got == "" || got != expected {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No autorizado."})
		return false
	}
	return true
}

// GetPendingSMS regresa el siguiente mensaje pendiente en la cola, o
// 204 No Content si no hay ninguno ahorita. La app Android llama esto
// cada 5-10 segundos (polling).
func GetPendingSMS(c *gin.Context) {
	if !requireGatewayKey(c) {
		return
	}

	msg, err := models.GetNextPendingSMS()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo consultar la cola."})
		return
	}
	if msg == nil {
		c.Status(http.StatusNoContent) // nada pendiente, la app sigue esperando
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":      msg.ID,
		"celular": msg.Celular,
		"mensaje": msg.Mensaje,
	})
}

// ConfirmSMSSent marca un mensaje como enviado exitosamente — la app lo
// llama justo después de que SmsManager confirma el envío.
func ConfirmSMSSent(c *gin.Context) {
	if !requireGatewayKey(c) {
		return
	}

	id, err := parseIDParam(c)
	if err != nil {
		return
	}

	if err := models.MarkSMSSent(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo confirmar el envío."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Confirmado."})
}

// ReportSMSFailed marca un mensaje como fallido — la app lo llama si
// SmsManager regresó un error (sin señal, SIM no lista, etc.).
func ReportSMSFailed(c *gin.Context) {
	if !requireGatewayKey(c) {
		return
	}

	id, err := parseIDParam(c)
	if err != nil {
		return
	}

	if err := models.MarkSMSFailed(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo registrar la falla."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Registrado como fallido."})
}

// parseIDParam lee y valida el :id de la URL; si falla, ya respondió el
// 400 y regresa un error para que el caller simplemente haga `return`.
func parseIDParam(c *gin.Context) (int64, error) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Id inválido."})
		return 0, err
	}
	return id, nil
}
