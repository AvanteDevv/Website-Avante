package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Recepción → Punto de venta: busca en el inventario, arma la venta,
// cobra (guarda la venta y descuenta el inventario), deja a crédito lo
// que el cliente queda a deber y registra sus abonos. La API vive en
// handlers/pos_api.go.

// ReceptionistPuntoDeVentaPage — GET /receptionist/punto-de-venta
func ReceptionistPuntoDeVentaPage(c *gin.Context) {
	c.HTML(http.StatusOK, "punto-de-venta-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-punto-de-venta",
	}))
}

// ReceptionistVentasPage — GET /receptionist/ventas
// Tabla de ventas del punto de venta: cuánto se pagó en efectivo (y
// demás formas), cuánto quedó a crédito y cuánto deben todavía.
func ReceptionistVentasPage(c *gin.Context) {
	c.HTML(http.StatusOK, "ventas-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-ventas",
	}))
}
