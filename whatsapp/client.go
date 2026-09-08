// Package whatsapp envía mensajes de plantilla (template) a través de la
// WhatsApp Cloud API de Meta — se usa para los recordatorios
// automáticos de citas (ver reminders/scheduler.go).
//
// Requiere las variables de entorno:
//
//	WHATSAPP_PHONE_NUMBER_ID — el "Phone number ID" de tu número, del panel de Meta for Developers
//	WHATSAPP_ACCESS_TOKEN    — token permanente del System User (Business Settings > Usuarios del sistema)
//	WHATSAPP_API_VERSION     — opcional, ej. "v21.0" (usa un default si no la defines)
package whatsapp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ⚠️ Ajusta "avante-optics" en los otros archivos que importen este
// paquete para que coincida con el nombre del módulo en tu go.mod.

const defaultAPIVersion = "v21.0"

func apiVersion() string {
	if v := os.Getenv("WHATSAPP_API_VERSION"); v != "" {
		return v
	}
	return defaultAPIVersion
}

func phoneNumberID() string { return os.Getenv("WHATSAPP_PHONE_NUMBER_ID") }
func accessToken() string   { return os.Getenv("WHATSAPP_ACCESS_TOKEN") }

// toE164NoPlus convierte "+526621234567" -> "526621234567" — el campo
// "to" de la Cloud API va sin el "+" al inicio.
func toE164NoPlus(celular string) string {
	return strings.TrimPrefix(strings.TrimSpace(celular), "+")
}

type templateParameter struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
type templateComponent struct {
	Type       string              `json:"type"`
	Parameters []templateParameter `json:"parameters"`
}
type templateLanguage struct {
	Code string `json:"code"`
}
type templateBody struct {
	Name       string              `json:"name"`
	Language   templateLanguage    `json:"language"`
	Components []templateComponent `json:"components,omitempty"`
}
type sendTemplateRequest struct {
	MessagingProduct string       `json:"messaging_product"`
	To               string       `json:"to"`
	Type             string       `json:"type"`
	Template         templateBody `json:"template"`
}

// SendTemplateMessage manda un mensaje de plantilla YA APROBADA por
// Meta.
//
//   - templateName debe coincidir EXACTO con el nombre de la plantilla
//     tal como quedó aprobada en WhatsApp Manager (minúsculas y guiones
//     bajos, ej. "cita_recordatorio_24h").
//   - languageCode es el código con el que se aprobó esa plantilla
//     (ej. "es_MX" o "es" — el que hayas elegido al crearla).
//   - bodyParams son los valores que sustituyen, en orden, los
//     {{1}}, {{2}}, etc. del cuerpo de la plantilla.
func SendTemplateMessage(celular, templateName, languageCode string, bodyParams []string) error {
	if phoneNumberID() == "" || accessToken() == "" {
		return fmt.Errorf("faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN en el entorno")
	}

	var components []templateComponent
	if len(bodyParams) > 0 {
		params := make([]templateParameter, len(bodyParams))
		for i, p := range bodyParams {
			params[i] = templateParameter{Type: "text", Text: p}
		}
		components = []templateComponent{{Type: "body", Parameters: params}}
	}

	payload := sendTemplateRequest{
		MessagingProduct: "whatsapp",
		To:               toE164NoPlus(celular),
		Type:             "template",
		Template: templateBody{
			Name:       templateName,
			Language:   templateLanguage{Code: languageCode},
			Components: components,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("https://graph.facebook.com/%s/%s/messages", apiVersion(), phoneNumberID())
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken())

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 300 {
		respBody, _ := io.ReadAll(res.Body)
		return fmt.Errorf("WhatsApp API respondió %d: %s", res.StatusCode, string(respBody))
	}
	return nil
}
