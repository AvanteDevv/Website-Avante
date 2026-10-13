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

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Orden de laboratorio: después de guardar la historia clínica, el
// optometrista llena la hoja que va al laboratorio (plantilla con
// kind = 'laboratorio'). Se guarda aparte (lab_order_sheets).

// GetLabExamTemplateHandler — GET /api/optometrist/plantillas/laboratorio
func GetLabExamTemplateHandler(c *gin.Context) { kindTemplate(c, models.ExamTemplateKindLab) }

// GetGarantiaTemplateHandler — GET /api/optometrist/plantillas/garantia
func GetGarantiaTemplateHandler(c *gin.Context) { kindTemplate(c, models.ExamTemplateKindGarantia) }

func kindTemplate(c *gin.Context, kind string) {
	t, err := models.GetExamTemplateByKind(kind)
	if err != nil {
		if errors.Is(err, models.ErrExamTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "No hay plantilla de ese tipo."})
			return
		}
		log.Println("orden-lab: plantilla", kind, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la plantilla."})
		return
	}
	c.JSON(http.StatusOK, t)
}

type createLabOrderSheetInput struct {
	Kind         string          `json:"kind"` // "laboratorio" (default) | "garantia"
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
	if in.Kind == "" {
		in.Kind = models.ExamTemplateKindLab
	}
	if !models.IsDocKind(in.Kind) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tipo de hoja inválido."})
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

	o, err := models.CreateLabOrderSheet(in.Kind, in.ExamID, in.TemplateID, in.PatientName, in.PatientPhone, in.UserID, in.Data, role, byID, staffName(c))
	if err != nil {
		log.Println("orden-lab: guardar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la hoja."})
		return
	}
	c.Set("lab_order_sheet", o.PatientName)
	c.JSON(http.StatusCreated, o)
}

// ListLabOrderSheetsHandler — GET /api/optometrist/ordenes-lab[?examId=&kind=]
func ListLabOrderSheetsHandler(c *gin.Context) {
	examID, _ := strconv.ParseInt(c.Query("examId"), 10, 64)
	kind := c.Query("kind")
	if kind != "" && !models.IsDocKind(kind) {
		kind = ""
	}
	list, err := models.ListLabOrderSheets(examID, kind)
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

// GarantiasResumenHandler — GET /api/optometrist/garantias/resumen
// Las garantías del mes en curso (hora de Hermosillo), total y por
// optometrista. Para el indicador de "Examen de la vista".
func GarantiasResumenHandler(c *gin.Context) {
	loc, err := time.LoadLocation("America/Hermosillo")
	if err != nil {
		loc = time.FixedZone("MST", -7*3600)
	}
	now := time.Now().In(loc)
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	to := from.AddDate(0, 1, 0)
	r, err := models.GetGarantiasResumen(from, to)
	if err != nil {
		log.Println("garantías: resumen:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo calcular las garantías."})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"mes":             from.Format("2006-01"),
		"total":           r.Total,
		"reparaciones":    r.Reparaciones,
		"porOptometrista": r.PorOptometrista,
	})
}

// DeleteLabOrderSheetHandler — DELETE /api/optometrist/ordenes-lab/:id
func DeleteLabOrderSheetHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hoja inválida."})
		return
	}
	if err := models.DeleteLabOrderSheet(id); err != nil {
		if errors.Is(err, models.ErrLabOrderSheetNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Esa hoja ya no existe."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DocListPage — GET /optometrist/ordenes-lab y /optometrist/garantias
// (la lista de esa hoja). DocNewPage — .../nueva (llenar solo esa hoja).
func DocListPage(kind string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.HTML(http.StatusOK, "documentos-optometrista.html", WithStaff(c, gin.H{
			"ActivePage": docActivePage(kind),
			"Doc":        kind,
		}))
	}
}

func DocNewPage(kind string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.HTML(http.StatusOK, "nuevo-examen.html", WithStaff(c, gin.H{
			"ActivePage": docActivePage(kind),
			"Doc":        kind,
		}))
	}
}

func docActivePage(kind string) string {
	if kind == models.ExamTemplateKindGarantia {
		return "optometrist-garantias"
	}
	return "optometrist-ordenes"
}
