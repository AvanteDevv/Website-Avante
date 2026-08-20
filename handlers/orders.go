package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/auth"
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
// login required — this is what detalle-producto.js (y ahora
// pasarela-de-pagos.js, una vez por línea del carrito) llama al
// comprar.
//
// Esta ruta sigue siendo pública (POST /api/pedidos, sin
// RequireAuthAPI) — comprar sin cuenta debe seguir funcionando igual.
// Por eso aquí no usamos currentUserID(c) (que depende de que
// RequireAuthAPI ya haya corrido) — leemos la cookie de sesión
// directamente, y si no hay sesión válida simplemente no ligamos nada
// (el pedido queda como invitado, igual que antes).
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

	// Si hay sesión de cliente activa (aunque esta ruta no la exija),
	// ligamos el pedido a la cuenta para que aparezca en "Mis
	// pedidos". Best-effort: si algo falla aquí, no tumbamos la compra
	// — el pedido ya se creó bien.
	if session, err := auth.Store.Get(c.Request, auth.SessionName); err == nil {
		if raw := session.Values["user_id"]; raw != nil {
			var userID int64
			switch v := raw.(type) {
			case int64:
				userID = v
			case int:
				userID = int64(v)
			}
			if userID != 0 {
				if err := models.AttachOrderToUser(order.ID, userID); err == nil {
					order.UserID = &userID
				}
			}
		}
	}

	c.JSON(http.StatusCreated, order)
}
