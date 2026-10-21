package models

import (
	"errors"
	"strings"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Laboratorio: convenio de cada trabajo (UNISON o una empresa), limpiar la
// columna de Control de calidad y eliminar trabajos de prueba (solo admin).

// ConvenioEmpresas — las empresas con convenio. Para agregar otra, solo
// súmala aquí (sale sola en el filtro del laboratorio y en la orden).
var ConvenioEmpresas = []string{"Ford"}

// NormalizeConvenio deja el convenio en "" | "unison" | "empresa" y la
// empresa con el nombre tal cual está en ConvenioEmpresas.
func NormalizeConvenio(conv, empresa string) (string, string) {
	switch strings.ToLower(strings.TrimSpace(conv)) {
	case "unison":
		return "unison", ""
	case "empresa":
		e := strings.TrimSpace(empresa)
		for _, x := range ConvenioEmpresas {
			if strings.EqualFold(x, e) {
				return "empresa", x
			}
		}
		if e == "" && len(ConvenioEmpresas) == 1 {
			return "empresa", ConvenioEmpresas[0]
		}
		if r := []rune(e); len(r) > 80 {
			e = string(r[:80])
		}
		return "empresa", e
	}
	return "", ""
}

// SetOrderConvenio — convenio de un trabajo.
func SetOrderConvenio(orderID int64, conv, empresa string) error {
	conv, empresa = NormalizeConvenio(conv, empresa)
	var n int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE id = ?", orderID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrOrderNotFound
	}
	_, err := db.DB.Exec("UPDATE orders SET convenio = ?, convenio_empresa = ? WHERE id = ?", conv, empresa, orderID)
	return err
}

// SetSheetJobsConvenio — el convenio que eligió el optometrista en la
// orden pasa a los trabajos ligados a esa hoja.
func SetSheetJobsConvenio(sheetID int64, conv, empresa string) {
	conv, empresa = NormalizeConvenio(conv, empresa)
	_, _ = db.DB.Exec("UPDATE orders SET convenio = ?, convenio_empresa = ? WHERE lab_sheet_id = ?", conv, empresa, sheetID)
}

var ErrLabColumnaNoLimpiable = errors.New("solo se puede limpiar la última columna del laboratorio")

// ClearLabColumn marca como limpios los trabajos de ese estatus (no se
// borran; si después cambian de estatus vuelven a salir). Regresa cuántos.
func ClearLabColumn(status string) (int64, error) {
	res, err := db.DB.Exec("UPDATE orders SET lab_limpio = 1 WHERE status = ? AND lab_limpio = 0", status)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// DeleteLabOrderHard borra el trabajo para siempre (con su historial).
// La orden de laboratorio del optometrista (la hoja) no se borra.
func DeleteLabOrderHard(orderID int64) error {
	var n int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE id = ?", orderID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrOrderNotFound
	}
	_, _ = db.DB.Exec("DELETE FROM order_status_history WHERE order_id = ?", orderID)
	_, err := db.DB.Exec("DELETE FROM orders WHERE id = ?", orderID)
	return err
}
