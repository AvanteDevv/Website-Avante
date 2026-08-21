package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida
// con el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Endpoints del editor visual de plantillas de examen — mismo espíritu
// que tu editor Elementor: el frontend arma un JSON con la posición y
// propiedades de cada elemento del lienzo, y este archivo solo lo
// guarda/recupera tal cual, sin intentar entender su contenido.

type examTemplateInput struct {
	Name     string          `json:"name" binding:"required"`
	CanvasW  int             `json:"canvasW" binding:"required"`
	CanvasH  int             `json:"canvasH" binding:"required"`
	Elements json.RawMessage `json:"elements" binding:"required"`
}

// ListExamTemplates devuelve todas las plantillas guardadas
// (GET /api/optometrist/plantillas).
func ListExamTemplates(c *gin.Context) {
	templates, err := models.ListExamTemplates()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar las plantillas."})
		return
	}
	if templates == nil {
		templates = []models.ExamTemplate{}
	}
	c.JSON(http.StatusOK, templates)
}

// GetActiveExamTemplate devuelve la plantilla activa, o 404 si
// todavía no se ha guardado/activado ninguna
// (GET /api/optometrist/plantillas/activa).
func GetActiveExamTemplate(c *gin.Context) {
	t, err := models.GetActiveExamTemplate()
	if errors.Is(err, models.ErrExamTemplateNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Todavía no hay ninguna plantilla activa."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la plantilla activa."})
		return
	}
	c.JSON(http.StatusOK, t)
}

// GetExamTemplate devuelve una plantilla por id — la usa el editor al
// abrir una ya existente (GET /api/optometrist/plantillas/:id).
func GetExamTemplate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de plantilla inválido."})
		return
	}
	t, err := models.GetExamTemplateByID(id)
	if errors.Is(err, models.ErrExamTemplateNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Plantilla no encontrada."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la plantilla."})
		return
	}
	c.JSON(http.StatusOK, t)
}

// CreateExamTemplate crea una plantilla nueva desde cero
// (POST /api/optometrist/plantillas).
func CreateExamTemplate(c *gin.Context) {
	var input examTemplateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de plantilla inválidos."})
		return
	}
	t, err := models.CreateExamTemplate(input.Name, input.CanvasW, input.CanvasH, input.Elements)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear la plantilla."})
		return
	}
	c.JSON(http.StatusCreated, t)
}

// UpdateExamTemplate guarda los cambios de una plantilla existente —
// es lo que llama el botón "Guardar" del editor
// (PUT /api/optometrist/plantillas/:id).
func UpdateExamTemplate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de plantilla inválido."})
		return
	}
	var input examTemplateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de plantilla inválidos."})
		return
	}
	if err := models.UpdateExamTemplate(id, input.Name, input.CanvasW, input.CanvasH, input.Elements); err != nil {
		if errors.Is(err, models.ErrExamTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Plantilla no encontrada."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la plantilla."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Plantilla guardada correctamente."})
}

// ActivateExamTemplate marca una plantilla como la activa —
// (POST /api/optometrist/plantillas/:id/activar).
func ActivateExamTemplate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de plantilla inválido."})
		return
	}
	if err := models.SetActiveExamTemplate(id); err != nil {
		if errors.Is(err, models.ErrExamTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Plantilla no encontrada."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo activar la plantilla."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Plantilla activada."})
}

// DeleteExamTemplate elimina una plantilla
// (DELETE /api/optometrist/plantillas/:id).
func DeleteExamTemplate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de plantilla inválido."})
		return
	}
	if err := models.DeleteExamTemplate(id); err != nil {
		if errors.Is(err, models.ErrExamTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Plantilla no encontrada."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar la plantilla."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Plantilla eliminada."})
}
