package models

import (
	"strconv"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// TagSitioWeb es la etiqueta automática de las citas que el cliente hizo
// él solo desde la página (appointments.origen = "web"). Recepción no la
// puede elegir: se pone sola al agendar y, si recepción le quita la
// etiqueta que haya puesto encima, la cita regresa a "sitio_web".
const TagSitioWeb = "sitio_web"

// Etiquetas de cita: cómo llegó la cita.
var AppointmentTagLabels = map[string]string{
	TagSitioWeb: "Agendó en el sitio web",
	"sin_cita":  "Vino sin cita",
	"chequeo":   "Chequeo",
	"telefono":  "Agendó por teléfono",
	"whatsapp":  "Agendó por WhatsApp",
}

// IsAppointmentTag indica si la etiqueta existe.
func IsAppointmentTag(tag string) bool {
	_, ok := AppointmentTagLabels[tag]
	return ok
}

// ListAppointmentTags regresa { "12": "chequeo", … } de todas las citas
// que tienen etiqueta.
func ListAppointmentTags() (map[string]string, error) {
	rows, err := db.DB.Query("SELECT appointment_id, tag FROM appointment_tags")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id int64
		var tag string
		if err := rows.Scan(&id, &tag); err != nil {
			return nil, err
		}
		out[strconv.FormatInt(id, 10)] = tag
	}
	return out, rows.Err()
}

// SetAppointmentTag pone (o quita, con tag "") la etiqueta de una cita.
func SetAppointmentTag(appointmentID int64, tag, updatedBy string) error {
	if tag == "" {
		_, err := db.DB.Exec("DELETE FROM appointment_tags WHERE appointment_id = ?", appointmentID)
		return err
	}
	_, err := db.DB.Exec(
		`INSERT INTO appointment_tags (appointment_id, tag, updated_by) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE tag = VALUES(tag), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
		appointmentID, tag, updatedBy,
	)
	return err
}
