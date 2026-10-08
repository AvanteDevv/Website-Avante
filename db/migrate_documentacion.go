package db

import "log"

// EnsureDocumentacionTable crea (si no existe) la tabla de Administración →
// Documentación: requisitos de UNISON, empresas, etc. El archivo (PDF o
// Word) vive en el bucket de Railway (documentacion/<token>/<archivo>);
// aquí se guarda su registro y el token del link público /documento/:token.
// Se llama al arrancar; no borra ni cambia datos.
func EnsureDocumentacionTable() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS documentos (
		id           BIGINT AUTO_INCREMENT PRIMARY KEY,
		token        VARCHAR(40)   NOT NULL,
		title        VARCHAR(200)  NOT NULL,
		category     VARCHAR(20)   NOT NULL DEFAULT 'otros',
		file_name    VARCHAR(255)  NOT NULL,
		object_key   VARCHAR(600)  NOT NULL,
		content_type VARCHAR(120)  NOT NULL DEFAULT '',
		size_bytes   BIGINT        NOT NULL DEFAULT 0,
		views        INT           NOT NULL DEFAULT 0,
		created_by   VARCHAR(120)  NOT NULL DEFAULT '',
		updated_by   VARCHAR(120)  NOT NULL DEFAULT '',
		created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_documentos_token (token),
		INDEX idx_documentos_cat (category)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("documentación: no se pudo crear la tabla documentos: %v", err)
		return
	}
	log.Println("documentación: tabla documentos lista")
}
