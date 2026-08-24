package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod, igual que en auth.go.
//
// Monta estas tres rutas en main.go detrás de RequireAuthAPI():
//
//	api := router.Group("/api", handlers.RequireAuthAPI())
//	api.GET("/favorites", handlers.GetFavorites)
//	api.POST("/favorites", handlers.AddFavorite)
//	api.DELETE("/favorites/:productId", handlers.DeleteFavorite)

type addFavoriteInput struct {
	ProductID string `json:"product_id" binding:"required"`
	Name      string `json:"name" binding:"required"`
	Brand     string `json:"brand"`
	Price     string `json:"price" binding:"required"`
	OldPrice  string `json:"old_price"`
	Icon      string `json:"icon"`
	Image     string `json:"image"`
	Badge     string `json:"badge"`
	URL       string `json:"url"`
}

// GetFavorites devuelve la lista de favoritos del usuario logueado.
func GetFavorites(c *gin.Context) {
	favorites, err := models.GetFavoritesByUser(currentUserID(c))
	if err != nil {
		log.Println("GetFavorites: error al leer favoritos:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar tus favoritos."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"favorites": favorites})
}

// AddFavorite guarda un producto como favorito del usuario logueado.
// Es idempotente: si el cliente ya lo tenía guardado, no truena ni lo
// duplica, solo devuelve el registro existente.
func AddFavorite(c *gin.Context) {
	var input addFavoriteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Faltan datos del producto a guardar."})
		return
	}

	saved, err := models.AddFavorite(currentUserID(c), models.Favorite{
		ProductID: input.ProductID,
		Name:      input.Name,
		Brand:     input.Brand,
		Price:     input.Price,
		OldPrice:  input.OldPrice,
		Icon:      input.Icon,
		Image:     input.Image,
		Badge:     input.Badge,
		URL:       input.URL,
	})
	if err != nil {
		log.Println("AddFavorite: error al guardar favorito:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el favorito. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"favorite": saved})
}

// DeleteFavorite quita un producto de los favoritos del usuario logueado.
func DeleteFavorite(c *gin.Context) {
	productID := c.Param("productId")
	if productID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Falta el producto a quitar."})
		return
	}

	if err := models.RemoveFavorite(currentUserID(c), productID); err != nil {
		log.Println("DeleteFavorite: error al quitar favorito:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo quitar el favorito. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
