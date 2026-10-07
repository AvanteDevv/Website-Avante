package db

import "log"

// EnsureClaritoTables crea (si no existen) las tablas de Administración →
// Clarito. Los PDF viven en el bucket de Railway; aquí solo se guarda:
//   - clarito_documents: registro de los formatos llenados (quién, cliente,
//     carpeta y la key del archivo en el bucket) para "Guardados recientemente".
//   - clarito_settings: cómo se nombran y organizan (una sola fila).
//   - clarito_sign_requests: links para que el cliente firme desde su celular.
//
// La tabla vieja drive_connection (Google Drive) ya no se usa; se deja
// tal cual para no borrar nada. Se puede eliminar a mano cuando quieras.
func EnsureClaritoTables() {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS clarito_documents (
			id           BIGINT AUTO_INCREMENT PRIMARY KEY,
			form_key     VARCHAR(40)   NOT NULL,
			form_name    VARCHAR(120)  NOT NULL,
			client_name  VARCHAR(190)  NOT NULL DEFAULT '',
			file_name    VARCHAR(255)  NOT NULL,
			drive_id     VARCHAR(128)  NOT NULL DEFAULT '',
			folder_id    VARCHAR(128)  NOT NULL DEFAULT '',
			folder_path  VARCHAR(500)  NOT NULL DEFAULT '',
			web_link     VARCHAR(500)  NOT NULL DEFAULT '',
			created_by   VARCHAR(120)  NOT NULL DEFAULT '',
			created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_clarito_created (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
		`CREATE TABLE IF NOT EXISTS clarito_settings (
			id         TINYINT   NOT NULL PRIMARY KEY,
			settings   TEXT      NOT NULL,
			updated_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
		`CREATE TABLE IF NOT EXISTS clarito_sign_requests (
			id          BIGINT AUTO_INCREMENT PRIMARY KEY,
			token       CHAR(64)      NOT NULL,
			form_name   VARCHAR(160)  NOT NULL DEFAULT '',
			client_name VARCHAR(190)  NOT NULL DEFAULT '',
			field_label VARCHAR(190)  NOT NULL DEFAULT '',
			status      VARCHAR(16)   NOT NULL DEFAULT 'pendiente',
			draft_key   VARCHAR(300)  NOT NULL DEFAULT '',
			signature   MEDIUMTEXT    NULL,
			signed_ip   VARCHAR(64)   NOT NULL DEFAULT '',
			signed_ua   VARCHAR(255)  NOT NULL DEFAULT '',
			created_by  VARCHAR(120)  NOT NULL DEFAULT '',
			created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			expires_at  DATETIME      NOT NULL,
			signed_at   DATETIME      NULL,
			UNIQUE KEY uq_clarito_sign_token (token),
			INDEX idx_clarito_sign_created (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s); err != nil {
			log.Printf("clarito: no se pudo crear una tabla: %v", err)
			return
		}
	}
	// Antes los archivos estaban en Drive (drive_id); ahora en el bucket.
	if err := addColumnIfMissing("clarito_documents", "object_key", "VARCHAR(700) NOT NULL DEFAULT '' AFTER file_name"); err != nil {
		log.Printf("clarito: columna object_key: %v", err)
	}
	if err := addColumnIfMissing("clarito_documents", "size_bytes", "BIGINT NOT NULL DEFAULT 0 AFTER object_key"); err != nil {
		log.Printf("clarito: columna size_bytes: %v", err)
	}
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clarito_documents' AND INDEX_NAME = 'idx_clarito_key'`).Scan(&n); err == nil && n == 0 {
		if _, err := DB.Exec(`ALTER TABLE clarito_documents ADD INDEX idx_clarito_key (object_key(255))`); err != nil {
			log.Printf("clarito: índice object_key: %v", err)
		}
	}
	log.Println("clarito: tablas clarito_documents, clarito_settings y clarito_sign_requests listas")
}
