package models

import (
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// Product representa un producto del catálogo mostrado en el panel de
// admin Y en la tienda pública (index/eccomerce). Price/OldPrice/Icon/
// Badge/Description se agregaron para que la tarjeta y el detalle de la
// tienda pública tengan todo lo que necesitan mostrar (precio, precio
// tachado si hay descuento, la forma de lente para el ícono de
// respaldo, una insignia opcional, y la descripción larga del detalle).
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
	Description string // opcional, se muestra en el detalle del producto
	ImageKey    string
	ImageURL    string
	CreatedAt   time.Time
}

// GetAllProducts regresa todo el catálogo, más recientes primero.
func GetAllProducts() ([]Product, error) {
	rows, err := db.DB.Query(`
		SELECT id, title, brand, year, model, price, old_price, icon, badge, description, image_key, created_at
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
		if err := rows.Scan(&p.ID, &p.Title, &p.Brand, &p.Year, &p.Model, &p.Price, &p.OldPrice, &p.Icon, &p.Badge, &p.Description, &p.ImageKey, &p.CreatedAt); err != nil {
			continue
		}
		p.ImageURL = "/media/productos/" + p.ImageKey
		products = append(products, p)
	}
	return products, nil
}

// CreateProduct guarda un producto nuevo y regresa su ID.
func CreateProduct(title, brand, year, model string, price, oldPrice float64, icon, badge, description, imageKey string) (int64, error) {
	res, err := db.DB.Exec(`
		INSERT INTO products (title, brand, year, model, price, old_price, icon, badge, description, image_key, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
	`, title, brand, year, model, price, oldPrice, icon, badge, description, imageKey)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// GetProductImageKey regresa el image_key actual de un producto (se usa
// al editar sin subir imagen nueva, y para borrar la vieja del bucket
// cuando sí se sube una).
func GetProductImageKey(id int64) (string, error) {
	var imageKey string
	err := db.DB.QueryRow(`SELECT image_key FROM products WHERE id = ?`, id).Scan(&imageKey)
	return imageKey, err
}

// UpdateProduct edita un producto existente. Si newImageKey viene vacío,
// conserva el image_key que ya tenía (edición sin cambiar la imagen).
func UpdateProduct(id int64, title, brand, year, model string, price, oldPrice float64, icon, badge, description, newImageKey string) error {
	if newImageKey != "" {
		_, err := db.DB.Exec(`
			UPDATE products SET title=?, brand=?, year=?, model=?, price=?, old_price=?, icon=?, badge=?, description=?, image_key=?
			WHERE id=?
		`, title, brand, year, model, price, oldPrice, icon, badge, description, newImageKey, id)
		return err
	}
	_, err := db.DB.Exec(`
		UPDATE products SET title=?, brand=?, year=?, model=?, price=?, old_price=?, icon=?, badge=?, description=?
		WHERE id=?
	`, title, brand, year, model, price, oldPrice, icon, badge, description, id)
	return err
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
