package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// GetOrderSettings returns the current order-code prefix and next
// number (GET /api/admin/pedidos/configuracion).
func GetOrderSettings(c *gin.Context) {
	settings, err := models.GetOrderSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la configuración de pedidos."})
		return
	}
	c.JSON(http.StatusOK, settings)
}

type orderSettingsInput struct {
	CodePrefix string `json:"codePrefix" binding:"required"`
	NextNumber int    `json:"nextNumber" binding:"required,min=0"`
}

// UpdateOrderSettingsHandler changes the prefix (e.g. "AVT", "NFC")
// and/or the number the next order will start counting from
// (PUT /api/admin/pedidos/configuracion).
func UpdateOrderSettingsHandler(c *gin.Context) {
	var input orderSettingsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}

	if err := models.UpdateOrderSettings(input.CodePrefix, input.NextNumber); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la configuración."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Configuración actualizada correctamente."})
}
