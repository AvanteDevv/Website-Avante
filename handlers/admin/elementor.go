package admin

import (
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/storage"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que
// coincidan con el nombre del módulo en tu go.mod.
//
// Este archivo es el handler de la página Elementor (handlers/admin/elementor.go,
// mismo criterio que products.go para productos.html): carrusel de
// marcas, textos/botones/redes/FAQ del Hero, video del Hero y los
// toggles de visibilidad de navbar/secciones. La persistencia vive en
// models/elementor_settings.go (site_settings + faq_items — lee ese
// archivo para el esquema de las tablas nuevas que necesita crear).
//
// ⚠️ Este archivo reusa allowedProductImageExt, ya definida en
// products.go (mismo paquete admin) — no la vuelvas a declarar aquí.

// carouselOrderItem refleja cada entrada de "carrusel_orden" que manda
// elementor.js (JSON.stringify de la lista carouselItems, en orden):
//
//	{"tipo":"nuevo"}                          -> el siguiente archivo de carrusel_nuevo
//	{"tipo":"existente","logoKey":"..."}      -> un logo ya usado en el catálogo
type carouselOrderItem struct {
	Tipo    string `json:"tipo"`
	LogoKey string `json:"logoKey"`
}

// GetCarouselLogos — GET /api/admin/carrusel-marcas
// Regresa la lista actual, para precargar el panel de Elementor al
// abrirlo (si no, cada vez que lo abres se ve vacío aunque ya hayas
// guardado logos antes).
func GetCarouselLogos(c *gin.Context) {
	logos, err := models.GetCarouselLogos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el carrusel."})
		return
	}
	c.JSON(http.StatusOK, logos)
}

// uploadCarouselLogo sube un archivo nuevo del carrusel a
// carrusel-photos/ en el bucket — carpeta propia, separada de logos/
// (la de los productos), porque estos logos no están ligados a ningún
// producto en particular.
func uploadCarouselLogo(c *gin.Context, fh *multipart.FileHeader) (string, error) {
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if !allowedProductImageExt[ext] {
		return "", fmt.Errorf("formato de imagen no soportado (usa JPG, PNG o WEBP)")
	}

	file, err := fh.Open()
	if err != nil {
		return "", fmt.Errorf("no se pudo leer la imagen")
	}
	defer file.Close()

	contentType := fh.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := storage.UploadObject(c.Request.Context(), "carrusel-photos/"+filename, file, fh.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir el logo al bucket")
	}
	return filename, nil
}

