package handlers

import (
	"fmt"
	"net/http"
	"os"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/auth"
	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

var celularRe = regexp.MustCompile(`^\+52\d{10}$`) // +52 y 10 dígitos

// ---------------------------------------------------------------------
// 1) Enviar código de verificación
// ---------------------------------------------------------------------

type sendCodeInput struct {
	Nombre   string `json:"nombre" binding:"required"`
	Apellido string `json:"apellido" binding:"required"`
	Celular  string `json:"celular" binding:"required"` // "+52XXXXXXXXXX"
}

// SendVerificationCode genera un código de 4 dígitos y lo encola para
// enviarse por SMS real a través del celular-gateway (ver
// sms_queue.go / sms_gateway.go). El código ya no se simula: se guarda
// en la tabla sms_queue con status "pendiente" y la app Android del
// celular lo recoge y lo manda por SMS en los siguientes segundos.
func SendVerificationCode(c *gin.Context) {
	var input sendCodeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Completa tu nombre, apellido y celular."})
		return
	}

	if !celularRe.MatchString(input.Celular) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Número de celular inválido. Debe incluir +52 y 10 dígitos."})
		return
	}

	code, err := models.SaveCode(input.Celular, input.Nombre, input.Apellido)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo generar el código. Intenta de nuevo."})
		return
	}

	mensaje := fmt.Sprintf("Avante Optics: tu código de verificación es %s. Vence en 5 minutos.", code)
	if _, err := models.EnqueueSMS(input.Celular, mensaje); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo enviar el código. Intenta de nuevo."})
		return
	}

	resp := gin.H{"message": "Te enviamos un código de verificación por SMS."}
	// Solo para pruebas locales: si defines APPT_OTP_DEBUG=true en el
	// entorno, el código se regresa también en la respuesta para no
	// tener que ir a revisar la base mientras pruebas. Quítalo (o deja
	// la variable sin definir) en producción.
	if os.Getenv("APPT_OTP_DEBUG") == "true" {
		resp["debug_code"] = code
	}

	c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------
// 2) Verificar código
// ---------------------------------------------------------------------

type verifyCodeInput struct {
	Celular string `json:"celular" binding:"required"`
	Codigo  string `json:"codigo" binding:"required"`
}

func VerifyCode(c *gin.Context) {
	var input verifyCodeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Código inválido."})
		return
	}

	if err := models.VerifyCode(input.Celular, input.Codigo); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El código no es correcto o ya expiró."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Número verificado."})
}

// ---------------------------------------------------------------------
// 3) Horas ya ocupadas para un día (para pintarlas de "Ocupado")
// ---------------------------------------------------------------------

// GetOccupiedHours regresa, para una fecha dada (?fecha=2026-08-20), la
// lista de horas ("HH:MM") que ya tiene alguien agendadas — se usa para
// deshabilitar esas horas en el calendario público, como en Doctoralia.
func GetOccupiedHours(c *gin.Context) {
	dateStr := c.Query("fecha")
	if dateStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Falta la fecha."})
		return
	}

	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha inválida."})
		return
	}

	times, err := models.GetBookedTimes(date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron consultar los horarios."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ocupadas": times})
}

// ---------------------------------------------------------------------
// 4) Crear la cita (ahora exige verificación previa + datos de contacto)
// ---------------------------------------------------------------------

type createAppointmentInput struct {
	Date     string `json:"date" binding:"required"` // "2026-08-20"
	Time     string `json:"time" binding:"required"` // "10:00"
	Nombre   string `json:"nombre" binding:"required"`
	Apellido string `json:"apellido" binding:"required"`
	Celular  string `json:"celular" binding:"required"` // "+52XXXXXXXXXX", debe estar ya verificado
}

// optionalUserID revisa si quien está agendando tiene sesión de cliente
// iniciada, SIN exigirla — a diferencia de currentUserID (auth.go), que
// solo se usa detrás de RequireAuthAPI() y asume que la sesión ya fue
// validada. Agendar cita sigue siendo público (no requiere login), así
// que aquí solo es "si la hay, úsala; si no, sigue como invitado".
// Devuelve 0 cuando no hay sesión.
func optionalUserID(c *gin.Context) int64 {
	session, _ := auth.Store.Get(c.Request, auth.SessionName)
	switch id := session.Values["user_id"].(type) {
	case int64:
		return id
	case int:
		return int64(id)
	default:
		return 0
	}
}

// CreateAppointment handles bookings from the public "Agenda tu cita"
// section. No login required — this is what agendar.js calls when the
// person confirms a day y hora, después de haber verificado su celular
// con el código de 4 dígitos. Si la persona SÍ tiene sesión de cliente
// iniciada en ese momento, la cita queda ligada a su cuenta (aparece en
// su panel "Mis citas"); si no, queda solo identificada por celular,
// igual que antes.
func CreateAppointment(c *gin.Context) {
	var input createAppointmentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecciona un día y una hora válidos."})
		return
	}

	if !celularRe.MatchString(input.Celular) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Número de celular inválido."})
		return
	}

	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha inválida."})
		return
	}

	// Última verificación anti-doble-booking: puede que esa hora se haya
	// ocupado justo entre que la persona vio el calendario y que terminó
	// de verificar su código. Si ya está tomada, se rechaza con 409 antes
	// de siquiera gastar la verificación (así puede reintentar con otra
	// hora sin tener que volver a pedir código).
	booked, err := models.IsSlotBooked(date, input.Time)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo verificar el horario."})
		return
	}
	if booked {
		c.JSON(http.StatusConflict, gin.H{"error": "Esa hora ya fue agendada por alguien más. Elige otra."})
		return
	}

	// El celular debe haber sido verificado con el código de 4 dígitos
	// justo antes de esto (ConsumeVerification lo borra al usarlo, así
	// que un mismo código verificado no se puede reusar para 2 citas).
	//
	// EXCEPCIÓN: si quien agenda ya tiene sesión de cliente iniciada, su
	// login ya la autentica — no se le vuelve a pedir el código SMS.
	userID := optionalUserID(c)
	if userID == 0 {
		if err := models.ConsumeVerification(input.Celular); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Debes verificar tu número antes de agendar."})
			return
		}
	}

	if _, err := models.CreateAppointment(date, input.Time, input.Nombre, input.Apellido, input.Celular, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo agendar la cita. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Cita agendada correctamente."})
}