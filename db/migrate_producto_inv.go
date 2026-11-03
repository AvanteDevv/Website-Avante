package db

import "log"

// EnsureProductInvLink agrega a products la columna inv_item_id: el
// artículo del inventario con el que se vincula el producto de la tienda
// (de ahí salen su tipo de armazón, color y mica para el probador virtual).
func EnsureProductInvLink() {
	ensureProductCol("tipo_armazon", "VARCHAR(60) NOT NULL DEFAULT ''")
	ensureProductCol("materiales", "VARCHAR(160) NOT NULL DEFAULT ''")
	ensureProductCol("mica_tipo", "VARCHAR(12) NOT NULL DEFAULT ''")
	// Qué fotos del artículo del inventario se aprueban (o no) para el
	// producto. Sin fila = pendiente de revisar (no sale en la tienda).
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS product_inv_fotos (
		product_id BIGINT NOT NULL,
		inv_foto_id BIGINT NOT NULL,
		aprobada TINYINT(1) NOT NULL DEFAULT 0,
		PRIMARY KEY (product_id, inv_foto_id)
	)`); err != nil {
		log.Printf("productos: no se pudo crear product_inv_fotos: %v", err)
	}
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

// ensureProductCol agrega una columna a products si todavía no existe.
func ensureProductCol(name, ddl string) {
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = ?`, name).Scan(&n); err != nil || n > 0 {
		return
	}
	if _, err := DB.Exec("ALTER TABLE products ADD COLUMN " + name + " " + ddl); err != nil {
		log.Printf("productos: no se pudo agregar %s: %v", name, err)
		return
	}
	log.Printf("productos: columna products.%s agregada", name)
}