// SaveCarouselLogos — POST /api/admin/carrusel-marcas (multipart/form-data)
// Reemplaza TODA la lista del carrusel por la que manda el form.
//
// Campos:
//   - carrusel_orden: JSON (array de carouselOrderItem) con el orden
//     final, mezclando entradas "nuevo" y "existente", en el orden
//     exacto en que deben quedar en la franja.
//   - carrusel_nuevo: los archivos nuevos, EN EL MISMO ORDEN en que
//     aparecen las entradas {"tipo":"nuevo"} dentro de carrusel_orden.
//   - carrusel_nuevo_marca: nombre de marca de esos archivos, mismo
//     índice que carrusel_nuevo (puede venir vacío).
//   - carrusel_existente: logoKeys de marcas ya usadas en el catálogo
//     (products.logo_key) que el admin escogió reutilizar — se validan
//     y se COPIAN a carrusel-photos/ (nunca se comparte la key con el
//     producto original: si luego se borra ese producto, no se
//     llevaría también el logo del carrusel — mismo criterio que
//     resolveLogoKey en products.go).
func SaveCarouselLogos(c *gin.Context) {
	ordenRaw := c.PostForm("carrusel_orden")
	var orden []carouselOrderItem
	if ordenRaw != "" {
		if err := json.Unmarshal([]byte(ordenRaw), &orden); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El orden del carrusel llegó mal formado."})
			return
		}
	}

	form, _ := c.MultipartForm()
	var newFiles []*multipart.FileHeader
	var newBrands []string
	if form != nil {
		newFiles = form.File["carrusel_nuevo"]
		newBrands = form.Value["carrusel_nuevo_marca"]
	}
	existingKeysForm := c.PostFormArray("carrusel_existente")

	final := make([]models.CarouselLogo, 0, len(orden))
	newIdx, existingIdx := 0, 0

	for _, item := range orden {
		switch item.Tipo {
		case "nuevo":
			if newIdx >= len(newFiles) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Faltan archivos nuevos del carrusel."})
				return
			}
			fh := newFiles[newIdx]
			brand := ""
			if newIdx < len(newBrands) {
				brand = strings.TrimSpace(newBrands[newIdx])
			}
			newIdx++

			key, err := uploadCarouselLogo(c, fh)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			final = append(final, models.CarouselLogo{LogoKey: key, Brand: brand})

		case "existente":
			logoKey := item.LogoKey
			if logoKey == "" && existingIdx < len(existingKeysForm) {
				logoKey = existingKeysForm[existingIdx]
			}
			existingIdx++
			if logoKey == "" {
				continue
			}

			ok, err := models.LogoKeyExists(logoKey)
			if err != nil || !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Uno de los logos elegidos ya no existe, intenta de nuevo."})
				return
			}

			ext := filepath.Ext(logoKey)
			newKey := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
			if err := storage.CopyObject(c.Request.Context(), "logos/"+logoKey, "carrusel-photos/"+newKey); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo copiar uno de los logos elegidos."})
				return
			}

			brand, _ := models.BrandOfLogoKey(logoKey)
			final = append(final, models.CarouselLogo{LogoKey: newKey, Brand: brand})

		default:
			continue
		}
	}

	removedKeys, err := models.ReplaceCarouselLogos(final)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el carrusel."})
		return
	}

	// Borrado del bucket best-effort, igual que en products.go: si
	// falla no tumbamos la respuesta, la lista en BD ya quedó bien.
	for _, k := range removedKeys {
		storage.DeleteObject(c.Request.Context(), "carrusel-photos/"+k)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "items": final})
}

// ===========================================================
// Resto de Elementor: textos/botones/redes/FAQ del Hero, video
// del Hero y toggles de visibilidad (navbar / secciones del index).
// ===========================================================

// allowedHeroVideoExt son los formatos de video que acepta el drop del
// Hero (mismo criterio que allowedProductImageExt en products.go, pero
// para video en vez de imagen).
var allowedHeroVideoExt = map[string]bool{
	".webm": true,
	".mp4":  true,
}

// elementorFaqInput refleja cada entrada del JSON que manda el campo
// "faq" de elementor.js (JSON.stringify de collectFaqItems()).
type elementorFaqInput struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// GetElementorSettings — GET /api/admin/elementor
// Regresa el contenido actual del Hero (textos, botones, redes,
// video, FAQ) y los toggles de visibilidad, para precargar el panel
// de Elementor al abrirlo (mismo motivo que GetCarouselLogos: si no,
// cada vez que lo abres se ve vacío aunque ya hayas guardado antes).
func GetElementorSettings(c *gin.Context) {
	settings, err := models.GetElementorSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la configuración de Elementor."})
		return
	}
	c.JSON(http.StatusOK, settings)
}

// uploadHeroVideo sube el video nuevo del Hero a hero/ en el bucket —
// mismo prefijo que ya sirve media_hero.go para /media/hero/:archivo
// (el video de ejemplo del HTML, hero-video.webm, vive ahí).
func uploadHeroVideo(c *gin.Context, fh *multipart.FileHeader) (string, error) {
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if !allowedHeroVideoExt[ext] {
		return "", fmt.Errorf("formato de video no soportado (usa WEBM o MP4)")
	}

	file, err := fh.Open()
	if err != nil {
		return "", fmt.Errorf("no se pudo leer el video")
	}
	defer file.Close()

	contentType := fh.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := storage.UploadObject(c.Request.Context(), "hero/"+filename, file, fh.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir el video al bucket")
	}
	return filename, nil
}

