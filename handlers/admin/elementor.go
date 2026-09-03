package admin

import (
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"path/filepath"
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
// mismo criterio que products.go para productos.html). Por ahora solo
// tiene el carrusel de marcas — cuando se conecte el resto del panel
// (textos del hero, video, FAQ, redes sociales), esas funciones
// (ej. SaveElementorSettings) van aquí también, en vez de en un
// archivo aparte.
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
