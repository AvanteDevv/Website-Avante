package models

import (
	"database/sql"
	"encoding/json"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// Product representa un producto del catálogo. Separa dos cosas: el
// LOGO de la marca (una sola imagen, logo_key en la tabla products) y
// las FOTOS del producto en sí (una o varias, tabla product_images) —
// las fotos son las que se muestran en el carrusel de la tienda
// pública; el logo solo se usa dentro del panel de admin.
type Product struct {
	ID          int64
	Title       string
	Brand       string
	Year        string
	Model       string
	Price       float64
	OldPrice    float64   // 0 = sin precio anterior
	PromoEndsAt time.Time // zero value = sin fecha de fin (promoción sin vencimiento)
	Icon        string    // "sun" | "square" | "round"
	Badge       string    // opcional, ej. "Nuevo" — si va vacío, la tienda
	// pública puede autocompletarlo (ver buildStoreProductsJSON en main.go)
	Description string
	LogoKey     string
	LogoURL     string
	Images      []string // URLs de las fotos del producto, en orden
	CreatedAt   time.Time
}

// ImagesJSON regresa las URLs de las fotos como JSON (para meterlas en un
// data-* attribute del template admin, ej. data-images='{{.ImagesJSON}}',
// y leerlas del lado del JS con JSON.parse(el.dataset.images)).
func (p Product) ImagesJSON() string {
	b, err := json.Marshal(p.Images)
	if err != nil {
		return "[]"
	}
	return string(b)
}

// PromoEndsAtValue regresa la fecha de fin formateada para precargar un
// <input type="datetime-local"> al editar (formato "2006-01-02T15:04"),
// o "" si el producto no tiene fecha de fin configurada.
func (p Product) PromoEndsAtValue() string {
	if p.PromoEndsAt.IsZero() {
		return ""
	}
	return p.PromoEndsAt.Format("2006-01-02T15:04")
}

// BrandLogo es una marca ya usada en el catálogo junto con su logo más
// reciente — se usa para el selector "usar un logo existente" del
// admin, así no hay que resubir el mismo logo cada vez que agregas
// otro producto de una marca que ya tenías.
type BrandLogo struct {
	Brand   string `json:"brand"`
	LogoKey string `json:"logoKey"`
	LogoURL string `json:"logoUrl"`
}

// GetBrandLogos regresa una marca por cada valor distinto de "brand" en
// el catálogo, con el logo_key MÁS RECIENTE que se le haya subido
// (por si en algún momento subiste logos distintos para la misma
// marca en productos diferentes).
func GetBrandLogos() ([]BrandLogo, error) {
	rows, err := db.DB.Query(`
		SELECT p.brand, p.logo_key
		FROM products p
		INNER JOIN (
			SELECT brand, MAX(created_at) AS max_created
			FROM products
			WHERE logo_key <> ''
			GROUP BY brand
		) latest ON p.brand = latest.brand AND p.created_at = latest.max_created
		ORDER BY p.brand ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var brands []BrandLogo
	for rows.Next() {
		var b BrandLogo
		if err := rows.Scan(&b.Brand, &b.LogoKey); err != nil {
			continue
		}
		b.LogoURL = "/media/logos/" + b.LogoKey
		brands = append(brands, b)
	}
	return brands, nil
}

// LogoKeyExists confirma que una key sí pertenece a algún producto ya
// guardado — se usa antes de copiar un logo "existente" para no dejar
// que el form mande cualquier ruta arbitraria del bucket.
func LogoKeyExists(logoKey string) (bool, error) {
	var count int
	err := db.DB.QueryRow(`SELECT COUNT(*) FROM products WHERE logo_key = ?`, logoKey).Scan(&count)
	return count > 0, err
}

// HasPromo indica si el producto tiene precio anterior configurado
// (esa es la señal de que está "en promoción", igual que en la
// tienda pública).
func (p Product) HasPromo() bool {
	return p.OldPrice > 0
}

// PromoExpired indica si la promoción ya venció (tiene fecha de fin
// configurada y esa fecha ya pasó). Si no tiene fecha de fin, la
// promoción se considera sin vencimiento (nunca "vencida").
func (p Product) PromoExpired() bool {
	return !p.PromoEndsAt.IsZero() && time.Now().After(p.PromoEndsAt)
}

// GetAllProducts regresa todo el catálogo, más recientes primero, con
// sus fotos ya cargadas (evita N+1: una query para productos, otra
// para TODAS las fotos, y se juntan en memoria).
func GetAllProducts() ([]Product, error) {
	rows, err := db.DB.Query(`
		SELECT id, title, brand, year, model, price, old_price, promo_ends_at, icon, badge, description, logo_key, created_at
		FROM products
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []Product
	byID := make(map[int64]*Product)
	for rows.Next() {
		var p Product
		var promoEndsAt sql.NullTime
		if err := rows.Scan(&p.ID, &p.Title, &p.Brand, &p.Year, &p.Model, &p.Price, &p.OldPrice, &promoEndsAt, &p.Icon, &p.Badge, &p.Description, &p.LogoKey, &p.CreatedAt); err != nil {
			continue
		}
		if promoEndsAt.Valid {
			p.PromoEndsAt = promoEndsAt.Time
		}
		p.LogoURL = "/media/logos/" + p.LogoKey
		products = append(products, p)
	}
	for i := range products {
		byID[products[i].ID] = &products[i]
	}

	if len(products) == 0 {
		return products, nil
	}

	imgRows, err := db.DB.Query(`
		SELECT product_id, image_key FROM product_images
		WHERE product_id IN (SELECT id FROM products)
		ORDER BY product_id, position ASC
	`)
	if err == nil {
		defer imgRows.Close()
		for imgRows.Next() {
			var productID int64
			var imageKey string
			if err := imgRows.Scan(&productID, &imageKey); err != nil {
				continue
			}
			if p, ok := byID[productID]; ok {
				p.Images = append(p.Images, "/media/productos/"+imageKey)
			}
		}
	}

	return products, nil
}

// CreateProduct guarda un producto nuevo (con su logo y sus fotos) y
// regresa su ID. imageKeys debe traer al menos una foto. promoEndsAt
// puede venir con su zero value (time.Time{}) si no aplica.
func CreateProduct(title, brand, year, model string, price, oldPrice float64, promoEndsAt time.Time, icon, badge, description, logoKey string, imageKeys []string) (int64, error) {
	var promoEndsAtParam interface{}
	if !promoEndsAt.IsZero() {
		promoEndsAtParam = promoEndsAt
	}

	res, err := db.DB.Exec(`
		INSERT INTO products (title, brand, year, model, price, old_price, promo_ends_at, icon, badge, description, logo_key, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
	`, title, brand, year, model, price, oldPrice, promoEndsAtParam, icon, badge, description, logoKey)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}

	for i, key := range imageKeys {
		if _, err := db.DB.Exec(`
			INSERT INTO product_images (product_id, image_key, position) VALUES (?, ?, ?)
		`, id, key, i); err != nil {
			return id, err
		}
	}

	return id, nil
}

// GetProductLogoKey regresa el logo_key actual de un producto (se usa
// al editar sin subir logo nuevo, y para borrar el viejo del bucket
// cuando sí se sube uno).
func GetProductLogoKey(id int64) (string, error) {
	var logoKey string
	err := db.DB.QueryRow(`SELECT logo_key FROM products WHERE id = ?`, id).Scan(&logoKey)
	return logoKey, err
}

// GetProductImageKeys regresa los image_key de las fotos actuales de un
// producto en orden — se usa al editar (para poder borrarlas del bucket
// si el admin sube fotos nuevas que las reemplazan).
func GetProductImageKeys(id int64) ([]string, error) {
	rows, err := db.DB.Query(`SELECT image_key FROM product_images WHERE product_id = ? ORDER BY position ASC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err == nil {
			keys = append(keys, k)
		}
	}
	return keys, nil
}

// UpdateProduct edita un producto existente.
//   - Si newLogoKey viene vacío, conserva el logo que ya tenía.
//   - Si newImageKeys viene nil, conserva las fotos que ya tenía. Si
//     viene con contenido, REEMPLAZA todas las fotos anteriores por
//     esas (mismo criterio simple que ya usa el logo: "si subes algo
//     nuevo, sustituye a lo anterior").
//   - promoEndsAt con su zero value borra la fecha de fin (la
//     promoción se queda sin vencimiento); con un valor la actualiza.
func UpdateProduct(id int64, title, brand, year, model string, price, oldPrice float64, promoEndsAt time.Time, icon, badge, description, newLogoKey string, newImageKeys []string) error {
	var promoEndsAtParam interface{}
	if !promoEndsAt.IsZero() {
		promoEndsAtParam = promoEndsAt
	}

	if newLogoKey != "" {
		if _, err := db.DB.Exec(`
			UPDATE products SET title=?, brand=?, year=?, model=?, price=?, old_price=?, promo_ends_at=?, icon=?, badge=?, description=?, logo_key=?
			WHERE id=?
		`, title, brand, year, model, price, oldPrice, promoEndsAtParam, icon, badge, description, newLogoKey, id); err != nil {
			return err
		}
	} else {
		if _, err := db.DB.Exec(`
			UPDATE products SET title=?, brand=?, year=?, model=?, price=?, old_price=?, promo_ends_at=?, icon=?, badge=?, description=?
			WHERE id=?
		`, title, brand, year, model, price, oldPrice, promoEndsAtParam, icon, badge, description, id); err != nil {
			return err
		}
	}

	if newImageKeys != nil {
		if _, err := db.DB.Exec(`DELETE FROM product_images WHERE product_id = ?`, id); err != nil {
			return err
		}
		for i, key := range newImageKeys {
			if _, err := db.DB.Exec(`
				INSERT INTO product_images (product_id, image_key, position) VALUES (?, ?, ?)
			`, id, key, i); err != nil {
				return err
			}
		}
	}

	return nil
}

// DeleteProduct borra el producto (las filas de product_images se van
// solas por el ON DELETE CASCADE) y regresa por separado el logo_key
// (vive en logos/) y las image_key de las fotos (viven en
// productos/<carpeta>/) que hay que limpiar del bucket — van
// separadas porque cada una necesita un prefijo distinto al borrar.
func DeleteProduct(id int64) (logoKey string, imageKeys []string, err error) {
	if err = db.DB.QueryRow(`SELECT logo_key FROM products WHERE id = ?`, id).Scan(&logoKey); err != nil {
		return "", nil, err
	}

	imageKeys, _ = GetProductImageKeys(id)

	if _, err = db.DB.Exec(`DELETE FROM products WHERE id = ?`, id); err != nil {
		return "", nil, err
	}

	return logoKey, imageKeys, nil
}
