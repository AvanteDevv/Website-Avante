package handlers

// google_reviews.go
//
// Obtiene las reseñas reales del negocio en Google (vía Places API New),
// las transforma al mismo formato que ya espera el frontend
// (avante-reviews-data / GOOGLE_DATA en index.js) y las cachea en memoria
// para no gastar cuota de la API en cada visita al sitio.
//
// Variables de entorno requeridas:
//   GOOGLE_PLACES_API_KEY   -> la API key restringida a "Places API (New)"
//   GOOGLE_PLACE_ID         -> el Place ID de Avante Optics (empieza con "ChIJ")

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

// ---------- Estructuras que coinciden EXACTO con lo que lee index.js ----------

// GoogleReview es una sola reseña, en el formato que ya usa el carrusel.
type GoogleReview struct {
	Name   string `json:"name"`
	Date   string `json:"date"`
	Rating int    `json:"rating"`
	Text   string `json:"text"`
}

// GoogleReviewsData es el objeto completo que el JS busca en
// <script id="avante-reviews-data">...</script> (rating, count, profileUrl, reviews).
type GoogleReviewsData struct {
	Rating     float64        `json:"rating"`
	Count      int            `json:"count"`
	ProfileURL string         `json:"profileUrl"`
	Reviews    []GoogleReview `json:"reviews"`
}

// ---------- Estructuras crudas de la respuesta de Places API (New) ----------

type placesAPIResponse struct {
	Rating          float64           `json:"rating"`
	UserRatingCount int               `json:"userRatingCount"`
	GoogleMapsURI   string            `json:"googleMapsUri"`
	Reviews         []placesAPIReview `json:"reviews"`
}

type placesAPIReview struct {
	Rating                  int    `json:"rating"`
	RelativePublishTimeDesc string `json:"relativePublishTimeDescription"`
	Text                    struct {
		Text string `json:"text"`
	} `json:"text"`
	AuthorAttribution struct {
		DisplayName string `json:"displayName"`
	} `json:"authorAttribution"`
}

// ---------- Cache en memoria ----------

// ReviewsCache guarda el último resultado y lo reutiliza hasta que expira,
// para no llamar a la API de Google en cada carga del sitio.
type ReviewsCache struct {
	mu        sync.RWMutex
	data      *GoogleReviewsData
	fetchedAt time.Time
	ttl       time.Duration

	apiKey  string
	placeID string
	client  *http.Client
}

// NewReviewsCache crea el cache. ttl recomendado: 24 * time.Hour
// (las reseñas no cambian tan seguido como para justificar refrescarlas más seguido).
func NewReviewsCache(apiKey, placeID string, ttl time.Duration) *ReviewsCache {
	return &ReviewsCache{
		ttl:     ttl,
		apiKey:  apiKey,
		placeID: placeID,
		client:  &http.Client{Timeout: 8 * time.Second},
	}
}

// NewReviewsCacheFromEnv construye el cache leyendo GOOGLE_PLACES_API_KEY
// y GOOGLE_PLACE_ID de las variables de entorno.
func NewReviewsCacheFromEnv(ttl time.Duration) (*ReviewsCache, error) {
	apiKey := os.Getenv("GOOGLE_PLACES_API_KEY")
	placeID := os.Getenv("GOOGLE_PLACE_ID")
	if apiKey == "" || placeID == "" {
		return nil, fmt.Errorf("faltan GOOGLE_PLACES_API_KEY y/o GOOGLE_PLACE_ID en las variables de entorno")
	}
	return NewReviewsCache(apiKey, placeID, ttl), nil
}

// Get regresa los datos cacheados si siguen vigentes; si expiraron (o es la
// primera vez), intenta refrescar desde Google. Si la llamada falla, regresa
// el dato cacheado anterior (aunque esté vencido) en vez de dejar la sección
// vacía; si nunca hubo un fetch exitoso, regresa nil (y el frontend cae solo
// en sus reseñas de ejemplo).
func (c *ReviewsCache) Get(ctx context.Context) *GoogleReviewsData {
	c.mu.RLock()
	fresh := c.data != nil && time.Since(c.fetchedAt) < c.ttl
	current := c.data
	c.mu.RUnlock()

	if fresh {
		return current
	}

	fetched, err := c.fetch(ctx)
	if err != nil {
		// Log del error para que quede visible en el servidor; no truena la
		// página, solo se queda con el dato anterior (o nil).
		fmt.Printf("[google_reviews] error al refrescar reseñas: %v\n", err)
		return current
	}

	c.mu.Lock()
	c.data = fetched
	c.fetchedAt = time.Now()
	c.mu.Unlock()

	return fetched
}

// StartBackgroundRefresh lanza una goroutine que refresca el cache cada
// interval, para que la primera visita del día no tenga que esperar la
// llamada a Google. Llama esto una vez al arrancar el servidor.
func (c *ReviewsCache) StartBackgroundRefresh(interval time.Duration) {
	go func() {
		for {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			c.Get(ctx)
			cancel()
			time.Sleep(interval)
		}
	}()
}

func (c *ReviewsCache) fetch(ctx context.Context) (*GoogleReviewsData, error) {
	url := fmt.Sprintf("https://places.googleapis.com/v1/places/%s", c.placeID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Goog-Api-Key", c.apiKey)
	req.Header.Set("X-Goog-FieldMask", "rating,userRatingCount,googleMapsUri,reviews")
	req.Header.Set("Accept-Language", "es") // para que relativePublishTimeDescription venga en español

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request a Places API falló: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Places API regresó %d: %s", resp.StatusCode, string(body))
	}

	var raw placesAPIResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("no se pudo parsear la respuesta de Places API: %w", err)
	}

	data := &GoogleReviewsData{
		Rating:     raw.Rating,
		Count:      raw.UserRatingCount,
		ProfileURL: raw.GoogleMapsURI,
		Reviews:    make([]GoogleReview, 0, len(raw.Reviews)),
	}

	for _, r := range raw.Reviews {
		data.Reviews = append(data.Reviews, GoogleReview{
			Name:   r.AuthorAttribution.DisplayName,
			Date:   r.RelativePublishTimeDesc,
			Rating: r.Rating,
			Text:   r.Text.Text,
		})
	}

	return data, nil
}

// ---------- Helper para inyectar en la plantilla ----------

// ToTemplateJS serializa el dato a JSON y lo regresa como template.JS,
// listo para usarse como {{.GoogleReviewsJSON}} dentro de
// <script id="avante-reviews-data">{{.GoogleReviewsJSON}}</script>.
//
// Usar template.JS (en vez de un string normal) es importante: le dice a
// html/template que este contenido ya es JS/JSON válido y no debe
// escaparlo de más, lo cual rompería las comillas del JSON.
//
// Si data es nil (no hay reseñas reales todavía, o falló el fetch inicial),
// regresa un objeto vacío -> el JS del frontend detecta que no hay
// "reviews" válidas y cae automáticamente en sus reseñas de ejemplo.
func ToTemplateJS(data *GoogleReviewsData) template.JS {
	if data == nil || len(data.Reviews) == 0 {
		return template.JS("{}")
	}
	b, err := json.Marshal(data)
	if err != nil {
		return template.JS("{}")
	}
	return template.JS(b)
}
