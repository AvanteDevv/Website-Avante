package db

import "log"

// EnsurePagosClipTable crea la tabla de pagos de la tienda en línea con
// Clip (un registro por intento de pago; los pedidos se crean hasta que
// Clip confirma el cobro) y la columna orders.pago_ref.
func EnsurePagosClipTable() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS pagos_clip (
		id BIGINT AUTO_INCREMENT PRIMARY KEY,
		ref VARCHAR(40) NOT NULL UNIQUE,
		clip_id VARCHAR(100) NOT NULL DEFAULT '',
		url TEXT,
		monto DECIMAL(12,2) NOT NULL DEFAULT 0,
		estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
		clip_estado VARCHAR(60) NOT NULL DEFAULT '',
		items MEDIUMTEXT,
		cliente_nombre VARCHAR(160) NOT NULL DEFAULT '',
		cliente_email VARCHAR(160) NOT NULL DEFAULT '',
		cliente_tel VARCHAR(40) NOT NULL DEFAULT '',
		user_id BIGINT NULL,
		order_ids VARCHAR(400) NOT NULL DEFAULT '',
		creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		pagado DATETIME NULL,
		actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		INDEX idx_pagos_clip_clip_id (clip_id)
	)`); err != nil {
		log.Printf("pagos: no se pudo crear pagos_clip: %v", err)
	}
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'pago_ref'`).Scan(&n); err == nil && n == 0 {
		if _, err := DB.Exec(`ALTER TABLE orders ADD COLUMN pago_ref VARCHAR(40) NOT NULL DEFAULT ''`); err != nil {
			log.Printf("pagos: no se pudo agregar orders.pago_ref: %v", err)
		} else {
			log.Println("pagos: columna orders.pago_ref agregada")
		}
	}
}
