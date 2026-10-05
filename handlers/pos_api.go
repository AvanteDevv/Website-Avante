package handlers

import (
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// API del Punto de venta (Recepción → Punto de venta):
//
//	GET    /api/receptionist/pos/clientes?q=          buscar clientes (con su saldo)
//	GET    /api/receptionist/pos/clientes/siguiente   siguiente No. de cliente
//	POST   /api/receptionist/pos/clientes             nuevo cliente
//	PUT    /api/receptionist/pos/clientes/:id         editar cliente
//	GET    /api/receptionist/pos/clientes/:id/creditos  créditos y abonos del cliente
//	GET    /api/receptionist/pos/clientes/:id/ultima-venta  último ticket del cliente (reimprimir)
//	POST   /api/receptionist/pos/ventas               cobrar (guarda la venta y descuenta inventario)
//	POST   /api/receptionist/pos/creditos/:id/abonos  abonar a un crédito
//	DELETE /api/receptionist/pos/abonos/:id           cancelar un abono (mismo día)

var posNumeroRe = regexp.MustCompile(`^[A-Za-z0-9-]{1,20}$`)

func posStaffName(c *gin.Context) string {
	v, _ := c.Get("staff_name")
	s, _ := v.(string)
	return s
}

func posID(c *gin.Context, name string) (int64, bool) {
	id, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Identificador inválido."})
		return 0, false
	}
	return id, true
}

// PosListClients — GET /api/receptionist/pos/clientes?q=
func PosListClients(c *gin.Context) {
	items, err := models.ListPosClients(c.Query("q"), 60)
	if err != nil {
		log.Printf("pos.ListClients: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los clientes."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "hoy": models.PosToday()})
}

// PosNextClientNumero — GET /api/receptionist/pos/clientes/siguiente
func PosNextClientNumero(c *gin.Context) {
	n, err := models.NextPosClientNumero()
	if err != nil {
		log.Printf("pos.NextClientNumero: %v", err)
	}
	c.JSON(http.StatusOK, gin.H{"numero": n})
}

// posClientInput — lo que llega al crear o editar un cliente.
type posClientInput struct {
	Numero        string  `json:"numero"`
	Clave         string  `json:"clave"`
	Nombre        string  `json:"nombre"`
	Celular       string  `json:"celular"`
	Representante string  `json:"representante"`
	Dias          int     `json:"dias"`
	Limite        float64 `json:"limite"`
}

var posCelularRe = regexp.MustCompile(`^\d{10}$`)

// bindPosClient lee y valida los datos del cliente. Si algo está mal ya
// respondió al navegador y regresa ok=false.
func bindPosClient(c *gin.Context) (models.PosClient, bool) {
	var in posClientInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return models.PosClient{}, false
	}
	in.Numero = strings.TrimSpace(in.Numero)
	in.Nombre = strings.Join(strings.Fields(in.Nombre), " ")
	in.Clave = strings.ToUpper(strings.TrimSpace(in.Clave))
	in.Celular = strings.TrimSpace(in.Celular)
	switch {
	case !posNumeroRe.MatchString(in.Numero):
		c.JSON(http.StatusBadRequest, gin.H{"error": "El No. de cliente solo puede llevar letras, números y guiones."})
		return models.PosClient{}, false
	case in.Nombre == "":
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe el nombre del cliente."})
		return models.PosClient{}, false
	case in.Celular != "" && !posCelularRe.MatchString(in.Celular):
		c.JSON(http.StatusBadRequest, gin.H{"error": "El celular debe tener 10 dígitos."})
		return models.PosClient{}, false
	case in.Dias < 0 || in.Dias > 365 || in.Limite < 0:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa los días y el límite de crédito."})
		return models.PosClient{}, false
	}
	return models.PosClient{
		Numero: in.Numero, Clave: in.Clave, Nombre: in.Nombre, Celular: in.Celular,
		Representante: strings.TrimSpace(in.Representante), DiasCredito: in.Dias, LimiteCredito: in.Limite,
	}, true
}

