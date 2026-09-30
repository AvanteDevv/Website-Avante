package db

import "log"

// EnsureInventoryTable crea (si no existe) la tabla del inventario
// (Admin → Inventario). Se llama una vez al arrancar, junto a las demás
// Ensure…Table. No toca datos si la tabla ya existe.
//
//	clave            identificador del producto (ej. LNT-GSS-FLOW:
//	                 lentes · Guess · modelo Flow). Única.
//	cantidad         lo que entró (se captura a mano)
//	cantidad_actual  lo que queda; irá bajando con cada venta del
//	                 Punto de venta (models.DecreaseInventoryStock)
func EnsureInventoryTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inventory_items (
		id              BIGINT AUTO_INCREMENT PRIMARY KEY,
		clave           VARCHAR(60)   NULL,
		descripcion     VARCHAR(200)  NOT NULL,
		precio_costo    DECIMAL(12,2) NOT NULL DEFAULT 0,
		precio_venta    DECIMAL(12,2) NOT NULL DEFAULT 0,
		cantidad        INT           NOT NULL DEFAULT 0,
		cantidad_actual INT           NOT NULL DEFAULT 0,
		created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY uq_inventory_clave (clave),
		INDEX idx_inventory_desc (descripcion)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("inventario: no se pudo crear la tabla inventory_items: %v", err)
		return
	}
	ensureInventoryClave()
	log.Println("inventario: tabla inventory_items lista")
}

// ensureInventoryClave agrega la columna "clave" (ej. LNT-GSS-FLOW) a una
// tabla creada antes de que existiera. MySQL no tiene "ADD COLUMN IF NOT
// EXISTS", así que primero se revisa information_schema.
func ensureInventoryClave() {
	var n int
	err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'clave'`).Scan(&n)
	if err != nil {
		log.Printf("inventario: no se pudo revisar la columna clave: %v", err)
		return
	}
	if n > 0 {
		return
	}
	if _, err := DB.Exec("ALTER TABLE inventory_items ADD COLUMN clave VARCHAR(60) NULL AFTER id, ADD UNIQUE KEY uq_inventory_clave (clave)"); err != nil {
		log.Printf("inventario: no se pudo agregar la columna clave: %v", err)
		return
	}
	log.Println("inventario: columna clave agregada")
}