// formBool lee un campo de formulario que elementor.js manda como
// "true"/"false" (String(checkbox.checked) vía FormData.append). Un
// valor ausente o mal formado se toma como false, nunca truena.
func formBool(c *gin.Context, field string) bool {
	v, err := strconv.ParseBool(c.PostForm(field))
	return err == nil && v
}

// SaveElementorSettings — POST /api/admin/elementor (multipart/form-data)
// Guarda TODO el resto del panel Elementor (el carrusel de marcas se
// guarda aparte, con SaveCarouselLogos). Reemplaza siempre el
// contenido completo por el que manda el form — mismo criterio simple
// que el resto del admin.
//
// Campos (todos los que ya manda elementor.js):
//
//	titulo, titulo_destacado, subtitulo
//	btn_principal_texto, btn_principal_link
//	btn_secundario_texto, btn_secundario_link
//	facebook, instagram, whatsapp
//	faq: JSON (array de elementorFaqInput)
//	video: archivo opcional (.webm/.mp4) — si no viene, se conserva el actual
//	ocultar_nav_tienda, ocultar_seccion_promos,
//	ocultar_seccion_anuncios, ocultar_seccion_tienda: "true"/"false"
func SaveElementorSettings(c *gin.Context) {
	faqRaw := c.PostForm("faq")
	var faqInput []elementorFaqInput
	if faqRaw != "" {
		if err := json.Unmarshal([]byte(faqRaw), &faqInput); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Las preguntas frecuentes llegaron mal formadas."})
			return
		}
	}
	faqItems := make([]models.FaqItem, 0, len(faqInput))
	for _, f := range faqInput {
		q := strings.TrimSpace(f.Question)
		a := strings.TrimSpace(f.Answer)
		if q == "" && a == "" {
			continue
		}
		faqItems = append(faqItems, models.FaqItem{Question: q, Answer: a})
	}

	// Video: opcional — solo se sube y se reemplaza si mandaron uno
	// nuevo en este guardado.
	var newVideoKey string
	if fh, err := c.FormFile("video"); err == nil && fh != nil {
		key, err := uploadHeroVideo(c, fh)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		newVideoKey = key
	}

	settings := models.ElementorSettings{
		Titulo:                 c.PostForm("titulo"),
		TituloDestacado:        c.PostForm("titulo_destacado"),
		Subtitulo:              c.PostForm("subtitulo"),
		BtnPrincipalTexto:      c.PostForm("btn_principal_texto"),
		BtnPrincipalLink:       c.PostForm("btn_principal_link"),
		BtnSecundarioTexto:     c.PostForm("btn_secundario_texto"),
		BtnSecundarioLink:      c.PostForm("btn_secundario_link"),
		Facebook:               c.PostForm("facebook"),
		Instagram:              c.PostForm("instagram"),
		Whatsapp:               c.PostForm("whatsapp"),
		OcultarNavTienda:       formBool(c, "ocultar_nav_tienda"),
		OcultarSeccionPromos:   formBool(c, "ocultar_seccion_promos"),
		OcultarSeccionAnuncios: formBool(c, "ocultar_seccion_anuncios"),
		OcultarSeccionTienda:   formBool(c, "ocultar_seccion_tienda"),
	}

	// Si no subieron video nuevo, se conserva el que ya había (para
	// poder borrarlo del bucket abajo solo cuando sí cambió).
	oldVideoKey, err := models.CurrentHeroVideoKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer el video actual del Hero."})
		return
	}

	if err := models.SaveElementorSettings(settings, newVideoKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la configuración de Elementor."})
		return
	}
	if err := models.ReplaceFaqItems(faqItems); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron guardar las preguntas frecuentes."})
		return
	}

	// Borrado del video viejo del bucket, best-effort, solo si sí se
	// reemplazó por uno nuevo (mismo criterio que el borrado de logos
	// en SaveCarouselLogos: si falla no tumbamos la respuesta).
	if newVideoKey != "" && oldVideoKey != "" && oldVideoKey != newVideoKey {
		storage.DeleteObject(c.Request.Context(), "hero/"+oldVideoKey)
	}

	saved, err := models.GetElementorSettings()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "settings": saved})
}