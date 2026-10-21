package db

import "log"

// Laboratorio:
//   - orders.lab_sheet_id: la orden de laboratorio ligada al trabajo (la
//     liga el optometrista al hacerla desde la venta, o a mano el
//     laboratorio). Si está vacía, se busca sola por nombre / celular.
//   - orders.lab_sin_hoja: el optometrista marcó que esa venta no lleva
//     orden de laboratorio (el trabajo pasa al tablero sin hoja).
//   - orders.lab_externo: el trabajo está en un laboratorio externo.
//   - orders.lab_directo: el trabajo salió de una orden de laboratorio
//     hecha sin venta (sin pasar por Punto de venta, sin clave de rastreo).
//   - orders.lab_limpio: el laboratorio limpió la columna de Control de
//     calidad (el trabajo no se borra, solo ya no sale en su tablero).
//   - orders.convenio / convenio_empresa: el trabajo es de UNISON o de una
//     empresa (Ford, …), para el filtro del tablero.
//   - Estatus "Corte" antes de "Control de calidad" (una sola vez; si el
//     admin lo borra después, no se vuelve a crear).
func EnsureLabHojaColumn() {
	for _, c := range []struct{ col, ddl string }{
		{"lab_sheet_id", "BIGINT NULL"},
		{"lab_sin_hoja", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"lab_externo", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"lab_directo", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"lab_limpio", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"convenio", "VARCHAR(20) NOT NULL DEFAULT ''"},
		{"convenio_empresa", "VARCHAR(80) NOT NULL DEFAULT ''"},
	} {
		if err := addColumnIfMissing("orders", c.col, c.ddl); err != nil {
			log.Printf("laboratorio: columna orders.%s: %v", c.col, err)
		}
	}
	seedCorteStatus()
	log.Println("laboratorio: columnas y estatus listos")
}

func seedCorteStatus() {
	var done string
	_ = DB.QueryRow("SELECT v FROM caja_config WHERE k = 'seed_status_corte'").Scan(&done)
	if done == "1" {
		return
	}
	var n int
	if err := DB.QueryRow("SELECT COUNT(*) FROM order_statuses WHERE status_key = 'corte'").Scan(&n); err != nil {
		return // aún no existe la tabla de estatus
	}
	if n == 0 {
		var pos int
		if err := DB.QueryRow("SELECT sort_order FROM order_statuses WHERE status_key = 'control_calidad'").Scan(&pos); err != nil {
			_ = DB.QueryRow("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM order_statuses").Scan(&pos)
		} else if _, err := DB.Exec("UPDATE order_statuses SET sort_order = sort_order + 1 WHERE sort_order >= ?", pos); err != nil {
			log.Printf("laboratorio: estatus Corte: %v", err)
			return
		}
		if _, err := DB.Exec("INSERT INTO order_statuses (status_key, label, color, sort_order) VALUES ('corte', 'Corte', '#b45309', ?)", pos); err != nil {
			log.Printf("laboratorio: estatus Corte: %v", err)
			return
		}
		log.Println("laboratorio: estatus «Corte» agregado antes de Control de calidad")
	}
	_, _ = DB.Exec("INSERT INTO caja_config (k, v) VALUES ('seed_status_corte', '1') ON DUPLICATE KEY UPDATE v = '1'")
}
