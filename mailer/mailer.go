package mailer

import (
	"errors"
	"fmt"
	"html"
	"mime"
	"net/smtp"
	"os"
	"strings"
)

// Envío de correos por SMTP de Gmail (cuenta personal + contraseña de
// aplicación). Variables de entorno:
//
//	SMTP_USER       — la cuenta de Gmail que envía, ej. avanteoptics@gmail.com
//	SMTP_PASS       — contraseña de aplicación de 16 letras (NO la contraseña normal)
//	SMTP_FROM_NAME  — opcional, nombre que ve el cliente (default "Avante Optics")
//	SMTP_HOST       — opcional, default smtp.gmail.com
//	SMTP_PORT       — opcional, default 587
//
// Si faltan SMTP_USER/SMTP_PASS, Enabled() regresa false y los envíos
// fallan con ErrNotConfigured en vez de tumbar el servidor.

var ErrNotConfigured = errors.New("mailer: faltan SMTP_USER / SMTP_PASS")

type config struct {
	user, pass, fromName, host, port string
}

func load() (config, error) {
	c := config{
		user:     strings.TrimSpace(os.Getenv("SMTP_USER")),
		pass:     strings.ReplaceAll(strings.TrimSpace(os.Getenv("SMTP_PASS")), " ", ""),
		fromName: strings.TrimSpace(os.Getenv("SMTP_FROM_NAME")),
		host:     strings.TrimSpace(os.Getenv("SMTP_HOST")),
		port:     strings.TrimSpace(os.Getenv("SMTP_PORT")),
	}
	if c.user == "" || c.pass == "" {
		return c, ErrNotConfigured
	}
	if c.fromName == "" {
		c.fromName = "Avante Optics"
	}
	if c.host == "" {
		c.host = "smtp.gmail.com"
	}
	if c.port == "" {
		c.port = "587"
	}
	return c, nil
}

// Enabled indica si hay credenciales SMTP configuradas.
func Enabled() bool {
	_, err := load()
	return err == nil
}

// Send manda un correo HTML. smtp.SendMail hace STARTTLS solo en el 587.
func Send(to, subject, htmlBody string) error {
	c, err := load()
	if err != nil {
		return err
	}
	to = strings.TrimSpace(to)
	if to == "" || strings.ContainsAny(to, "\r\n") {
		return errors.New("mailer: destinatario inválido")
	}

	from := fmt.Sprintf("%s <%s>", mime.QEncoding.Encode("utf-8", c.fromName), c.user)
	headers := []string{
		"From: " + from,
		"To: " + to,
		"Subject: " + mime.QEncoding.Encode("utf-8", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
	}
	msg := strings.Join(headers, "\r\n") + "\r\n\r\n" + htmlBody

	auth := smtp.PlainAuth("", c.user, c.pass, c.host)
	return smtp.SendMail(c.host+":"+c.port, auth, c.user, []string{to}, []byte(msg))
}

// SendVerificationCode manda el código de 4 dígitos con el mismo estilo
// del sitio (azul Avante).
func SendVerificationCode(to, nombre, code string) error {
	nombre = html.EscapeString(strings.TrimSpace(nombre))
	saludo := "Hola"
	if nombre != "" {
		saludo = "Hola, " + nombre
	}

	body := `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#F5F7FF;font-family:Arial,Helvetica,sans-serif;color:#0A0E38;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #DDE3FA;border-radius:20px;">
<tr><td style="background:#041cff;border-radius:20px 20px 0 0;padding:22px 28px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.5px;">Avante Optics</td></tr>
<tr><td style="padding:30px 28px 10px;font-size:15px;line-height:1.6;">` + saludo + `:<br>Este es tu código de verificación:</td></tr>
<tr><td align="center" style="padding:14px 28px 18px;">
<div style="display:inline-block;background:#F5F7FF;border:1px solid #DDE3FA;border-radius:14px;padding:16px 28px;font-size:34px;font-weight:bold;letter-spacing:12px;color:#041cff;">` + html.EscapeString(code) + `</div>
</td></tr>
<tr><td style="padding:0 28px 30px;font-size:13px;line-height:1.6;color:#6670A6;">Escríbelo en la ventana de verificación del sitio. Vence en unos minutos. Si tú no lo pediste, puedes ignorar este correo.</td></tr>
</table>
<p style="font-size:11px;color:#6670A6;margin-top:16px;">Avante Optics · Hermosillo, Sonora</p>
</td></tr></table></body></html>`

	return Send(to, "Tu código de verificación: "+code, body)
}
