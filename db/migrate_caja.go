package db

import "log"

// CORTE DE CAJA (como en SICAR):
//   - caja_cortes: cada corte guardado (contado, calculado, retiro por forma
//     de pago) con la foto del reporte extendido en "reporte" (JSON), para
//     que el corte no cambie aunque después se cancele algo.
//   - caja_movimientos: entradas y salidas de dinero que no son ventas
//     (gastos, compras, retiros, depósitos, notas de crédito, devoluciones
//     de proveedor, pagos a proveedores…).
//   - caja_propina_cortes: cortes de propinas.
//   - caja_config: permisos de la caja (p. ej. si recepción ve lo calculado).
//   - pos_sales: propina y cancelación de la venta.
//   - pos_credit_payments.cancelado_at: cuándo se canceló un abono.
func EnsureCajaTables() {
	stmts := []struct{ name, sql string }{
		{"caja_cortes", `CREATE TABLE IF NOT EXISTS caja_cortes (
			id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
			caja                  VARCHAR(40)   NOT NULL DEFAULT 'Caja 1',
			usuario               VARCHAR(120)  NOT NULL DEFAULT '',
			desde                 DATETIME      NULL,
			hasta                 DATETIME      NOT NULL,
			contado_efectivo      DECIMAL(12,2) NOT NULL DEFAULT 0,
			contado_cheque        DECIMAL(12,2) NOT NULL DEFAULT 0,
			contado_vales         DECIMAL(12,2) NOT NULL DEFAULT 0,
			contado_tarjeta       DECIMAL(12,2) NOT NULL DEFAULT 0,
			contado_transferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
			calculado_efectivo      DECIMAL(12,2) NOT NULL DEFAULT 0,
			calculado_cheque        DECIMAL(12,2) NOT NULL DEFAULT 0,
			calculado_vales         DECIMAL(12,2) NOT NULL DEFAULT 0,
			calculado_tarjeta       DECIMAL(12,2) NOT NULL DEFAULT 0,
			calculado_transferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
			retiro_efectivo      DECIMAL(12,2) NOT NULL DEFAULT 0,
			retiro_cheque        DECIMAL(12,2) NOT NULL DEFAULT 0,
			retiro_vales         DECIMAL(12,2) NOT NULL DEFAULT 0,
			retiro_tarjeta       DECIMAL(12,2) NOT NULL DEFAULT 0,
			retiro_transferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
			contado    DECIMAL(12,2) NOT NULL DEFAULT 0,
			calculado  DECIMAL(12,2) NOT NULL DEFAULT 0,
			diferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
			retirado   DECIMAL(12,2) NOT NULL DEFAULT 0,
			reporte    LONGTEXT      NOT NULL,
			created_at DATETIME      NOT NULL,
			INDEX idx_caja_cortes_caja (caja, hasta),
			INDEX idx_caja_cortes_created (created_at)
		) DEFAULT CHARSET=utf8mb4`},
		{"caja_movimientos", `CREATE TABLE IF NOT EXISTS caja_movimientos (
			id            BIGINT AUTO_INCREMENT PRIMARY KEY,
			caja          VARCHAR(40)   NOT NULL DEFAULT 'Caja 1',
			tipo          VARCHAR(10)   NOT NULL,
			concepto      VARCHAR(30)   NOT NULL,
			forma_pago    VARCHAR(20)   NOT NULL DEFAULT 'efectivo',
			monto         DECIMAL(12,2) NOT NULL DEFAULT 0,
			comentario    VARCHAR(200)  NOT NULL DEFAULT '',
			referencia    VARCHAR(80)   NOT NULL DEFAULT '',
			usuario       VARCHAR(120)  NOT NULL DEFAULT '',
			created_at    DATETIME      NOT NULL,
			cancelado     TINYINT(1)    NOT NULL DEFAULT 0,
			cancelado_por VARCHAR(120)  NOT NULL DEFAULT '',
			cancelado_at  DATETIME      NULL,
			INDEX idx_caja_mov_created (caja, created_at),
			INDEX idx_caja_mov_cancel (caja, cancelado_at)
		) DEFAULT CHARSET=utf8mb4`},
		{"caja_propina_cortes", `CREATE TABLE IF NOT EXISTS caja_propina_cortes (
			id            BIGINT AUTO_INCREMENT PRIMARY KEY,
			caja          VARCHAR(40)   NOT NULL DEFAULT 'Caja 1',
			usuario       VARCHAR(120)  NOT NULL DEFAULT '',
			desde         DATETIME      NULL,
			hasta         DATETIME      NOT NULL,
			efectivo      DECIMAL(12,2) NOT NULL DEFAULT 0,
			tarjeta       DECIMAL(12,2) NOT NULL DEFAULT 0,
			transferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
			vales         DECIMAL(12,2) NOT NULL DEFAULT 0,
			cheque        DECIMAL(12,2) NOT NULL DEFAULT 0,
			total         DECIMAL(12,2) NOT NULL DEFAULT 0,
			created_at    DATETIME      NOT NULL,
			INDEX idx_caja_prop (caja, hasta)
		) DEFAULT CHARSET=utf8mb4`},
		{"caja_config", `CREATE TABLE IF NOT EXISTS caja_config (
			k VARCHAR(60) NOT NULL PRIMARY KEY,
			v VARCHAR(255) NOT NULL DEFAULT ''
		) DEFAULT CHARSET=utf8mb4`},
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s.sql); err != nil {
			log.Printf("corte de caja: no se pudo crear la tabla %s: %v", s.name, err)
			return
		}
	}
	cols := []struct{ table, col, ddl string }{
		{"pos_sales", "propina", "DECIMAL(12,2) NOT NULL DEFAULT 0"},
		{"pos_sales", "propina_forma", "VARCHAR(20) NOT NULL DEFAULT ''"},
		{"pos_sales", "cancelada", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"pos_sales", "cancelada_at", "DATETIME NULL"},
		{"pos_sales", "cancelada_por", "VARCHAR(120) NOT NULL DEFAULT ''"},
		{"pos_sales", "cancel_motivo", "VARCHAR(200) NOT NULL DEFAULT ''"},
		{"pos_credit_payments", "cancelado_at", "DATETIME NULL"},
	}
	for _, c := range cols {
		if err := addColumnIfMissing(c.table, c.col, c.ddl); err != nil {
			log.Printf("corte de caja: columna %s.%s: %v", c.table, c.col, err)
		}
	}
	log.Println("corte de caja: tablas listas")
}
