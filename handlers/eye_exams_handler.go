package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida
// con el nombre del módulo en tu go.mod (primera línea: "module xxxxx").

type createEyeExamInput struct {
	TemplateID   int64           `json:"templateId" binding:"required"`
	PatientName  string          `json:"patientName" binding:"required"`
	PatientPhone string          `json:"patientPhone"`
	Data         json.RawMessage `json:"data" binding:"required"`
	UserID       int64           `json:"userId"` // 0 si el paciente no tiene cuenta
}

// CreateEyeExam guarda un examen ya llenado (POST /api/optometrist/examenes).
// Toma quién lo creó del contexto que dejó RequireAdminAuth — no hace
// falta que el frontend lo mande.
func CreateEyeExam(c *gin.Context) {
	var input createEyeExamInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de examen inválidos."})
		return
	}

	role, _ := c.Get("staff_role")
	roleStr, _ := role.(string)
	idVal, _ := c.Get("staff_id")
	id, _ := idVal.(int64)
	nameVal, _ := c.Get("staff_name")
	name, _ := nameVal.(string)

	exam, err := models.CreateEyeExam(input.TemplateID, input.PatientName, input.PatientPhone, input.Data, roleStr, id, name, input.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el examen."})
		return
	}
	c.JSON(http.StatusCreated, exam)
}

// SearchPatients busca clientes por nombre o teléfono (para el
// autocompletado del campo "Nombre" en Nuevo examen) —
// GET /api/optometrist/pacientes?q=...
func SearchPatients(c *gin.Context) {
	term := c.Query("q")
	if len(term) < 2 {
		c.JSON(http.StatusOK, []models.PatientMatch{})
		return
	}
	matches, err := models.SearchPatients(term)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo buscar al paciente."})
		return
	}
	c.JSON(http.StatusOK, matches)
}

// ListEyeExams devuelve los exámenes recientes, o filtrados por nombre
// de paciente si viene ?paciente=... en la query
// (GET /api/optometrist/examenes).
func ListEyeExams(c *gin.Context) {
	term := c.Query("paciente")

	var exams []models.EyeExam
	var err error
	if term != "" {
		exams, err = models.ListEyeExamsByPatientName(term)
	} else {
		exams, err = models.ListEyeExams()
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los exámenes."})
		return
	}
	if exams == nil {
		exams = []models.EyeExam{}
	}
	c.JSON(http.StatusOK, exams)
}

// GetEyeExam devuelve un examen por id — lo usa la vista de detalle
// para renderizarlo sobre la plantilla que se usó
// (GET /api/optometrist/examenes/:id).
func GetEyeExam(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de examen inválido."})
		return
	}
	exam, err := models.GetEyeExamByID(id)
	if errors.Is(err, models.ErrEyeExamNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Examen no encontrado."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el examen."})
		return
	}
	c.JSON(http.StatusOK, exam)
}

// GetMyEyeExams devuelve los exámenes ligados a la cuenta del cliente
// logueado — GET /api/mis-examenes. Requiere sesión de cliente
// (RequireAuthAPI, igual que /api/favorites y /api/mis-citas).
//
// Solo aparecen aquí los exámenes que quedaron ligados por user_id al
// momento de crearse (el optometrista encontró la cuenta al escribir
// el nombre) — los de pacientes sin cuenta no aparecen, se comparten
// por WhatsApp/correo en su momento.
func GetMyEyeExams(c *gin.Context) {
	exams, err := models.ListEyeExamsByUser(currentUserID(c))
	if err != nil {
		log.Println("GetMyEyeExams: error al leer exámenes:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar tus exámenes."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"examenes": exams})
}

// DeleteEyeExam elimina un examen — DELETE /api/optometrist/examenes/:id.
func DeleteEyeExam(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de examen inválido."})
		return
	}

	if err := models.DeleteEyeExam(id); err != nil {
		if errors.Is(err, models.ErrEyeExamNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Examen no encontrado."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar el examen."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Examen eliminado."})
}
