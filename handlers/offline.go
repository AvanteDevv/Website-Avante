package handlers

import (
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/models"
)

// =========================================================
// API de la app "Avante Campo" (modo sin conexión).
//
//   POST /api/offline/vincular   → correo + contraseña de staff: vincula la
//                                  tablet y regresa su token (una vez).
//   GET  /api/offline/datos      → catálogo, clientes, pacientes y plantilla
//                                  para trabajar sin internet.
//   POST /api/offline/sync       → lo capturado sin internet (clientes,
//                                  ventas y exámenes) en lotes.
//
// La tablet manda el token en "Authorization: Bearer <token>". No usa
// la cookie del panel: la tablet puede pasar días sin conexión.
// Ver models/offline.go para las reglas de guardado.
// =========================================================

// Qué puede hacer cada rol sin conexión (las mismas reglas que la web).
func offlineCanPOS(role string) bool  { return role == RoleAdmin || role == RoleReceptionist }
func offlineCanExam(role string) bool { return role == RoleAdmin || role == RoleOptometrist }

const offlineMaxBatch = 200

type offlineStaff struct {
	Role  string `json:"role"`
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// offlineAuthenticate revisa correo y contraseña en las cuentas que
// pueden trabajar sin conexión (admin, recepción y optometría).
// Regresa (nil, nil) si el correo o la contraseña no coinciden.
func offlineAuthenticate(c *gin.Context, email, password string) (*offlineStaff, error) {
	check := func(role string, id int64, name, mail, hash string) *offlineStaff {
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil {
			return &offlineStaff{Role: role, ID: id, Name: name, Email: mail}
		}
		LogStaffLoginFailed(c, role, id, name)
		return nil
	}
	if a, err := models.GetAdminByEmail(email); err == nil {
		return check(RoleAdmin, a.ID, a.Name, a.Email, a.PasswordHash), nil
	} else if !errors.Is(err, models.ErrAdminNotFound) {
		return nil, err
	}
	if r, err := models.GetReceptionistByEmail(email); err == nil {
		return check(RoleReceptionist, r.ID, r.Name, r.Email, r.PasswordHash), nil
	} else if !errors.Is(err, models.ErrReceptionistNotFound) {
		return nil, err
	}
	if o, err := models.GetOptometristByEmail(email); err == nil {
		return check(RoleOptometrist, o.ID, o.Name, o.Email, o.PasswordHash), nil
	} else if !errors.Is(err, models.ErrOptometristNotFound) {
		return nil, err
	}
	return nil, nil
}

// OfflineVincular — POST /api/offline/vincular
func OfflineVincular(c *gin.Context) {
	var in struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		Dispositivo string `json:"dispositivo"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || strings.TrimSpace(in.Email) == "" || in.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe tu correo y contraseña."})
		return
	}
	staff, err := offlineAuthenticate(c, strings.TrimSpace(in.Email), in.Password)
	if err != nil {
		log.Printf("offline.Vincular: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}
	if staff == nil {
		// También cae aquí una cuenta de otro rol (empleado, inventario…).
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos, o la cuenta no es de recepción, optometría o admin."})
		return
	}
	dev, token, err := models.CreateOfflineDevice(in.Dispositivo, staff.Role, staff.ID, staff.Name, staff.Email)
	if err != nil {
		log.Printf("offline.Vincular: crear dispositivo: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo vincular la tablet. Intenta de nuevo."})
		return
	}
	log.Printf("offline: tablet %s (%s) vinculada a %s %s", dev.Prefijo, dev.Nombre, staff.Role, staff.Email)
	c.JSON(http.StatusCreated, gin.H{
		"token":       token,
		"dispositivo": gin.H{"id": dev.ID, "nombre": dev.Nombre, "prefijo": dev.Prefijo},
		"staff":       staff,
		"permisos":    gin.H{"pos": offlineCanPOS(staff.Role), "examen": offlineCanExam(staff.Role)},
	})
}

// RequireOfflineDevice valida el token de la tablet.
func RequireOfflineDevice() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		tok := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		dev, err := models.GetOfflineDeviceByToken(tok)
		if err != nil {
			if !errors.Is(err, models.ErrOfflineDeviceNotFound) {
				log.Printf("offline.auth: %v", err)
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor."})
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Esta tablet ya no está vinculada. Vuelve a vincularla."})
			return
		}
		c.Set("offline_device", dev)
		c.Next()
	}
}

func offlineDevice(c *gin.Context) *models.OfflineDevice {
	v, _ := c.Get("offline_device")
	d, _ := v.(*models.OfflineDevice)
	return d
}

// OfflineDatos — GET /api/offline/datos
func OfflineDatos(c *gin.Context) {
	dev := offlineDevice(c)
	out := gin.H{
		"server_time": time.Now().Unix(),
		"dispositivo": gin.H{"id": dev.ID, "nombre": dev.Nombre, "prefijo": dev.Prefijo},
		"staff":       offlineStaff{Role: dev.StaffRole, ID: dev.StaffID, Name: dev.StaffName, Email: dev.StaffEmail},
		"permisos":    gin.H{"pos": offlineCanPOS(dev.StaffRole), "examen": offlineCanExam(dev.StaffRole)},
	}
	if offlineCanPOS(dev.StaffRole) {
		productos, err := models.ListOfflineProductos()
		if err != nil {
			log.Printf("offline.Datos productos: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer el inventario."})
			return
		}
		clientes, err := models.ListOfflineClientes()
		if err != nil {
			log.Printf("offline.Datos clientes: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron leer los clientes."})
			return
		}
		out["productos"], out["clientes"] = productos, clientes
	}
	if offlineCanExam(dev.StaffRole) {
		if t, err := models.GetActiveExamTemplate(); err == nil {
			out["plantilla"] = t
		} else if !errors.Is(err, models.ErrExamTemplateNotFound) {
			log.Printf("offline.Datos plantilla: %v", err)
		}
		pacientes, err := models.ListOfflinePacientes()
		if err != nil {
			log.Printf("offline.Datos pacientes: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron leer los pacientes."})
			return
		}
		out["pacientes"] = pacientes
	}
	c.JSON(http.StatusOK, out)
}

type offlineResult struct {
	UUID   string `json:"uuid"`
	OK     bool   `json:"ok"`
	ID     int64  `json:"id,omitempty"`
	Numero string `json:"numero,omitempty"`
	Error  string `json:"error,omitempty"`
}

func offlineErrMsg(err error) string {
	switch {
	case errors.Is(err, models.ErrOfflineBadUUID):
		return "Identificador inválido."
	case errors.Is(err, models.ErrPosClientNotFound):
		return "El cliente de la venta ya no existe."
	}
	msg := err.Error()
	// Errores de validación (en español, de models/offline.go) se muestran tal cual.
	for _, p := range []string{"la venta", "falta cobrar", "para dejar", "el cliente", "el examen", "los datos", "no se pudo asignar"} {
		if strings.HasPrefix(msg, p) {
			return strings.ToUpper(msg[:1]) + msg[1:] + "."
		}
	}
	return "Error del servidor; se reintentará."
}

// OfflineSync — POST /api/offline/sync
func OfflineSync(c *gin.Context) {
	dev := offlineDevice(c)
	var in struct {
		Clientes []models.OfflineClienteIn `json:"clientes"`
		Ventas   []models.OfflineSaleIn    `json:"ventas"`
		Examenes []models.OfflineExamIn    `json:"examenes"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if len(in.Clientes) > offlineMaxBatch || len(in.Ventas) > offlineMaxBatch || len(in.Examenes) > offlineMaxBatch {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Demasiados registros en un solo envío."})
		return
	}
	canPOS, canExam := offlineCanPOS(dev.StaffRole), offlineCanExam(dev.StaffRole)

	clientes := make([]offlineResult, 0, len(in.Clientes))
	for _, cl := range in.Clientes {
		r := offlineResult{UUID: cl.UUID}
		if !canPOS {
			r.Error = "Tu cuenta no puede dar de alta clientes."
		} else if id, num, err := models.SaveOfflineCliente(dev, cl); err != nil {
			log.Printf("offline.Sync cliente %s (%s): %v", cl.UUID, dev.Prefijo, err)
			r.Error = offlineErrMsg(err)
		} else {
			r.OK, r.ID, r.Numero = true, id, num
		}
		clientes = append(clientes, r)
	}

	ventas := make([]offlineResult, 0, len(in.Ventas))
	pedidos := false
	for _, v := range in.Ventas {
		r := offlineResult{UUID: v.UUID}
		if !canPOS {
			r.Error = "Tu cuenta no puede registrar ventas."
		} else if res, err := models.SaveOfflineSale(dev, v); err != nil {
			log.Printf("offline.Sync venta %s %s (%s): %v", v.Folio, v.UUID, dev.Prefijo, err)
			r.Error = offlineErrMsg(err)
		} else {
			r.OK, r.ID = true, res.ID
			if res.Pedido != nil {
				pedidos = true
			}
		}
		ventas = append(ventas, r)
	}
	if pedidos {
		// Le avisa al optometrista: hay ventas para hacer su orden de laboratorio.
		BroadcastLabPendiente()
	}

	examenes := make([]offlineResult, 0, len(in.Examenes))
	for _, e := range in.Examenes {
		r := offlineResult{UUID: e.UUID}
		if !canExam {
			r.Error = "Tu cuenta no puede registrar exámenes."
		} else if id, _, err := models.SaveOfflineExam(dev, e); err != nil {
			log.Printf("offline.Sync examen %s (%s): %v", e.UUID, dev.Prefijo, err)
			r.Error = offlineErrMsg(err)
		} else {
			r.OK, r.ID = true, id
		}
		examenes = append(examenes, r)
	}

	models.TouchOfflineSync(dev.ID)
	c.JSON(http.StatusOK, gin.H{"clientes": clientes, "ventas": ventas, "examenes": examenes})
}
