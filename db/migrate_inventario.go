package db

import "log"

// EnsureInventoryTable crea (si no existe) la tabla del inventario
// (Admin → Inventario). Se llama una vez al arrancar, junto a las demás
// Ensure…Table. No toca datos si la tabla ya existe.
//
//	cantidad         lo que entró (se captura a mano)
//	cantidad_actual  lo que queda; irá bajando con cada venta del
//	                 Punto de venta (models.DecreaseInventoryStock)
func EnsureInventoryTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inventory_items (
		id              BIGINT AUTO_INCREMENT PRIMARY KEY,
		descripcion     VARCHAR(200)  NOT NULL,
		precio_costo    DECIMAL(12,2) NOT NULL DEFAULT 0,
		precio_venta    DECIMAL(12,2) NOT NULL DEFAULT 0,
		cantidad        INT           NOT NULL DEFAULT 0,
		cantidad_actual INT           NOT NULL DEFAULT 0,
		created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		INDEX idx_inventory_desc (descripcion)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("inventario: no se pudo crear la tabla inventory_items: %v", err)
		return
	}
	log.Println("inventario: tabla inventory_items lista")
}
