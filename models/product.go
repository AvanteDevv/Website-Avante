package models

import (
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// Product representa un producto del inventario (armazón u otro
// artículo) mostrado en el panel de admin. Por ahora solo guarda los
// campos básicos que pediste — título, marca, año, modelo e imagen —
// se puede ampliar después con precio, stock, categoría, etc.
type Product struct {
	ID        int64
	Title     string
	Brand     string
	Year      string
	Model     string
	ImageKey  string
	ImageURL  string
	CreatedAt time.Time
}

// GetAllProducts regresa todo el inventario, más recientes primero.
func GetAllProducts() ([]Product, error) {
	rows, err := db.DB.Query(`
		SELECT id, title, brand, year, model, image_key, created_at
		FROM products
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Title, &p.Brand, &p.Year, &p.Model, &p.ImageKey, &p.CreatedAt); err != nil {
			continue
		}
		p.ImageURL = "/media/productos/" + p.ImageKey
		products = append(products, p)
	}
	return products, nil
}

// CreateProduct guarda un producto nuevo y regresa su ID.
func CreateProduct(title, brand, year, model, imageKey string) (int64, error) {
	res, err := db.DB.Exec(`
		INSERT INTO products (title, brand, year, model, image_key, created_at)
		VALUES (?, ?, ?, ?, ?, NOW())
	`, title, brand, year, model, imageKey)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// DeleteProduct borra el producto y regresa su image_key, para que el
// handler pueda limpiar también el archivo en el bucket.
func DeleteProduct(id int64) (string, error) {
	var imageKey string
	if err := db.DB.QueryRow(`SELECT image_key FROM products WHERE id = ?`, id).Scan(&imageKey); err != nil {
		return "", err
	}
	if _, err := db.DB.Exec(`DELETE FROM products WHERE id = ?`, id); err != nil {
		return "", err
	}
	return imageKey, nil
}
