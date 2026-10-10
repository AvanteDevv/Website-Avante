package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Orden de laboratorio: después de guardar la historia clínica, el
// optometrista llena la hoja que va al laboratorio (plantilla con
// kind = 'laboratorio'). Se guarda aparte (lab_order_sheets).

// GetLabExamTemplateHandler — GET /api/optometrist/plantillas/laboratorio
func GetLabExamTemplateHandler(c *gin.Context) {
	t, err := models.GetLabExamTemplate()
	if err != nil {
		if errors.Is(err, models.ErrExamTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "No hay plantilla de orden de laboratorio."})
			return
		}
		log.Println("orden-lab: plantilla:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la orden de laboratorio."})
		return
	}
	c.JSON(http.StatusOK, t)
}

type createLabOrderSheetInput struct {
	ExamID       int64           `json:"examId"`
	TemplateID   int64           `json:"templateId"`
	PatientName  string          `json:"patientName"`
	PatientPhone string          `json:"patientPhone"`
	UserID       int64           `json:"userId"`
	Data         json.RawMessage `json:"data"`
}

// CreateLabOrderSheetHandler — POST /api/optometrist/ordenes-lab
func CreateLabOrderSheetHandler(c *gin.Context) {
	var in createLabOrderSheetInput
	if err := c.ShouldBindJSON(&in); err != nil || in.TemplateID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de la orden inválidos."})
		return
	}
	in.PatientName = strings.TrimSpace(in.PatientName)
	if r := []rune(in.PatientName); len(r) > 160 {
		in.PatientName = string(r[:160])
	}
	in.PatientPhone = strings.TrimSpace(in.PatientPhone)
	if r := []rune(in.PatientPhone); len(r) > 40 {
		in.PatientPhone = string(r[:40])
	}
	if len(in.Data) > 0 && !json.Valid(in.Data) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de la orden inválidos."})
		return
	}

	roleVal, _ := c.Get("staff_role")
	role, _ := roleVal.(string)
	idVal, _ := c.Get("staff_id")
	byID, _ := idVal.(int64)

	o, err := models.CreateLabOrderSheet(in.ExamID, in.TemplateID, in.PatientName, in.PatientPhone, in.UserID, in.Data, role, byID, staffName(c))
	if err != nil {
		log.Println("orden-lab: guardar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la orden de laboratorio."})
		return
	}
	c.Set("lab_order_sheet", o.PatientName)
	c.JSON(http.StatusCreated, o)
}

// ListLabOrderSheetsHandler — GET /api/optometrist/ordenes-lab[?examId=]
func ListLabOrderSheetsHandler(c *gin.Context) {
	examID, _ := strconv.ParseInt(c.Query("examId"), 10, 64)
	list, err := models.ListLabOrderSheets(examID)
	if err != nil {
		log.Println("orden-lab: listar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar las órdenes."})
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetLabOrderSheetHandler — GET /api/optometrist/ordenes-lab/:id
func GetLabOrderSheetHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Orden inválida."})
		return
	}
	o, err := models.GetLabOrderSheet(id)
	if err != nil {
		if errors.Is(err, models.ErrLabOrderSheetNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Esa orden ya no existe."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la orden."})
		return
	}
	c.JSON(http.StatusOK, o)
}
