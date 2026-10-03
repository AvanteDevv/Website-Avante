package models

import "strings"

// Nombre y apellidos por separado para las tablas de citas (admin y
// recepción): primer nombre, segundo nombre, primer apellido y segundo
// apellido. La cita guarda "nombre" y "apellido" como los escribieron;
// aquí solo se parten para mostrarlos en 4 columnas.
//
//	Nombre "JESUS MANUEL"         → "JESUS" | "MANUEL"
//	Apellido "ORTEGA RAMIREZ"     → "ORTEGA" | "RAMIREZ"
//	Apellido "DE LA CRUZ LOPEZ"   → "DE LA CRUZ" | "LOPEZ"
//	Apellido "PEREZ DE LEON"      → "PEREZ" | "DE LEON"

// particulasApellido: palabras que van pegadas al apellido que sigue.
var particulasApellido = map[string]bool{
	"de": true, "del": true, "la": true, "las": true, "los": true, "y": true,
	"san": true, "santa": true, "van": true, "von": true, "da": true, "di": true, "mc": true, "der": true, "du": true, "le": true,
}

func splitNombre(full string) (string, string) {
	w := strings.Fields(full)
	if len(w) == 0 {
		return "", ""
	}
	return w[0], strings.Join(w[1:], " ")
}

// splitApellidos junta las partículas ("de", "la", "del"…) con la palabra
// que les sigue y regresa el primer apellido y el resto.
func splitApellidos(full string) (string, string) {
	w := strings.Fields(full)
	if len(w) == 0 {
		return "", ""
	}
	var parts []string
	cur := []string{}
	for _, word := range w {
		cur = append(cur, word)
		if particulasApellido[strings.ToLower(word)] {
			continue // la partícula espera a la siguiente palabra
		}
		parts = append(parts, strings.Join(cur, " "))
		cur = cur[:0]
	}
	if len(cur) > 0 { // terminó en partícula: se pega a lo último
		if len(parts) == 0 {
			parts = append(parts, strings.Join(cur, " "))
		} else {
			parts[len(parts)-1] += " " + strings.Join(cur, " ")
		}
	}
	return parts[0], strings.Join(parts[1:], " ")
}

func (a Appointment) PrimerNombre() string    { p, _ := splitNombre(a.Nombre); return p }
func (a Appointment) SegundoNombre() string   { _, s := splitNombre(a.Nombre); return s }
func (a Appointment) PrimerApellido() string  { p, _ := splitApellidos(a.Apellido); return p }
func (a Appointment) SegundoApellido() string { _, s := splitApellidos(a.Apellido); return s }
