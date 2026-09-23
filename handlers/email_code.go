package handlers

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/mailer"
	"avante-optics/models"
)

type sendCodeEmailInput struct {
	Nombre   string `json:"nombre" binding:"required"`
	Apellido string `json:"apellido"`
	Celular  string `json:"celular" binding:"required"` // "+52XXXXXXXXXX"
	Correo   string `json:"correo" binding:"required"`
}

// SendVerificationCodeByEmail — POST /api/agendar/codigo-correo
//
// Botón "Tampoco me llegó por SMS — mándamelo por correo" (agendar y
// registro). Manda por correo el MISMO código que se generó para ese
// celular (models.CodeForEmail), así /api/agendar/verificar lo acepta
// sin cambios y el resto del flujo (ConsumeVerification) queda igual.
func SendVerificationCodeByEmail(c *gin.Context) {
	var input sendCodeEmailInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Faltan tus datos de contacto."})
		return
	}
	input.Correo = strings.TrimSpace(input.Correo)

	if !celularRe.MatchString(input.Celular) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Número de celular inválido."})
		return
	}
	if !emailRe.MatchString(input.Correo) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Correo inválido."})
		return
	}
	if !mailer.Enabled() {
		log.Println("SendVerificationCodeByEmail: mailer sin configurar (SMTP_USER/SMTP_PASS)")
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "El envío por correo no está disponible en este momento."})
		return
	}

	code, err := models.CodeForEmail(input.Celular, input.Nombre, input.Apellido)
	if errors.Is(err, models.ErrEmailCooldown) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Ya te lo enviamos. Espera unos segundos antes de pedirlo otra vez."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo generar el código. Intenta de nuevo."})
		return
	}

	if err := mailer.SendVerificationCode(input.Correo, input.Nombre, code); err != nil {
		log.Println("SendVerificationCodeByEmail: error al enviar correo:", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "No se pudo enviar el correo. Intenta de nuevo."})
		return
	}

	resp := gin.H{"message": "Te enviamos el código a tu correo."}
	if os.Getenv("APPT_OTP_DEBUG") == "true" {
		resp["debug_code"] = code
	}
	c.JSON(http.StatusOK, resp)
}
