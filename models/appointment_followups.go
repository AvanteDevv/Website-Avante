package models

import (
	"database/sql"
	"strconv"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// AppointmentFollowup: qué pasó cuando el cliente asistió a su cita.
//   - Compro: si compró algo.
//   - Meses: cada cuánto le toca su próxima revisión (3, 6 o 12). Solo
//     aplica si compró; si no compró va en 0 y no se le programa.
type AppointmentFollowup struct {
	Compro bool `json:"compro"`
	Meses  int  `json:"meses,omitempty"`
}

// IsRevisionMonths indica si el intervalo de revisión es válido.
func IsRevisionMonths(m int) bool { return m == 3 || m == 6 || m == 12 }

// ListAppointmentFollowups regresa { "12": {compro:true, meses:6}, … }.
func ListAppointmentFollowups() (map[string]AppointmentFollowup, error) {
	rows, err := db.DB.Query("SELECT appointment_id, compro, revision_meses FROM appointment_followups")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]AppointmentFollowup{}
	for rows.Next() {
		var id int64
		var compro bool
		var meses sql.NullInt64
		if err := rows.Scan(&id, &compro, &meses); err != nil {
			return nil, err
		}
		f := AppointmentFollowup{Compro: compro}
		if compro && meses.Valid {
			f.Meses = int(meses.Int64)
		}
		out[strconv.FormatInt(id, 10)] = f
	}
	return out, rows.Err()
}

// SetAppointmentFollowup guarda (o reemplaza) el seguimiento de una cita.
// Si no compró, revision_meses queda NULL.
func SetAppointmentFollowup(appointmentID int64, compro bool, meses int, updatedBy string) error {
	var mesesArg interface{}
	if compro {
		mesesArg = meses
	}
	_, err := db.DB.Exec(
		`INSERT INTO appointment_followups (appointment_id, compro, revision_meses, updated_by) VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE compro = VALUES(compro), revision_meses = VALUES(revision_meses),
		   updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
		appointmentID, compro, mesesArg, updatedBy,
	)
	return err
}
