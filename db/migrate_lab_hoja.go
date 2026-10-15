package db

import "log"

// orders.lab_sheet_id: la orden de laboratorio (hoja que llena el
// optometrista) ligada a mano a un trabajo. Si está vacía, el panel de
// Laboratorio la busca sola por el nombre / celular del cliente.
func EnsureLabHojaColumn() {
	if err := addColumnIfMissing("orders", "lab_sheet_id", "BIGINT NULL"); err != nil {
		log.Printf("laboratorio: columna orders.lab_sheet_id: %v", err)
		return
	}
	log.Println("laboratorio: orders.lab_sheet_id lista")
}
