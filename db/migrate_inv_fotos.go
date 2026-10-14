package db

import "log"

// Fotos de los artículos del inventario (productos y servicios). La primera
// (menor "orden") es la principal: la que sale en el punto de venta.
func EnsureInvFotosTable() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inv_fotos (
		id         BIGINT AUTO_INCREMENT PRIMARY KEY,
		item_id    BIGINT NOT NULL,
		object_key VARCHAR(255) NOT NULL,
		ctype      VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
		orden      INT NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		KEY idx_inv_fotos_item (item_id, orden, id)
	) DEFAULT CHARSET=utf8mb4`); err != nil {
		log.Printf("fotos de inventario: %v", err)
		return
	}
	log.Println("fotos de inventario: tabla lista")
}
