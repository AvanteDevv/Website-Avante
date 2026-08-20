package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// GetMyOrders returns only the orders linked to the logged-in account
// (GET /api/mis-pedidos). It sits behind RequireAuthAPI() in main.go —
// same group as favorites — so currentUserID(c) (already defined in
// auth.go) always returns a valid value here.
func GetMyOrders(c *gin.Context) {
	userID := currentUserID(c)

	orders, err := models.GetOrdersByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar tus pedidos."})
		return
	}
	if orders == nil {
		orders = []models.Order{}
	}

	c.JSON(http.StatusOK, orders)
}

// GetOrderStatuses returns the list of configured statuses (id, key,
// label, color, sortOrder) without requiring a session — mis-pedidos.js
// uses it to build each order's progress stepper and to show the
// right label/color per order (GET /api/estados, public, alongside
// /horarios and /horarios/ocupadas).
func GetOrderStatuses(c *gin.Context) {
	statuses, err := models.GetAllOrderStatuses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los estados."})
		return
	}
	if statuses == nil {
		statuses = []models.OrderStatus{}
	}

	c.JSON(http.StatusOK, statuses)
}
