package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Recepción → Plantillas: el ticket de venta que se imprime en la
// ticketera (la misma de SICAR). Por ahora solo hay un tipo: "venta".

const ticketKindVenta = "venta"

// Límite de tamaño de la plantilla (JSON). Con logo por URL y textos
// largos no pasa de unos cuantos KB.
const ticketTemplateMaxBytes = 64 << 10

// ReceptionistPlantillasPage — GET /receptionist/plantillas
func ReceptionistPlantillasPage(c *gin.Context) {
	c.HTML(http.StatusOK, "plantillas-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-plantillas",
	}))
}

// GetTicketTemplate — GET /api/receptionist/ticket-plantilla
// Responde {"data": {...} | null, "updated_at": …, "updated_by": …}.
// data = null significa que nunca se ha guardado (la página usa el
// formato por defecto, igual al ticket de SICAR).
func GetTicketTemplate(c *gin.Context) {
	t, err := models.GetTicketTemplate(ticketKindVenta)
	if err != nil {
		log.Printf("tickets.Get: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la plantilla del ticket."})
		return
	}
	if t == nil {
		c.JSON(http.StatusOK, gin.H{"data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":       json.RawMessage(t.Data),
		"updated_at": t.UpdatedAt,
		"updated_by": t.UpdatedBy,
	})
}

// SaveTicketTemplate — PUT /api/receptionist/ticket-plantilla
// Body: {"data": {...plantilla...}}
func SaveTicketTemplate(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, ticketTemplateMaxBytes+1024)
	var body struct {
		Data json.RawMessage `json:"data"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Data) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La plantilla no es válida."})
		return
	}
	// Debe ser un objeto JSON (no una lista, texto, etc.)
	var probe map[string]interface{}
	if err := json.Unmarshal(body.Data, &probe); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La plantilla no es válida."})
		return
	}
	if len(body.Data) > ticketTemplateMaxBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "La plantilla es demasiado grande."})
		return
	}

	nameVal, _ := c.Get("staff_name")
	name, _ := nameVal.(string)

	t, err := models.SaveTicketTemplate(ticketKindVenta, string(body.Data), name)
	if err != nil {
		log.Printf("tickets.Save: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la plantilla. Intenta de nuevo."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "updated_at": t.UpdatedAt, "updated_by": t.UpdatedBy})
}
