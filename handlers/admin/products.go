package admin

import (
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

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// ⚠️ Este archivo usa slugify(), que YA está definida en
// blog_taxonomy.go (mismo paquete admin) — no la vuelvas a declarar
// aquí o el compilador se va a quejar de "slugify redeclared".

// Products — GET /admin/productos
func Products(c *gin.Context) {
	products, err := models.GetAllProducts()
	if err != nil {
		c.HTML(http.StatusOK, "productos.html", gin.H{
			"ActivePage":     "admin-productos",
			"ProductosError": "No se pudieron cargar los productos en este momento.",
		})
		return
	}

	c.HTML(http.StatusOK, "productos.html", gin.H{
		"ActivePage": "admin-productos",
		"Productos":  products,
		"Total":      len(products),
	})
}

// ListBrands — GET /api/admin/marcas
// Regresa las marcas ya usadas en el catálogo con su logo más
// reciente, para el selector "usar un logo existente" del form de
// crear/editar producto.
func ListBrands(c *gin.Context) {
	brands, err := models.GetBrandLogos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar las marcas."})
		return
	}
	c.JSON(http.StatusOK, brands)
}

var allowedProductImageExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}

// allowedProductIcons son las mismas 3 formas de lente que ya usa la
// tienda pública (index/eccomerce) para el ícono de respaldo de cada
// tarjeta — no se puede guardar cualquier valor aquí.
var allowedProductIcons = map[string]bool{"sun": true, "square": true, "round": true}

// productFolder arma el nombre de la subcarpeta del bucket para UN
// producto, a partir de su título (ej. "Lentes Plex" -> "lentes-plex"),
// con un sufijo corto para que dos productos con el mismo nombre no
// terminen compartiendo la misma carpeta. Todo lo de ese producto —
// logo y fotos — se sube bajo productos/<esta-carpeta>/.
func productFolder(title string) string {
	slug := slugify(title)
	if slug == "" {
		slug = "producto"
	}
	suffix := strconv.FormatInt(time.Now().UnixNano()%0xFFFFFF, 36)
	return slug + "-" + suffix
}

// folderOf regresa la subcarpeta de una key ya guardada (todo lo que
// va antes de la última "/"), o "" si la key es "plana" — de un
// producto creado antes de que existieran las subcarpetas.
func folderOf(key string) string {
	i := strings.LastIndex(key, "/")
	if i == -1 {
		return ""
	}
	return key[:i]
}

// uploadOneImage sube un solo archivo (ya recibido como *multipart.FileHeader)
// al bucket bajo productos/<folder>/ (o productos/ a secas si folder
// viene vacío) y regresa la key relativa generada (ej.
// "lentes-plex-a3f9k2/1786563665512066600.jpg").
func uploadOneImage(c *gin.Context, fh *multipart.FileHeader, folder string) (string, error) {
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
	key := filename
	if folder != "" {
		key = folder + "/" + filename
	}
	if err := storage.UploadObject(c.Request.Context(), "productos/"+key, file, fh.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir la imagen al bucket")
	}
	return key, nil
}

// uploadProductLogo sube el archivo del campo "logo" (uno solo) a
// logos/ — carpeta aparte de productos/, porque el logo se reutiliza
// entre varios productos y no es exclusivo de uno solo.
func uploadProductLogo(c *gin.Context, fh *multipart.FileHeader) (string, error) {
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
	if err := storage.UploadObject(c.Request.Context(), "logos/"+filename, file, fh.Size, contentType); err != nil {
		return "", fmt.Errorf("no se pudo subir el logo al bucket")
	}
	return filename, nil
}

