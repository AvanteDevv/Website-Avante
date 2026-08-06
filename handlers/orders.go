package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

type createPedidoInput struct {
	ProductName  string  `json:"productName" binding:"required"`
	ProductBrand string  `json:"productBrand"`
	Quantity     int     `json:"quantity" binding:"required,min=1"`
	UnitPrice    float64 `json:"unitPrice" binding:"required"`
	RxOption     string  `json:"rxOption"`
	RxOD         string  `json:"rxOD"`
	RxOI         string  `json:"rxOI"`
	CustomerName string  `json:"customerName"`
}

// CreatePedido handles purchases from the public product page. No
// login required — this is what detalle-producto.js calls when the
// person clicks "Agregar al carrito".
func CreatePedido(c *gin.Context) {
	var input createPedidoInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de pedido inválidos."})
		return
	}

	order, err := models.CreateOrder(
		input.ProductName, input.ProductBrand, input.Quantity, input.UnitPrice,
		input.RxOption, input.RxOD, input.RxOI, input.CustomerName,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el pedido. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusCreated, order)
}
