package db

import "log"

// EnsureLabEntregaExpress prepara lo nuevo del tablero de Laboratorio:
//   - orders.lab_entrega: fecha estimada de entrega de ESE trabajo (la
//     pone el laboratorio a mano, una por lente). NULL = sin fecha.
//   - orders.lab_express: el trabajo es "lente express". Por ahora solo
//     se ve la etiqueta; no cambia precios, orden ni tiempos.
//   - Estatus (una sola vez, marca seed_status_autorizar en caja_config):
//     «Recibido» pasa a llamarse «A autorizar» (la clave sigue siendo
//     "recibido", así que ventas, pedidos y Rastreo siguen igual) y se
//     quita «Aprobado»: los trabajos que estaban ahí pasan al siguiente
//     estatus (normalmente «En proceso») y queda en su historial.
//
// Se llama al arrancar, después de EnsureLabHojaColumn.
func EnsureLabEntregaExpress() {
	if err := addColumnIfMissing("orders", "lab_entrega", "DATE NULL"); err != nil {
		log.Printf("laboratorio: columna orders.lab_entrega: %v", err)
	}
	if err := addColumnIfMissing("orders", "lab_express", "TINYINT(1) NOT NULL DEFAULT 0"); err != nil {
		log.Printf("laboratorio: columna orders.lab_express: %v", err)
	}

	var done string
	_ = DB.QueryRow("SELECT v FROM caja_config WHERE k = 'seed_status_autorizar'").Scan(&done)
	if done == "1" {
		return
	}
	var n int
	if err := DB.QueryRow("SELECT COUNT(*) FROM order_statuses").Scan(&n); err != nil {
		return // aún no existe la tabla de estatus
	}

	if _, err := DB.Exec("UPDATE order_statuses SET label = 'A autorizar' WHERE status_key = 'recibido'"); err != nil {
		log.Printf("laboratorio: renombrar «Recibido»: %v", err)
		return
	}

	var aprobOrder int
	if err := DB.QueryRow("SELECT sort_order FROM order_statuses WHERE status_key = 'aprobado'").Scan(&aprobOrder); err == nil {
		// El estatus que sigue a «Aprobado» (o el que va antes si era el último).
		var next string
		if DB.QueryRow("SELECT status_key FROM order_statuses WHERE status_key <> 'aprobado' AND sort_order >= ? ORDER BY sort_order ASC, id ASC LIMIT 1", aprobOrder).Scan(&next) != nil {
			_ = DB.QueryRow("SELECT status_key FROM order_statuses WHERE status_key <> 'aprobado' ORDER BY sort_order DESC, id DESC LIMIT 1").Scan(&next)
		}
		if next != "" {
			if _, err := DB.Exec(`INSERT INTO order_status_history (order_id, status, changed_by, changed_role)
				SELECT id, ?, 'Sistema (se quitó «Aprobado»)', 'sistema' FROM orders WHERE status = 'aprobado'`, next); err != nil {
				log.Printf("laboratorio: historial al quitar «Aprobado»: %v", err)
			}
			res, err := DB.Exec("UPDATE orders SET status = ? WHERE status = 'aprobado'", next)
			if err != nil {
				log.Printf("laboratorio: mover trabajos de «Aprobado»: %v", err)
				return
			}
			moved, _ := res.RowsAffected()
			if _, err := DB.Exec("DELETE FROM order_statuses WHERE status_key = 'aprobado'"); err != nil {
				log.Printf("laboratorio: quitar «Aprobado»: %v", err)
				return
			}
			log.Printf("laboratorio: se quitó «Aprobado» (%d trabajos pasaron a %q)", moved, next)
		}
	}
	log.Println("laboratorio: «Recibido» ahora se llama «A autorizar»")
	_, _ = DB.Exec("INSERT INTO caja_config (k, v) VALUES ('seed_status_autorizar', '1') ON DUPLICATE KEY UPDATE v = '1'")
}