// resolveLogoKey decide de dónde sale el logo del producto:
//   - Si viene "existing_logo_key" en el form (el admin eligió reusar
//     el logo de una marca que ya tenía), se COPIA ese archivo del
//     bucket (dentro de logos/) a una key nueva — nunca se comparte la
//     misma key entre dos productos, porque borrar uno se llevaría el
//     logo del otro. Antes de copiar se valida que esa key sí
//     pertenezca a algún producto real (no se confía en cualquier
//     ruta que mande el form).
//   - Si no, sube el archivo del campo "logo" normal.
//   - requireOne=true exige que venga una de las dos cosas (crear);
//     en false, si no viene ninguna regresa "" sin error (editar sin
//     tocar el logo).
func resolveLogoKey(c *gin.Context, requireOne bool) (string, error) {
	existingKey := strings.TrimSpace(c.PostForm("existing_logo_key"))
	if existingKey != "" {
		ok, err := models.LogoKeyExists(existingKey)
		if err != nil || !ok {
			return "", fmt.Errorf("el logo que elegiste ya no existe, intenta de nuevo")
		}
		ext := filepath.Ext(existingKey)
		newKey := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		if err := storage.CopyObject(c.Request.Context(), "logos/"+existingKey, "logos/"+newKey); err != nil {
			return "", fmt.Errorf("no se pudo copiar el logo elegido")
		}
		return newKey, nil
	}

	if _, fh, err := c.Request.FormFile("logo"); err == nil {
		return uploadProductLogo(c, fh)
	}

	if requireOne {
		return "", fmt.Errorf("sube el logo de la marca o elige uno existente")
	}
	return "", nil
}

// uploadProductPhotos sube todos los archivos del campo "images" (uno o
// varios) y regresa sus keys generadas, en el mismo orden en que se
// seleccionaron.
func uploadProductPhotos(c *gin.Context, folder string) ([]string, error) {
	form, err := c.MultipartForm()
	if err != nil {
		return nil, fmt.Errorf("no se pudieron leer las fotos del producto")
	}
	files := form.File["images"]
	if len(files) == 0 {
		return nil, nil
	}

	keys := make([]string, 0, len(files))
	for _, fh := range files {
		key, err := uploadOneImage(c, fh, folder)
		if err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, nil
}

// parseProductForm lee y valida los campos comunes a crear/editar.
// promoEndsAt puede venir con su zero value si el campo se dejó vacío
// (promoción sin fecha de fin) — usa dtLayout/hermosilloLoc, ya
// definidos en ads.go (mismo paquete admin).
func parseProductForm(c *gin.Context) (title, brand, year, model, icon, badge, description string, price, oldPrice float64, promoEndsAt time.Time, err error) {
	title = strings.TrimSpace(c.PostForm("title"))
	brand = strings.TrimSpace(c.PostForm("brand"))
	year = strings.TrimSpace(c.PostForm("year"))
	model = strings.TrimSpace(c.PostForm("model"))
	icon = c.PostForm("icon")
	badge = strings.TrimSpace(c.PostForm("badge"))
	description = strings.TrimSpace(c.PostForm("description"))

	if title == "" {
		err = fmt.Errorf("el título es obligatorio")
		return
	}
	if brand == "" {
		err = fmt.Errorf("la marca es obligatoria")
		return
	}
	if !allowedProductIcons[icon] {
		err = fmt.Errorf("elige una forma de lente válida")
		return
	}

	priceStr := strings.TrimSpace(c.PostForm("price"))
	price, perr := strconv.ParseFloat(priceStr, 64)
	if perr != nil || price < 0 {
		err = fmt.Errorf("ingresa un precio válido")
		return
	}

	oldPriceStr := strings.TrimSpace(c.PostForm("old_price"))
	if oldPriceStr != "" {
		oldPrice, err = strconv.ParseFloat(oldPriceStr, 64)
		if err != nil || oldPrice < 0 {
			err = fmt.Errorf("el precio anterior no es válido")
			return
		}
	}

	promoEndsAtStr := strings.TrimSpace(c.PostForm("promo_ends_at"))
	if promoEndsAtStr != "" {
		promoEndsAt, err = time.ParseInLocation(dtLayout, promoEndsAtStr, hermosilloLoc)
		if err != nil {
			err = fmt.Errorf("la fecha de fin de la promoción no es válida")
			return
		}
	}
	err = nil
	return
}

// CreateProduct — POST /api/admin/productos (multipart/form-data)
// Campos: title, brand, year, model, price, old_price, promo_ends_at
// (opcional), icon, badge, description, logo (1 archivo), images (1 o
// varios archivos).
func CreateProduct(c *gin.Context) {
	title, brand, year, model, icon, badge, description, price, oldPrice, promoEndsAt, err := parseProductForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Todo lo de este producto (logo + fotos) se sube bajo la misma
	// subcarpeta, para que quede organizado en el bucket.
	folder := productFolder(title)

	logoKey, err := resolveLogoKey(c, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imageKeys, err := uploadProductPhotos(c, folder)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(imageKeys) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sube al menos una foto del producto."})
		return
	}

	id, err := models.CreateProduct(title, brand, year, model, price, oldPrice, promoEndsAt, icon, badge, description, logoKey, imageKeys)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el producto."})
		return
	}

	imageURLs := make([]string, len(imageKeys))
	for i, k := range imageKeys {
		imageURLs[i] = "/media/productos/" + k
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":        id,
		"logoUrl":   "/media/logos/" + logoKey,
		"imageUrls": imageURLs,
	})
}

