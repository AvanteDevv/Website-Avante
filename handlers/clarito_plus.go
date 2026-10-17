package handlers

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"avante-optics/models"

	"github.com/gin-gonic/gin"
)

// CLARITO+ (Recepción → Clarito+) — registros del programa de clientes
// preferentes. La página pública de beneficios es /clarito-plus.
//
//   GET    /receptionist/clarito-plus                 página
//   GET    /api/receptionist/clarito-plus?hoja=       registros de la hoja
//   POST   /api/receptionist/clarito-plus             {hoja, datos}
//   PUT    /api/receptionist/clarito-plus/:id         {datos}
//   DELETE /api/receptionist/clarito-plus/:id
//   POST   /api/receptionist/clarito-plus/importar    {hoja, filas:[datos…]}

// ClaritoPlusPage — GET /receptionist/clarito-plus
func ClaritoPlusPage(c *gin.Context) {
	c.HTML(http.StatusOK, "clarito-plus-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-clarito-plus",
		"EsAdmin":    currentStaff(c).Role == RoleAdmin,
	}))
}

// ClaritoPlusPublicPage — GET /clarito-plus (beneficios de la tarjeta)
func ClaritoPlusPublicPage(c *gin.Context) {
	c.HTML(http.StatusOK, "clarito-plus.html", WithUser(c, gin.H{
		"ActivePage": "clarito-plus",
	}))
}

func cpError(c *gin.Context, where string, err error) {
	switch {
	case errors.Is(err, models.ErrCPHoja), errors.Is(err, models.ErrCPNombre), errors.Is(err, models.ErrCPGrande):
		c.JSON(http.StatusBadRequest, gin.H{"error": capFirst(err.Error()) + "."})
	case errors.Is(err, models.ErrCPNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese registro ya no existe (alguien lo borró)."})
	default:
		log.Printf("clarito_plus.%s: %v", where, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar. Intenta de nuevo."})
	}
}

func capFirst(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	if r[0] >= 'a' && r[0] <= 'z' {
		r[0] -= 32
	}
	return string(r)
}

func cpBy(c *gin.Context) string {
	if n := staffName(c); n != "" {
		return n
	}
	return "Recepción"
}

// ClaritoPlusList — GET /api/receptionist/clarito-plus?hoja=
func ClaritoPlusList(c *gin.Context) {
	items, err := models.ListClaritoPlus(c.Query("hoja"))
	if err != nil {
		cpError(c, "list", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "conteos": models.ClaritoPlusConteos()})
}

type cpBody struct {
	Hoja  string            `json:"hoja"`
	Datos map[string]string `json:"datos"`
}

// ClaritoPlusCreate — POST /api/receptionist/clarito-plus
func ClaritoPlusCreate(c *gin.Context) {
	var b cpBody
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	r, err := models.CreateClaritoPlus(b.Hoja, b.Datos, cpBy(c))
	if err != nil {
		cpError(c, "create", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": r})
}

// ClaritoPlusUpdate — PUT /api/receptionist/clarito-plus/:id
func ClaritoPlusUpdate(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var b cpBody
	if err := c.ShouldBindJSON(&b); err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	r, err := models.UpdateClaritoPlus(id, b.Datos, cpBy(c))
	if err != nil {
		cpError(c, "update", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": r})
}

// ClaritoPlusDelete — DELETE /api/receptionist/clarito-plus/:id
func ClaritoPlusDelete(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := models.DeleteClaritoPlus(id); err != nil {
		cpError(c, "delete", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ClaritoPlusImport — POST /api/receptionist/clarito-plus/importar
func ClaritoPlusImport(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<20)
	var b struct {
		Hoja  string              `json:"hoja"`
		Filas []map[string]string `json:"filas"`
	}
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el archivo."})
		return
	}
	if len(b.Filas) > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Son demasiadas filas (máximo 5,000 por hoja)."})
		return
	}
	ins, skip, err := models.ImportClaritoPlus(b.Hoja, b.Filas, cpBy(c))
	if err != nil {
		cpError(c, "import", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"insertados": ins, "omitidos": skip})
}
