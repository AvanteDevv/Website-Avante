package db

import "log"

// EnsureOfflineTables prepara lo que usa la app "Avante Campo" (modo sin
// conexión: punto de venta y examen de la vista en zonas sin internet).
// Se llama al arrancar; no borra ni cambia datos.
//
//   - offline_devices: cada tablet vinculada a una cuenta de staff. La
//     app guarda un token (aquí solo su SHA-256) y con él sincroniza
//     aunque hayan pasado días; "prefijo" va en los folios que la tablet
//     da sin internet (C1-0001, C1-0002…).
//   - pos_sales / pos_clients / eye_exams.client_uuid: el UUID que puso
//     la tablet al crear el registro. Es UNIQUE: si la señal se corta a
//     media subida y la app reintenta, no se duplica.
//   - pos_sales.offline_folio / offline_at / device_id: el folio y la
//     hora reales de la venta en la tablet (created_at es la hora en que
//     llegó al servidor, para que entre al siguiente corte de caja).
func EnsureOfflineTables() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS offline_devices (
		id            BIGINT AUTO_INCREMENT PRIMARY KEY,
		nombre        VARCHAR(80)  NOT NULL DEFAULT '',
		prefijo       VARCHAR(10)  NOT NULL DEFAULT '',
		staff_role    VARCHAR(20)  NOT NULL,
		staff_id      BIGINT       NOT NULL,
		staff_name    VARCHAR(120) NOT NULL DEFAULT '',
		staff_email   VARCHAR(190) NOT NULL DEFAULT '',
		token_hash    CHAR(64)     NOT NULL,
		revocado      TINYINT(1)   NOT NULL DEFAULT 0,
		created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_seen_at  DATETIME     NULL,
		last_sync_at  DATETIME     NULL,
		UNIQUE KEY uq_offline_devices_token (token_hash),
		INDEX idx_offline_devices_staff (staff_role, staff_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("offline: no se pudo crear offline_devices: %v", err)
		return
	}

	cols := []struct{ table, col, ddl string }{
		{"pos_sales", "client_uuid", "VARCHAR(36) NULL"},
		{"pos_sales", "offline_folio", "VARCHAR(30) NOT NULL DEFAULT ''"},
		{"pos_sales", "offline_at", "DATETIME NULL"},
		{"pos_sales", "device_id", "BIGINT NULL"},
		{"pos_clients", "client_uuid", "VARCHAR(36) NULL"},
		{"eye_exams", "client_uuid", "VARCHAR(36) NULL"},
		{"eye_exams", "device_id", "BIGINT NULL"},
	}
	for _, c := range cols {
		if err := addColumnIfMissing(c.table, c.col, c.ddl); err != nil {
			log.Printf("offline: columna %s.%s: %v", c.table, c.col, err)
			return
		}
	}

	idx := []struct{ table, name, ddl string }{
		{"pos_sales", "uq_pos_sales_client_uuid", "CREATE UNIQUE INDEX uq_pos_sales_client_uuid ON pos_sales (client_uuid)"},
		{"pos_clients", "uq_pos_clients_client_uuid", "CREATE UNIQUE INDEX uq_pos_clients_client_uuid ON pos_clients (client_uuid)"},
		{"eye_exams", "uq_eye_exams_client_uuid", "CREATE UNIQUE INDEX uq_eye_exams_client_uuid ON eye_exams (client_uuid)"},
	}
	for _, i := range idx {
		var n int
		if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.STATISTICS
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`, i.table, i.name).Scan(&n); err != nil {
			log.Printf("offline: índice %s: %v", i.name, err)
			continue
		}
		if n == 0 {
			if _, err := DB.Exec(i.ddl); err != nil {
				log.Printf("offline: no se pudo crear el índice %s: %v", i.name, err)
			}
		}
	}
	log.Println("offline: dispositivos y columnas de sincronización listas")
}