// UpdateProduct — PUT /api/admin/productos/:id (multipart/form-data)
// "logo" e "images" son opcionales: si no mandas archivos nuevos, se
// conserva lo que ya tenía el producto.
func UpdateProduct(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de producto inválido."})
		return
	}

	title, brand, year, model, icon, badge, description, price, oldPrice, promoEndsAt, err := parseProductForm(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// La carpeta del producto se deriva de sus FOTOS (el logo ya no
	// tiene subcarpeta propia — vive plano en logos/). Si no hay
	// ninguna pista de carpeta previa (producto creado antes de este
	// cambio, con keys "planas"), se arma una carpeta nueva a partir
	// del título.
	existingLogoKey, _ := models.GetProductLogoKey(id)
	var folder string
	if keys, _ := models.GetProductImageKeys(id); len(keys) > 0 {
		folder = folderOf(keys[0])
	}
	if folder == "" {
		folder = productFolder(title)
	}

	// Logo opcional al editar: si mandan un archivo nuevo o eligen uno
	// existente, se reemplaza; si no viene ninguno, se conserva el que
	// ya tenía (resolveLogoKey regresa "" sin error en ese caso).
	newLogoKey, err := resolveLogoKey(c, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fotos opcionales al editar: si mandan alguna, se reemplazan TODAS
	// las anteriores por las nuevas (mismo criterio simple que el logo).
	newImageKeys, err := uploadProductPhotos(c, folder)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var oldLogoKey string
	if newLogoKey != "" {
		oldLogoKey = existingLogoKey
	}
	var oldImageKeys []string
	if len(newImageKeys) > 0 {
		oldImageKeys, _ = models.GetProductImageKeys(id)
	}

	if err := models.UpdateProduct(id, title, brand, year, model, price, oldPrice, promoEndsAt, icon, badge, description, newLogoKey, newImageKeys); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar el producto."})
		return
	}

	if newLogoKey != "" && oldLogoKey != "" {
		storage.DeleteObject(c.Request.Context(), "logos/"+oldLogoKey)
	}
	for _, k := range oldImageKeys {
		storage.DeleteObject(c.Request.Context(), "productos/"+k)
	}

	resp := gin.H{"ok": true}
	if newLogoKey != "" {
		resp["logoUrl"] = "/media/logos/" + newLogoKey
	}
	if len(newImageKeys) > 0 {
		imageURLs := make([]string, len(newImageKeys))
		for i, k := range newImageKeys {
			imageURLs[i] = "/media/productos/" + k
		}
		resp["imageUrls"] = imageURLs
	}
	c.JSON(http.StatusOK, resp)
}

// DeleteProduct — DELETE /api/admin/productos/:id
func DeleteProduct(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de producto inválido."})
		return
	}

	logoKey, imageKeys, err := models.DeleteProduct(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado."})
		return
	}

	// Borrado del bucket best-effort: si falla, no tumbamos la
	// respuesta — el registro en BD ya se fue. El logo vive en logos/
	// y las fotos en productos/, cada una con su prefijo.
	if logoKey != "" {
		storage.DeleteObject(c.Request.Context(), "logos/"+logoKey)
	}
	for _, k := range imageKeys {
		if k != "" {
			storage.DeleteObject(c.Request.Context(), "productos/"+k)
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
