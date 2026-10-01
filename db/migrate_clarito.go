package db

import "log"

// EnsureClaritoTables crea (si no existen) las tablas de Administración →
// Clarito: la conexión con Google Drive (una sola fila) y el registro de
// los formatos llenados que se subieron a Drive.
func EnsureClaritoTables() {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS drive_connection (
			id            TINYINT       NOT NULL PRIMARY KEY,
			email         VARCHAR(190)  NOT NULL DEFAULT '',
			name          VARCHAR(190)  NOT NULL DEFAULT '',
			refresh_token TEXT          NOT NULL,
			access_token  TEXT          NULL,
			expiry        DATETIME      NULL,
			root_id       VARCHAR(128)  NOT NULL DEFAULT '',
			root_name     VARCHAR(190)  NOT NULL DEFAULT '',
			settings      TEXT          NULL,
			status        VARCHAR(20)   NOT NULL DEFAULT 'ok',
			last_error    VARCHAR(500)  NOT NULL DEFAULT '',
			connected_by  VARCHAR(120)  NOT NULL DEFAULT '',
			connected_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			checked_at    DATETIME      NULL
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
		`CREATE TABLE IF NOT EXISTS clarito_documents (
			id           BIGINT AUTO_INCREMENT PRIMARY KEY,
			form_key     VARCHAR(40)   NOT NULL,
			form_name    VARCHAR(120)  NOT NULL,
			client_name  VARCHAR(190)  NOT NULL DEFAULT '',
			file_name    VARCHAR(255)  NOT NULL,
			drive_id     VARCHAR(128)  NOT NULL,
			folder_id    VARCHAR(128)  NOT NULL DEFAULT '',
			folder_path  VARCHAR(500)  NOT NULL DEFAULT '',
			web_link     VARCHAR(500)  NOT NULL DEFAULT '',
			created_by   VARCHAR(120)  NOT NULL DEFAULT '',
			created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_clarito_created (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s); err != nil {
			log.Printf("clarito: no se pudo crear una tabla: %v", err)
			return
		}
	}
	log.Println("clarito: tablas drive_connection y clarito_documents listas")
}
