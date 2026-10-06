package db

import "log"

// EnsureInventarioProTables prepara lo del panel de Inventario (como el
// módulo de inventario de SICAR):
//
//   - Columnas nuevas en inventory_items: clave alterna, departamento y
//     categoría, unidades de compra/venta y factor, servicio, IVA,
//     precios 2 a 4 con su mayoreo, inventario mínimo/máximo y
//     localización. Las columnas que ya existían no se tocan (precio_costo
//     = precio de compra, precio_venta = precio 1, cantidad_actual =
//     existencia), así que el Punto de venta y Consultas siguen igual.
//   - inv_departamentos / inv_categorias: la clasificación de artículos.
//   - inv_ajustes: cada ajuste (folio) — inventario físico, entrada o
//     salida.
//   - inv_movimientos: el kárdex. Cada cambio de existencia queda aquí
//     (ventas del POS, ajustes, entradas, salidas, inventario inicial).
//
// Se llama al arrancar (después de EnsureInventoryTable). No borra ni
// cambia datos existentes.
func EnsureInventarioProTables() {
	cols := []struct{ name, ddl string }{
		{"clave_alterna", "VARCHAR(60) NOT NULL DEFAULT ''"},
		{"departamento_id", "BIGINT NULL"},
		{"categoria_id", "BIGINT NULL"},
		{"unidad_compra", "VARCHAR(12) NOT NULL DEFAULT 'PZA'"},
		{"unidad_venta", "VARCHAR(12) NOT NULL DEFAULT 'PZA'"},
		{"factor", "DECIMAL(10,3) NOT NULL DEFAULT 1"},
		{"servicio", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"iva", "TINYINT(1) NOT NULL DEFAULT 1"},
		{"precio_2", "DECIMAL(12,2) NOT NULL DEFAULT 0"},
		{"precio_3", "DECIMAL(12,2) NOT NULL DEFAULT 0"},
		{"precio_4", "DECIMAL(12,2) NOT NULL DEFAULT 0"},
		{"mayoreo_2", "INT NOT NULL DEFAULT 0"},
		{"mayoreo_3", "INT NOT NULL DEFAULT 0"},
		{"mayoreo_4", "INT NOT NULL DEFAULT 0"},
		{"inv_minimo", "INT NOT NULL DEFAULT 0"},
		{"inv_maximo", "INT NOT NULL DEFAULT 0"},
		{"localizacion", "VARCHAR(60) NOT NULL DEFAULT ''"},
	}
	for _, c := range cols {
		if err := addColumnIfMissing("inventory_items", c.name, c.ddl); err != nil {
			log.Printf("inventario: no se pudo agregar la columna %s: %v", c.name, err)
			return
		}
	}

	stmts := []struct{ name, sql string }{
		{"inv_departamentos", `CREATE TABLE IF NOT EXISTS inv_departamentos (
			id         BIGINT AUTO_INCREMENT PRIMARY KEY,
			nombre     VARCHAR(60) NOT NULL,
			created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uq_inv_dep_nombre (nombre)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
		{"inv_categorias", `CREATE TABLE IF NOT EXISTS inv_categorias (
			id              BIGINT AUTO_INCREMENT PRIMARY KEY,
			departamento_id BIGINT       NOT NULL,
			nombre          VARCHAR(60)  NOT NULL,
			comision        DECIMAL(5,2) NOT NULL DEFAULT 0,
			created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uq_inv_cat (departamento_id, nombre)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
		{"inv_ajustes", `CREATE TABLE IF NOT EXISTS inv_ajustes (
			id         BIGINT AUTO_INCREMENT PRIMARY KEY,
			tipo       VARCHAR(12)  NOT NULL DEFAULT 'fisico',
			comentario VARCHAR(255) NOT NULL DEFAULT '',
			usuario    VARCHAR(120) NOT NULL DEFAULT '',
			articulos  INT          NOT NULL DEFAULT 0,
			created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_inv_ajustes_fecha (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
		{"inv_movimientos", `CREATE TABLE IF NOT EXISTS inv_movimientos (
			id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
			item_id            BIGINT       NOT NULL,
			tipo               VARCHAR(20)  NOT NULL,
			cantidad           INT          NOT NULL DEFAULT 0,
			existencia_antes   INT          NOT NULL DEFAULT 0,
			existencia_despues INT          NOT NULL DEFAULT 0,
			ajuste_id          BIGINT       NULL,
			venta_id           BIGINT       NULL,
			comentario         VARCHAR(255) NOT NULL DEFAULT '',
			usuario            VARCHAR(120) NOT NULL DEFAULT '',
			created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_inv_mov_item (item_id, created_at),
			INDEX idx_inv_mov_fecha (created_at),
			INDEX idx_inv_mov_ajuste (ajuste_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s.sql); err != nil {
			log.Printf("inventario: no se pudo crear la tabla %s: %v", s.name, err)
			return
		}
	}

	// Departamentos de inicio (los mismos que ya usan en SICAR). Solo si
	// la tabla está vacía: después se administran en Inventario →
	// Departamentos.
	var n int
	if err := DB.QueryRow("SELECT COUNT(*) FROM inv_departamentos").Scan(&n); err == nil && n == 0 {
		for _, d := range []string{"SIN DEFINIR", "ECONOMICO", "LINEA", "MARCAS", "MICAS", "PAQUETE"} {
			if _, err := DB.Exec("INSERT IGNORE INTO inv_departamentos (nombre) VALUES (?)", d); err != nil {
				log.Printf("inventario: no se pudo crear el departamento %s: %v", d, err)
			}
		}
	}
	log.Println("inventario: departamentos, categorías, ajustes y movimientos listos")
}

// addColumnIfMissing agrega una columna solo si todavía no existe
// (MySQL 8 no tiene "ADD COLUMN IF NOT EXISTS").
func addColumnIfMissing(table, column, ddl string) error {
	var n int
	if err := DB.QueryRow(
		"SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
		table, column,
	).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	_, err := DB.Exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + ddl)
	if err == nil {
		log.Printf("inventario: columna %s.%s agregada", table, column)
	}
	return err
}
