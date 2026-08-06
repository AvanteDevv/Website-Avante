package admin

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// ListStatusOptions returns every configured order status
// (GET /api/admin/estados) — used both by the settings gear modal and
// to build the "Actualizar estado" dropdown on each row.
func ListStatusOptions(c *gin.Context) {
	statuses, err := models.GetAllOrderStatuses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los estados."})
		return
	}
	c.JSON(http.StatusOK, statuses)
}

type statusOptionInput struct {
	Label     string `json:"label" binding:"required"`
	Color     string `json:"color" binding:"required"`
	SortOrder int    `json:"sortOrder"`
}

// CreateStatusOption adds a new status to the list (POST /api/admin/estados).
func CreateStatusOption(c *gin.Context) {
	var input statusOptionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de estado inválidos."})
		return
	}

	status, err := models.CreateOrderStatus(input.Label, input.Color, input.SortOrder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el estado."})
		return
	}

	c.JSON(http.StatusCreated, status)
}

// UpdateStatusOption edits a status's label/color (PUT /api/admin/estados/:id).
func UpdateStatusOption(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de estado inválido."})
		return
	}

	var input statusOptionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de estado inválidos."})
		return
	}

	if err := models.UpdateOrderStatusDef(id, input.Label, input.Color); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Estado no encontrado."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Estado actualizado correctamente."})
}

// DeleteStatusOption removes a status from the list (DELETE /api/admin/estados/:id).
func DeleteStatusOption(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de estado inválido."})
		return
	}

	if err := models.DeleteOrderStatusDef(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Estado no encontrado."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Estado eliminado."})
}
