package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Recepción → Punto de venta. Por ahora es la vista: busca en el
// inventario (GET /api/receptionist/inventario), arma la venta, cobra e
// imprime el ticket con la plantilla. Todavía no guarda la venta ni
// descuenta del inventario (para eso ya existe
// models.DecreaseInventoryStock).

// ReceptionistPuntoDeVentaPage — GET /receptionist/punto-de-venta
func ReceptionistPuntoDeVentaPage(c *gin.Context) {
	c.HTML(http.StatusOK, "punto-de-venta-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-punto-de-venta",
	}))
}
