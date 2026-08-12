package models

import (
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
	ID       int64
	Title    string
	Brand    string
	Year     string
	Model    string
	Price    float64
	OldPrice float64 // 0 = sin precio anterior
	Icon     string  // "sun" | "square" | "round"
	Badge    string  // opcional, ej. "Nuevo" — si va vacío, la tienda
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

// GetAllProducts regresa todo el catálogo, más recientes primero, con
// sus fotos ya cargadas (evita N+1: una query para productos, otra
// para TODAS las fotos, y se juntan en memoria).
func GetAllProducts() ([]Product, error) {
	rows, err := db.DB.Query(`
		SELECT id, title, brand, year, model, price, old_price, icon, badge, description, logo_key, created_at
		FROM products
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []Product
	order := make([]int64, 0)
	byID := make(map[int64]*Product)
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Title, &p.Brand, &p.Year, &p.Model, &p.Price, &p.OldPrice, &p.Icon, &p.Badge, &p.Description, &p.LogoKey, &p.CreatedAt); err != nil {
			continue
		}
		p.LogoURL = "/media/productos/" + p.LogoKey
		products = append(products, p)
		order = append(order, p.ID)
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
// regresa su ID. imageKeys debe traer al menos una foto.
func CreateProduct(title, brand, year, model string, price, oldPrice float64, icon, badge, description, logoKey string, imageKeys []string) (int64, error) {
	res, err := db.DB.Exec(`
		INSERT INTO products (title, brand, year, model, price, old_price, icon, badge, description, logo_key, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
	`, title, brand, year, model, price, oldPrice, icon, badge, description, logoKey)
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
func UpdateProduct(id int64, title, brand, year, model string, price, oldPrice float64, icon, badge, description, newLogoKey string, newImageKeys []string) error {
	if newLogoKey != "" {
		if _, err := db.DB.Exec(`
			UPDATE products SET title=?, brand=?, year=?, model=?, price=?, old_price=?, icon=?, badge=?, description=?, logo_key=?
			WHERE id=?
		`, title, brand, year, model, price, oldPrice, icon, badge, description, newLogoKey, id); err != nil {
			return err
		}
	} else {
		if _, err := db.DB.Exec(`
			UPDATE products SET title=?, brand=?, year=?, model=?, price=?, old_price=?, icon=?, badge=?, description=?
			WHERE id=?
		`, title, brand, year, model, price, oldPrice, icon, badge, description, id); err != nil {
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
// solas por el ON DELETE CASCADE) y regresa TODAS las image_key que
// hay que limpiar del bucket: el logo y cada una de las fotos.
func DeleteProduct(id int64) ([]string, error) {
	var logoKey string
	if err := db.DB.QueryRow(`SELECT logo_key FROM products WHERE id = ?`, id).Scan(&logoKey); err != nil {
		return nil, err
	}

	imageKeys, _ := GetProductImageKeys(id)

	if _, err := db.DB.Exec(`DELETE FROM products WHERE id = ?`, id); err != nil {
		return nil, err
	}

	keys := append([]string{logoKey}, imageKeys...)
	return keys, nil
}
