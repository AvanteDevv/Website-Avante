package db

import "log"

// EnsureProductInvLink agrega a products la columna inv_item_id: el
// artículo del inventario con el que se vincula el producto de la tienda
// (de ahí salen su tipo de armazón, color y mica para el probador virtual).
func EnsureProductInvLink() {
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'inv_item_id'`).Scan(&n); err != nil {
		log.Printf("productos: no se pudo revisar inv_item_id: %v", err)
		return
	}
	if n > 0 {
		return
	}
	if _, err := DB.Exec(`ALTER TABLE products ADD COLUMN inv_item_id BIGINT NULL`); err != nil {
		log.Printf("productos: no se pudo agregar inv_item_id: %v", err)
		return
	}
	log.Println("productos: columna products.inv_item_id agregada")
}
