package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida
// con el nombre del módulo en tu go.mod (primera línea: "module xxxxx").

type createEyeExamInput struct {
	TemplateID    int64           `json:"templateId" binding:"required"`
	PatientName   string          `json:"patientName" binding:"required"`
	PatientPhone  string          `json:"patientPhone"`
	Data          json.RawMessage `json:"data" binding:"required"`
	UserID        int64           `json:"userId"`        // 0 si el paciente no tiene cuenta
	AppointmentID int64           `json:"appointmentId"` // 0 si fue sin cita
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

	exam, err := models.CreateEyeExam(input.TemplateID, input.PatientName, input.PatientPhone, input.Data, roleStr, id, name, input.UserID, input.AppointmentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el examen."})
		return
	}

	// Si salió de una cita que seguía pendiente/verificada, se marca
	// "Asistió" — así recepción ya la ve como atendida sin hacerlo a mano.
	if input.AppointmentID > 0 {
		if appt, err := models.GetAppointmentByID(input.AppointmentID); err == nil && appt != nil &&
			(appt.Status == "pendiente" || appt.Status == "verificada") {
			if err := models.UpdateAppointmentStatus(appt.ID, "asistio"); err != nil {
				log.Printf("CreateEyeExam: no se pudo marcar la cita #%d como asistió: %v", appt.ID, err)
			}
		}
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
// (GET /api/optometrist/examenes). Con ?lite=1 regresa todos sin los
// resultados (data) — es lo que usa la lista y los contadores de
// "Examen de la vista".
func ListEyeExams(c *gin.Context) {
	if c.Query("lite") == "1" {
		list, err := models.ListEyeExamsLite()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los exámenes."})
			return
		}
		c.JSON(http.StatusOK, list)
		return
	}
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

/* ---------- Historial clínico: pacientes ---------- */

// ListPatientDirectory: todos los pacientes que tienen al menos un
// examen, con su número de exámenes, primera/última visita y cuándo le
// toca su revisión — GET /api/optometrist/pacientes/directorio.
func ListPatientDirectory(c *gin.Context) {
	list, err := models.ListPatientSummaries()
	if err != nil {
		log.Println("ListPatientDirectory:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el directorio de pacientes."})
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetPatientFile: ficha completa de un paciente — resumen, todos sus
// exámenes (con resultados), las plantillas que se usaron (para saber
// qué es cada campo) y sus antecedentes.
// GET /api/optometrist/pacientes/ficha?key=u:12 | n:juan perez
func GetPatientFile(c *gin.Context) {
	key := strings.TrimSpace(c.Query("key"))
	if !models.ValidPatientKey(key) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Paciente inválido."})
		return
	}
	p, exams, err := models.GetPatientFile(key)
	if errors.Is(err, models.ErrPatientNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "No se encontró al paciente."})
		return
	}
	if err != nil {
		log.Println("GetPatientFile:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la ficha."})
		return
	}

	templates := map[string]*models.ExamTemplate{}
	for _, e := range exams {
		k := strconv.FormatInt(e.TemplateID, 10)
		if _, done := templates[k]; done {
			continue
		}
		t, err := models.GetExamTemplateByID(e.TemplateID)
		if err != nil {
			templates[k] = nil // la plantilla se borró: el examen se muestra sin etiquetas
			continue
		}
		templates[k] = t
	}

	// Si ahora tiene cuenta pero los antecedentes se capturaron cuando
	// todavía no, se buscan también por su nombre.
	ante, err := models.GetPatientAntecedentes(key, "n:"+models.NormalizePatientName(p.Name))
	if err != nil {
		log.Println("GetPatientFile antecedentes:", err)
		ante = &models.PatientAntecedentes{Data: json.RawMessage(`{}`)}
	}

	c.JSON(http.StatusOK, gin.H{
		"patient":      p,
		"exams":        exams,
		"templates":    templates,
		"antecedentes": ante,
	})
}

type antecedentesInput struct {
	Key  string          `json:"key"`
	Name string          `json:"name"`
	Data json.RawMessage `json:"data"`
}

// SavePatientAntecedentes guarda los antecedentes de un paciente —
// PUT /api/optometrist/pacientes/antecedentes.
func SavePatientAntecedentes(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
	var in antecedentesInput
	if err := c.ShouldBindJSON(&in); err != nil || !models.ValidPatientKey(in.Key) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	var obj map[string]interface{}
	if len(in.Data) == 0 || json.Unmarshal(in.Data, &obj) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Antecedentes inválidos."})
		return
	}
	name := strings.TrimSpace(in.Name)
	if len(name) > 190 {
		name = name[:190]
	}
	c.Set("patient_name", name)

	by := staffName(c)
	if err := models.SetPatientAntecedentes(in.Key, name, in.Data, by); err != nil {
		log.Println("SavePatientAntecedentes:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron guardar los antecedentes."})
		return
	}
	now := time.Now()
	c.JSON(http.StatusOK, models.PatientAntecedentes{Data: in.Data, UpdatedBy: by, UpdatedAt: &now})
}
