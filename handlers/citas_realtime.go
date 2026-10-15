package handlers

import (
	"time"

	"avante-optics/realtime"

	"github.com/gin-gonic/gin"
)

// Cuando cambia una cita (recepción la agenda, la edita, la cancela, el
// cliente la agenda o la reagenda en la página…) se avisa al instante a
// todo el staff conectado, para que el optometrista la vea en "Citas de
// hoy" sin esperar a que la página se refresque sola.
//
// El evento no trae datos: cada página vuelve a pedir /api/citas (así no
// se manda información de pacientes a quien no le toca).
func BroadcastCitasChanged() {
	realtime.Default.Broadcast(realtime.Event{
		Type: "citas.changed",
		Data: gin.H{"at": time.Now().Unix()},
	})
}

// NotifyCitasChanged — middleware para las rutas que modifican citas:
// si la petición salió bien, avisa.
func NotifyCitasChanged() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if s := c.Writer.Status(); s >= 200 && s < 400 {
			BroadcastCitasChanged()
		}
	}
}

// BroadcastLabPendiente — cambió la lista de ventas que esperan orden de
// laboratorio (recepción vendió, o el optometrista ya hizo la orden).
func BroadcastLabPendiente() {
	realtime.Default.Broadcast(realtime.Event{
		Type: "lab.pendiente",
		Data: gin.H{"at": time.Now().Unix()},
	})
}
