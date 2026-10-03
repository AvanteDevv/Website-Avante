package db

import "log"

// EnsurePosTables crea (si no existen) las tablas del Punto de venta:
//
//   - pos_clients: clientes del punto de venta (No. de cliente, clave,
//     representante, días y límite de crédito), como en SICAR.
//   - pos_sales / pos_sale_items: cada venta (ticket) y sus productos.
//   - pos_credits: lo que el cliente quedó a deber de una venta (p. ej.
//     dejó un anticipo y paga el resto al recoger sus lentes). "saldo"
//     baja con cada abono; "vence" = fecha de la venta + días de crédito.
//   - pos_credit_payments: los abonos a cada crédito (se pueden cancelar
//     el mismo día).
//
// Se llama al arrancar; no toca datos existentes.
func EnsurePosTables() {
	stmts := []struct{ name, sql string }{
		{"pos_clients", `CREATE TABLE IF NOT EXISTS pos_clients (
			id             BIGINT AUTO_INCREMENT PRIMARY KEY,
			numero         VARCHAR(20)   NOT NULL,
			clave          VARCHAR(30)   NOT NULL DEFAULT '',
			nombre         VARCHAR(120)  NOT NULL,
			celular        VARCHAR(20)   NOT NULL DEFAULT '',
			representante  VARCHAR(120)  NOT NULL DEFAULT '',
			dias_credito   INT           NOT NULL DEFAULT 0,
			limite_credito DECIMAL(12,2) NOT NULL DEFAULT 0,
			created_by     VARCHAR(120)  NOT NULL DEFAULT '',
			created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uq_pos_clients_numero (numero),
			INDEX idx_pos_clients_nombre (nombre)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
		{"pos_sales", `CREATE TABLE IF NOT EXISTS pos_sales (
			id            BIGINT AUTO_INCREMENT PRIMARY KEY,
			client_id     BIGINT        NULL,
			cliente       VARCHAR(120)  NOT NULL DEFAULT '',
			cajero        VARCHAR(120)  NOT NULL DEFAULT '',
			subtotal      DECIMAL(12,2) NOT NULL DEFAULT 0,
			descuento     DECIMAL(12,2) NOT NULL DEFAULT 0,
			total         DECIMAL(12,2) NOT NULL DEFAULT 0,
			efectivo      DECIMAL(12,2) NOT NULL DEFAULT 0,
			tarjeta       DECIMAL(12,2) NOT NULL DEFAULT 0,
			transferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
			vales         DECIMAL(12,2) NOT NULL DEFAULT 0,
			cheque        DECIMAL(12,2) NOT NULL DEFAULT 0,
			credito       DECIMAL(12,2) NOT NULL DEFAULT 0,
			cambio        DECIMAL(12,2) NOT NULL DEFAULT 0,
			referencia    VARCHAR(80)   NOT NULL DEFAULT '',
			created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_pos_sales_client (client_id),
			INDEX idx_pos_sales_created (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
		{"pos_sale_items", `CREATE TABLE IF NOT EXISTS pos_sale_items (
			id           BIGINT AUTO_INCREMENT PRIMARY KEY,
			sale_id      BIGINT        NOT NULL,
			inventory_id BIGINT        NULL,
			clave        VARCHAR(60)   NOT NULL DEFAULT '',
			descripcion  VARCHAR(200)  NOT NULL,
			cantidad     INT           NOT NULL DEFAULT 1,
			precio       DECIMAL(12,2) NOT NULL DEFAULT 0,
			descuento    DECIMAL(5,2)  NOT NULL DEFAULT 0,
			importe      DECIMAL(12,2) NOT NULL DEFAULT 0,
			INDEX idx_pos_items_sale (sale_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
		{"pos_credits", `CREATE TABLE IF NOT EXISTS pos_credits (
			id         BIGINT AUTO_INCREMENT PRIMARY KEY,
			sale_id    BIGINT        NOT NULL,
			client_id  BIGINT        NOT NULL,
			monto      DECIMAL(12,2) NOT NULL DEFAULT 0,
			saldo      DECIMAL(12,2) NOT NULL DEFAULT 0,
			fecha      DATE          NOT NULL,
			vence      DATE          NULL,
			created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uq_pos_credits_sale (sale_id),
			INDEX idx_pos_credits_client (client_id, saldo)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
		{"pos_credit_payments", `CREATE TABLE IF NOT EXISTS pos_credit_payments (
			id            BIGINT AUTO_INCREMENT PRIMARY KEY,
			credit_id     BIGINT        NOT NULL,
			client_id     BIGINT        NOT NULL,
			monto         DECIMAL(12,2) NOT NULL DEFAULT 0,
			forma_pago    VARCHAR(20)   NOT NULL DEFAULT 'efectivo',
			referencia    VARCHAR(80)   NOT NULL DEFAULT '',
			cajero        VARCHAR(120)  NOT NULL DEFAULT '',
			fecha         DATE          NOT NULL,
			created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
			cancelado     TINYINT(1)    NOT NULL DEFAULT 0,
			cancelado_por VARCHAR(120)  NOT NULL DEFAULT '',
			INDEX idx_pos_pay_credit (credit_id),
			INDEX idx_pos_pay_client (client_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`},
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s.sql); err != nil {
			log.Printf("punto de venta: no se pudo crear la tabla %s: %v", s.name, err)
			return
		}
	}
	log.Println("punto de venta: tablas de clientes, ventas y créditos listas")
}
