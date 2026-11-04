// Package clip habla con la API de Clip (Checkout redireccionado v2):
// se crea un link de pago, el cliente paga en la página de Clip y
// regresa a la tienda; el estado del pago siempre se confirma
// consultando a Clip desde el servidor (nunca se confía en lo que diga
// el navegador o el cuerpo del webhook).
//
// Variables de entorno:
//
//	CLIP_API_KEY      clave API del panel de Clip (Desarrolladores)
//	CLIP_SECRET_KEY   clave secreta
//	CLIP_AUTH_TOKEN   (opcional) el token ya armado; si viene, se usa
//	                  tal cual en lugar de base64(API_KEY:SECRET_KEY)
//	CLIP_API_BASE     (opcional) por defecto https://api.payclip.com
package clip

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ErrNotConfigured: faltan las llaves de Clip en el entorno.
var ErrNotConfigured = errors.New("clip: faltan CLIP_API_KEY y CLIP_SECRET_KEY")

var httpClient = &http.Client{Timeout: 20 * time.Second}

func baseURL() string {
	if b := strings.TrimRight(strings.TrimSpace(os.Getenv("CLIP_API_BASE")), "/"); b != "" {
		return b
	}
	return "https://api.payclip.com"
}

// Configured: true si hay llaves para cobrar.
func Configured() bool { return authHeader() != "" }

func authHeader() string {
	if t := strings.TrimSpace(os.Getenv("CLIP_AUTH_TOKEN")); t != "" {
		if strings.HasPrefix(strings.ToLower(t), "basic ") {
			return t
		}
		return "Basic " + t
	}
	key := strings.TrimSpace(os.Getenv("CLIP_API_KEY"))
	secret := strings.TrimSpace(os.Getenv("CLIP_SECRET_KEY"))
	if key == "" || secret == "" {
		return ""
	}
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(key+":"+secret))
}

// CheckoutRequest: lo que se manda para crear el link de pago.
type CheckoutRequest struct {
	Amount              float64        `json:"amount"`
	Currency            string         `json:"currency"`
	PurchaseDescription string         `json:"purchase_description"`
	RedirectionURL      RedirectionURL `json:"redirection_url"`
	Metadata            map[string]any `json:"metadata,omitempty"`
	WebhookURL          string         `json:"webhook_url,omitempty"`
}

// RedirectionURL: a dónde regresa el cliente después de pagar.
type RedirectionURL struct {
	Success string `json:"success"`
	Error   string `json:"error"`
	Default string `json:"default"`
}

// Checkout: lo que regresa Clip (los nombres de campo varían un poco
// entre versiones, por eso se leen con varias opciones).
type Checkout struct {
	ID     string         // payment_request_id
	URL    string         // payment_request_url (a donde se manda al cliente)
	Status string         // CHECKOUT_CREATED, CHECKOUT_PENDING, CHECKOUT_COMPLETED, ...
	Raw    map[string]any // respuesta completa (para el log)
}

// Paid: el pago quedó completado.
func (c *Checkout) Paid() bool {
	s := strings.ToUpper(c.Status)
	switch s {
	case "CHECKOUT_COMPLETED", "COMPLETED", "PAID", "APPROVED", "SUCCEEDED":
		return true
	}
	return false
}

// Failed: ya no se va a pagar (expiró, se canceló o fue rechazado).
func (c *Checkout) Failed() bool {
	s := strings.ToUpper(c.Status)
	return strings.Contains(s, "EXPIRED") || strings.Contains(s, "CANCEL") ||
		strings.Contains(s, "REJECT") || strings.Contains(s, "DECLIN") || strings.Contains(s, "FAIL")
}

// CreateCheckout crea el link de pago.
func CreateCheckout(ctx context.Context, req CheckoutRequest) (*Checkout, error) {
	if req.Currency == "" {
		req.Currency = "MXN"
	}
	body, _ := json.Marshal(req)
	raw, err := call(ctx, http.MethodPost, "/v2/checkout", body)
	if err != nil {
		return nil, err
	}
	co := parse(raw)
	if co.URL == "" {
		return co, fmt.Errorf("clip: la respuesta no trae el link de pago")
	}
	return co, nil
}

// GetCheckout consulta el estado de un link de pago.
func GetCheckout(ctx context.Context, id string) (*Checkout, error) {
	if strings.TrimSpace(id) == "" {
		return nil, errors.New("clip: falta el id del pago")
	}
	raw, err := call(ctx, http.MethodGet, "/v2/checkout/"+id, nil)
	if err != nil {
		return nil, err
	}
	co := parse(raw)
	if co.ID == "" {
		co.ID = id
	}
	return co, nil
}

func call(ctx context.Context, method, path string, body []byte) (map[string]any, error) {
	auth := authHeader()
	if auth == "" {
		return nil, ErrNotConfigured
	}
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	r, err := http.NewRequestWithContext(ctx, method, baseURL()+path, rd)
	if err != nil {
		return nil, err
	}
	r.Header.Set("Authorization", auth)
	r.Header.Set("Accept", "application/json")
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	resp, err := httpClient.Do(r)
	if err != nil {
		return nil, fmt.Errorf("clip: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	out := map[string]any{}
	_ = json.Unmarshal(data, &out)
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		msg := strings.TrimSpace(string(data))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return out, fmt.Errorf("clip: HTTP %d: %s", resp.StatusCode, msg)
	}
	return out, nil
}

func parse(m map[string]any) *Checkout {
	co := &Checkout{Raw: m}
	co.ID = Str(m, "payment_request_id", "id", "checkout_id")
	co.URL = Str(m, "payment_request_url", "payment_url", "url", "checkout_url")
	co.Status = Str(m, "status", "payment_request_status", "checkout_status")
	return co
}

// Str regresa el primer campo de texto que exista en m (también busca
// un nivel adentro, p. ej. {"data": {...}} o {"resource": {...}}).
func Str(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case string:
				if strings.TrimSpace(t) != "" {
					return strings.TrimSpace(t)
				}
			case float64:
				return strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%f", t), "0"), ".")
			}
		}
	}
	for _, wrap := range []string{"data", "resource", "payment_request", "checkout"} {
		if sub, ok := m[wrap].(map[string]any); ok {
			if s := Str(sub, keys...); s != "" {
				return s
			}
		}
	}
	return ""
}