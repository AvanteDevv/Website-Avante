package db

import "log"

// CLARITO+ (Recepción → Clarito+): los registros del programa de clientes
// preferentes. Una sola tabla para las 3 hojas del Excel original:
//   - hoja = "miembros"  → Miembros Clarito+
//   - hoja = "vip"       → VIP actualizados 2026
//   - hoja = "contactos" → Registro de contactos (llamadas a clientes)
//
// Las columnas de cada hoja van en "datos" (JSON), así se pueden agregar
// columnas sin migrar. folio y nombre se guardan aparte para buscar.
func EnsureClaritoPlusTables() {
	stmt := `CREATE TABLE IF NOT EXISTS clarito_plus_registros (
		id          BIGINT AUTO_INCREMENT PRIMARY KEY,
		hoja        VARCHAR(20)  NOT NULL,
		folio       VARCHAR(40)  NOT NULL DEFAULT '',
		nombre      VARCHAR(160) NOT NULL DEFAULT '',
		datos       MEDIUMTEXT   NOT NULL,
		created_by  VARCHAR(120) NOT NULL DEFAULT '',
		updated_by  VARCHAR(120) NOT NULL DEFAULT '',
		created_at  DATETIME     NOT NULL,
		updated_at  DATETIME     NOT NULL,
		INDEX idx_cp_hoja (hoja, id),
		INDEX idx_cp_folio (hoja, folio)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
	if _, err := DB.Exec(stmt); err != nil {
		log.Printf("clarito_plus_registros: %v", err)
	}
}
