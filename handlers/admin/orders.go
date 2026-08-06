package admin

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// ListOrders returns every order as JSON. Called by pedidos.js to fill
// the admin Pedidos table (GET /api/admin/pedidos).
func ListOrders(c *gin.Context) {
	orders, err := models.GetAllOrders()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los pedidos."})
		return
	}

	c.JSON(http.StatusOK, orders)
}

type updateOrderStatusInput struct {
	Status string `json:"status" binding:"required"`
}

// UpdateOrderStatus changes an order's status (e.g. to "enviado")
// (PATCH /api/admin/pedidos/:id/estado).
func UpdateOrderStatus(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de pedido inválido."})
		return
	}

	var input updateOrderStatusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Estado inválido."})
		return
	}

	if err := models.UpdateOrderStatus(id, input.Status); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pedido no encontrado."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Estado actualizado correctamente."})
}

// DeleteOrder removes an order (DELETE /api/admin/pedidos/:id).
func DeleteOrder(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de pedido inválido."})
		return
	}

	if err := models.DeleteOrder(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pedido no encontrado."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pedido eliminado."})
}
