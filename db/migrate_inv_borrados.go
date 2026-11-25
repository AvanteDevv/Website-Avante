package db

import "log"

// EnsureInvMovBorrados crea la tabla donde queda quién borró qué
// movimientos del kárdex (o tickets de prueba) y cuándo. Cada borrado
// guarda una copia del movimiento tal como estaba, así el admin puede ver
// después en Movimientos → «Borrados» lo que se quitó y si se deshizo la
// existencia.
func EnsureInvMovBorrados() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inv_mov_borrados (
		id               BIGINT AUTO_INCREMENT PRIMARY KEY,
		lote             VARCHAR(24)  NOT NULL,
		mov_id           BIGINT       NOT NULL DEFAULT 0,
		item_id          BIGINT       NOT NULL DEFAULT 0,
		clave            VARCHAR(60)  NOT NULL DEFAULT '',
		descripcion      VARCHAR(255) NOT NULL DEFAULT '',
		tipo             VARCHAR(20)  NOT NULL,
		cantidad         INT          NOT NULL DEFAULT 0,
		existencia_antes INT          NOT NULL DEFAULT 0,
		existencia_despues INT        NOT NULL DEFAULT 0,
		venta_id         BIGINT       NULL,
		comentario       VARCHAR(255) NOT NULL DEFAULT '',
		usuario          VARCHAR(120) NOT NULL DEFAULT '',
		mov_fecha        DATETIME     NULL,
		exist_hoy        INT          NULL,
		exist_queda      INT          NULL,
		revertido        TINYINT(1)   NOT NULL DEFAULT 0,
		borrado_por      VARCHAR(120) NOT NULL DEFAULT '',
		borrado_desde    VARCHAR(20)  NOT NULL DEFAULT '',
		borrado_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_inv_borr_fecha (borrado_at),
		INDEX idx_inv_borr_lote (lote),
		INDEX idx_inv_borr_item (item_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("inventario: no se pudo crear inv_mov_borrados: %v", err)
		return
	}
	log.Println("inventario: registro de movimientos borrados listo")
}
