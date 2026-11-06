package db

import "log"

// EnsureEntregaTables prepara las formas de entrega de la tienda en línea:
//   - ecommerce_settings (una sola fila, id=1): qué formas de entrega están
//     activas. "Recoger en sucursal" siempre está; "Envío a domicilio" se
//     prende y apaga desde Elementor → Ecommerce (empieza apagado).
//   - pagos_clip.entrega / entrega_direccion y orders.entrega /
//     entrega_direccion: cómo se entrega cada compra.
//
// Va después de EnsurePagosClipTable.
func EnsureEntregaTables() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS ecommerce_settings (
		id TINYINT PRIMARY KEY,
		envio_domicilio TINYINT(1) NOT NULL DEFAULT 0,
		actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	)`); err != nil {
		log.Printf("entrega: no se pudo crear ecommerce_settings: %v", err)
		return
	}
	if _, err := DB.Exec(`INSERT IGNORE INTO ecommerce_settings (id, envio_domicilio) VALUES (1, 0)`); err != nil {
		log.Printf("entrega: no se pudo crear la fila de ecommerce_settings: %v", err)
	}
	ensureEntregaCol("pagos_clip", "entrega", "VARCHAR(12) NOT NULL DEFAULT 'sucursal'")
	ensureEntregaCol("pagos_clip", "entrega_direccion", "TEXT NULL")
	ensureEntregaCol("orders", "entrega", "VARCHAR(12) NOT NULL DEFAULT ''")
	ensureEntregaCol("orders", "entrega_direccion", "TEXT NULL")
}

func ensureEntregaCol(table, column, def string) {
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, table, column).Scan(&n); err != nil || n > 0 {
		return
	}
	if _, err := DB.Exec("ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + def); err != nil {
		log.Printf("entrega: no se pudo agregar %s.%s: %v", table, column, err)
		return
	}
	log.Printf("entrega: columna %s.%s agregada", table, column)
}
