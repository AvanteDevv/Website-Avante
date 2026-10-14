package db

import "log"

// Venta del Punto de venta → pedido con clave de rastreo (orders).
// orders.pos_sale_id liga el pedido con su ticket.
func EnsurePosPedidoColumn() {
	if err := addColumnIfMissing("orders", "pos_sale_id", "BIGINT NULL"); err != nil {
		log.Printf("punto de venta: columna orders.pos_sale_id: %v", err)
		return
	}
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.statistics
		WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'idx_orders_pos_sale'`).Scan(&n); err == nil && n == 0 {
		if _, err := DB.Exec("CREATE INDEX idx_orders_pos_sale ON orders (pos_sale_id)"); err != nil {
			log.Printf("punto de venta: índice orders.pos_sale_id: %v", err)
		}
	}
	log.Println("punto de venta: orders.pos_sale_id lista")
}