// PosCreateClient — POST /api/receptionist/pos/clientes
func PosCreateClient(c *gin.Context) {
	in, ok := bindPosClient(c)
	if !ok {
		return
	}
	cl, err := models.CreatePosClient(in, posStaffName(c))
	if errors.Is(err, models.ErrPosClientDuplicate) {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe el cliente No. " + in.Numero + "."})
		return
	}
	if err != nil {
		log.Printf("pos.CreateClient: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el cliente."})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"item": cl})
}

// PosUpdateClient — PUT /api/receptionist/pos/clientes/:id
func PosUpdateClient(c *gin.Context) {
	id, ok := posID(c, "id")
	if !ok {
		return
	}
	in, ok := bindPosClient(c)
	if !ok {
		return
	}
	cl, err := models.UpdatePosClient(id, in)
	switch {
	case errors.Is(err, models.ErrPosClientDuplicate):
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe otro cliente con el No. " + in.Numero + "."})
		return
	case errors.Is(err, models.ErrPosClientNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese cliente ya no existe."})
		return
	case err != nil:
		log.Printf("pos.UpdateClient: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron guardar los cambios."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": cl})
}

// PosClientCredits — GET /api/receptionist/pos/clientes/:id/creditos
func PosClientCredits(c *gin.Context) {
	id, ok := posID(c, "id")
	if !ok {
		return
	}
	cl, err := models.GetPosClient(id)
	if errors.Is(err, models.ErrPosClientNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese cliente ya no existe."})
		return
	}
	if err != nil {
		log.Printf("pos.ClientCredits: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el cliente."})
		return
	}
	credits, err := models.ListPosClientCredits(id)
	if err != nil {
		log.Printf("pos.ClientCredits: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los créditos."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"cliente": cl, "creditos": credits, "hoy": models.PosToday()})
}

// PosCreateSale — POST /api/receptionist/pos/ventas
func PosCreateSale(c *gin.Context) {
	var in struct {
		ClientID   int64                `json:"client_id"`
		Items      []models.PosSaleItem `json:"productos"`
		Pagos      models.PosPayments   `json:"pagos"`
		Referencia string               `json:"referencia"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || len(in.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La venta no trae productos."})
		return
	}
	ref := strings.TrimSpace(in.Referencia)
	if len(ref) > 80 {
		ref = ref[:80]
	}
	sale, err := models.CreatePosSale(models.PosSale{
		ClientID: in.ClientID, Cajero: posStaffName(c), Items: in.Items, Pagos: in.Pagos, Referencia: ref,
	})
	if err != nil {
		var se *models.PosStockError
		switch {
		case errors.As(err, &se):
			c.JSON(http.StatusConflict, gin.H{"error": "Solo hay " + strconv.Itoa(se.Disponible) + " en existencia de " + se.Descripcion + "."})
		case errors.Is(err, models.ErrPosClientNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "Ese cliente ya no existe."})
		case errors.Is(err, models.ErrPosCreditLimit):
			c.JSON(http.StatusBadRequest, gin.H{"error": "El crédito pasa del límite del cliente (" + strings.TrimPrefix(err.Error(), models.ErrPosCreditLimit.Error()+": ") + ")."})
		case strings.HasPrefix(err.Error(), "tarjeta") || strings.HasPrefix(err.Error(), "falta") ||
			strings.HasPrefix(err.Error(), "para dejar") || strings.HasPrefix(err.Error(), "un producto"):
			msg := err.Error()
			c.JSON(http.StatusBadRequest, gin.H{"error": strings.ToUpper(msg[:1]) + msg[1:] + "."})
		default:
			log.Printf("pos.CreateSale: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la venta. Intenta de nuevo."})
		}
		return
	}
	c.JSON(http.StatusCreated, gin.H{"venta": sale})
}

// PosAddPayment — POST /api/receptionist/pos/creditos/:id/abonos
func PosAddPayment(c *gin.Context) {
	id, ok := posID(c, "id")
	if !ok {
		return
	}
	var in struct {
		Monto      float64 `json:"monto"`
		FormaPago  string  `json:"forma_pago"`
		Referencia string  `json:"referencia"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Monto <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe cuánto abona."})
		return
	}
	if !models.IsPosFormaPago(in.FormaPago) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige la forma de pago."})
		return
	}
	ref := strings.TrimSpace(in.Referencia)
	if len(ref) > 80 {
		ref = ref[:80]
	}
	r, err := models.AddPosCreditPayment(id, in.Monto, in.FormaPago, ref, posStaffName(c))
	switch {
	case errors.Is(err, models.ErrPosCreditNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese crédito ya no existe."})
	case errors.Is(err, models.ErrPosPaymentTooBig):
		c.JSON(http.StatusBadRequest, gin.H{"error": "El abono no puede ser mayor que el saldo."})
	case err != nil:
		log.Printf("pos.AddPayment: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el abono."})
	default:
		c.JSON(http.StatusCreated, r)
	}
}

// PosCancelPayment — DELETE /api/receptionist/pos/abonos/:id
func PosCancelPayment(c *gin.Context) {
	id, ok := posID(c, "id")
	if !ok {
		return
	}
	r, err := models.CancelPosCreditPayment(id, posStaffName(c))
	switch {
	case errors.Is(err, models.ErrPosPaymentNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese abono ya no existe."})
	case errors.Is(err, models.ErrPosPaymentNotToday):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Solo se pueden cancelar abonos del mismo día."})
	case errors.Is(err, models.ErrPosPaymentCancelled):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ese abono ya estaba cancelado."})
	case err != nil:
		log.Printf("pos.CancelPayment: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cancelar el abono."})
	default:
		c.JSON(http.StatusOK, r)
	}
}

var posDateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// PosListSales — GET /api/receptionist/pos/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&q=&estado=
// (Recepción → Ventas). Sin fechas: las de hoy.
func PosListSales(c *gin.Context) {
	f := models.PosSalesFilter{Desde: c.Query("desde"), Hasta: c.Query("hasta"), Q: c.Query("q"), Estado: c.Query("estado")}
	if f.Desde == "" && f.Hasta == "" {
		f.Desde, f.Hasta = models.PosToday(), models.PosToday()
	}
	if (f.Desde != "" && !posDateRe.MatchString(f.Desde)) || (f.Hasta != "" && !posDateRe.MatchString(f.Hasta)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fechas inválidas."})
		return
	}
	items, totals, err := models.ListPosSales(f, 1000)
	if err != nil {
		log.Printf("pos.ListSales: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar las ventas."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "totales": totals, "hoy": models.PosToday(), "desde": f.Desde, "hasta": f.Hasta})
}

// PosGetSale — GET /api/receptionist/pos/ventas/:id  (detalle: productos, pagos y abonos)
func PosGetSale(c *gin.Context) {
	id, ok := posID(c, "id")
	if !ok {
		return
	}
	d, err := models.GetPosSale(id)
	if errors.Is(err, models.ErrPosSaleNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "No existe el ticket " + strconv.FormatInt(id, 10) + "."})
		return
	}
	if err != nil {
		log.Printf("pos.GetSale: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la venta."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"venta": d})
}

// PosClientLastSale — GET /api/receptionist/pos/clientes/:id/ultima-venta
// La venta más reciente del cliente, con todo lo que lleva el ticket.
func PosClientLastSale(c *gin.Context) {
	id, ok := posID(c, "id")
	if !ok {
		return
	}
	d, err := models.LastPosSaleOfClient(id)
	if errors.Is(err, models.ErrPosSaleNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Este cliente todavía no tiene ventas."})
		return
	}
	if err != nil {
		log.Printf("pos.ClientLastSale: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar su última venta."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"venta": d})
}
