package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Configuración (optometría y recepción): sonido y anticipación de los
// avisos de cita. Cada quien guarda las suyas.

// GetMyPreferences — GET /api/staff/preferencias
func GetMyPreferences(c *gin.Context) {
	me := currentStaff(c)
	data, err := models.GetStaffPreferences(me.Role, me.ID)
	if err != nil {
		log.Println("preferencias: leer:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar tu configuración."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// SaveMyPreferences — PUT /api/staff/preferencias  {"data": {...}}
func SaveMyPreferences(c *gin.Context) {
	me := currentStaff(c)
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 16<<10))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	var in struct {
		Data json.RawMessage `json:"data"`
	}
	var probe map[string]any
	if json.Unmarshal(body, &in) != nil || len(in.Data) == 0 || json.Unmarshal(in.Data, &probe) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if err := models.SaveStaffPreferences(me.Role, me.ID, in.Data); err != nil {
		log.Println("preferencias: guardar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar tu configuración."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": in.Data})
}

// ConfigPage — GET /optometrist/configuracion y /receptionist/configuracion
func ConfigPage(tmpl, active string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.HTML(http.StatusOK, tmpl, WithStaff(c, gin.H{"ActivePage": active}))
	}
}
