package main

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"avante-optics/auth"
	"avante-optics/db"
	"avante-optics/handlers"
	adminHandlers "avante-optics/handlers/admin"
	"avante-optics/storage"
)

// ⚠️ Adjust "avante-optics" in the imports above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// spanishMonths maps month number (1-12) to its Spanish name, so we don't
// need an external localization package just for this.
var spanishMonths = [...]string{
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
}

// spanishDate formats a date as "4 de agosto de 2026", used in templates
// via {{fechaEs .CreatedAt}}.
func spanishDate(t time.Time) string {
	return fmt.Sprintf("%d de %s de %d", t.Day(), spanishMonths[t.Month()-1], t.Year())
}

// spanishDateTime formats a date+time as "4 ago 2026, 14:30", used in
// templates via {{fechaHoraEs .StartAt}}.
func spanishDateTime(t time.Time) string {
	if t.IsZero() {
		return "—"
	}
	mesCorto := spanishMonths[t.Month()-1][:3]
	return fmt.Sprintf("%d %s %d, %02d:%02d", t.Day(), mesCorto, t.Year(), t.Hour(), t.Minute())
}
func loadTemplates() *template.Template {
	funcs := template.FuncMap{
		"fechaEs":     spanishDate,
		"fechaHoraEs": spanishDateTime,
	}
	tmpl := template.Must(template.New("base").Funcs(funcs).ParseGlob("templates/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/partials/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/auth/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/client/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/admin/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/auth-admin/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/ecommerce/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/pages/*.html"))
	return tmpl
}

func main() {
	// .env is optional: locally you use it for your Railway credentials;
	// in production (Railway/another host) the variables are already injected
	// directly into the environment, so if there is no .env, nothing happens.
	if err := godotenv.Load(); err != nil {
		log.Println("No se encontró .env — usando variables de entorno del sistema.")
	}

	db.Connect()
	defer db.DB.Close()

	storage.Connect()

	auth.InitStore()

	router := gin.Default()

	router.SetHTMLTemplate(loadTemplates())
	router.Static("/static", "./static")
	router.Static("/css", "./static/css")
	router.Static("/js", "./static/js")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", handlers.WithUser(c, gin.H{
			"ActivePage": "inicio",
			"AdMainURL":  handlers.ActiveAdImage("main"),
			"AdSide1URL": handlers.ActiveAdImage("side1"),
			"AdSide2URL": handlers.ActiveAdImage("side2"),
		}))
	})

	router.GET("/iniciar-sesion", func(c *gin.Context) {
		c.HTML(http.StatusOK, "iniciar-sesion.html", gin.H{
			"ActivePage": "iniciar-sesion",
		})
	})

	router.GET("/registro", func(c *gin.Context) {
		c.HTML(http.StatusOK, "registro.html", gin.H{
			"ActivePage": "registro",
		})
	})

	// Client panel views (templates/client/*.html)
	router.GET("/dashboard", func(c *gin.Context) {
		c.HTML(http.StatusOK, "dashboard.html", gin.H{
			"ActivePage": "dashboard",
		})
	})
	router.GET("/mis-favoritos", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mis-favoritos.html", gin.H{
			"ActivePage": "mis-favoritos",
		})
	})
	router.GET("/mis-pedidos", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mis-pedidos.html", gin.H{
			"ActivePage": "mis-pedidos",
		})
	})
	router.GET("/mi-perfil", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mi-perfil.html", gin.H{
			"ActivePage": "mi-perfil",
		})
	})
	router.GET("/mis-citas", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mis-citas.html", gin.H{
			"ActivePage": "mis-citas",
		})
	})
	router.GET("/configuracion", func(c *gin.Context) {
		c.HTML(http.StatusOK, "configuracion.html", gin.H{
			"ActivePage": "configuracion",
		})
	})

	// Admin panel views (templates/admin/*.html) — all of them
	// protected by RequireAdminAuth, except the login itself.
	router.GET("/admin/iniciar-sesion", func(c *gin.Context) {
		c.HTML(http.StatusOK, "admin-login.html", gin.H{
			"ActivePage": "admin-iniciar-sesion",
		})
	})

	adminGroup := router.Group("/admin", handlers.RequireAdminAuth())
	{
		adminGroup.GET("/base-de-datos", adminHandlers.Database)
		adminGroup.GET("/anuncios", adminHandlers.Ads)
		adminGroup.GET("/citas", adminHandlers.Appointments)
		adminGroup.PATCH("/citas/:id/estado", adminHandlers.UpdateAppointmentStatus)
		adminGroup.DELETE("/citas/:id", adminHandlers.DeleteAppointment)
		adminGroup.GET("/configuracion", adminHandlers.Settings)
		adminGroup.POST("/configuracion/horarios", adminHandlers.UpdateAgendaHours)
		adminGroup.GET("/pedidos", func(c *gin.Context) {
			c.HTML(http.StatusOK, "pedidos.html", gin.H{
				"ActivePage": "admin-pedidos",
			})
		})
	}

	// Auth API — called from iniciar-sesion.js / registro.js
	api := router.Group("/api")
	{
		api.POST("/registro", handlers.Register)
		api.POST("/iniciar-sesion", handlers.Login)
		api.POST("/admin/iniciar-sesion", handlers.AdminLogin)
		api.POST("/agendar", handlers.CreateAppointment)
		api.POST("/agendar/codigo", handlers.SendVerificationCode)
		api.POST("/agendar/verificar", handlers.VerifyCode)
		api.GET("/horarios/ocupadas", handlers.GetOccupiedHours)
		api.GET("/horarios", handlers.GetAgendaHours)
		api.POST("/pedidos", handlers.CreatePedido)
	}

	// Admin JSON API — called from pedidos.js to fill the Pedidos table
	apiAdmin := router.Group("/api/admin", handlers.RequireAdminAuth())
	{
		apiAdmin.GET("/pedidos", adminHandlers.ListOrders)
		apiAdmin.PATCH("/pedidos/:id/estado", adminHandlers.UpdateOrderStatus)
		apiAdmin.DELETE("/pedidos/:id", adminHandlers.DeleteOrder)
		apiAdmin.GET("/estados", adminHandlers.ListStatusOptions)
		apiAdmin.POST("/estados", adminHandlers.CreateStatusOption)
		apiAdmin.PUT("/estados/:id", adminHandlers.UpdateStatusOption)
		apiAdmin.DELETE("/estados/:id", adminHandlers.DeleteStatusOption)
		apiAdmin.GET("/pedidos/configuracion", adminHandlers.GetOrderSettings)
		apiAdmin.PUT("/pedidos/configuracion", adminHandlers.UpdateOrderSettingsHandler)
		apiAdmin.POST("/usuarios", adminHandlers.CreateUser)
		apiAdmin.PUT("/usuarios/:id", adminHandlers.UpdateUser)
		apiAdmin.DELETE("/usuarios/:id", adminHandlers.DeleteUser)
		apiAdmin.POST("/anuncios", adminHandlers.CreateAd)
		apiAdmin.PUT("/anuncios/:id", adminHandlers.UpdateAd)
		apiAdmin.DELETE("/anuncios/:id", adminHandlers.DeleteAd)
	}
	router.GET("/media/promos/:key", handlers.ServeAdImage)
	router.GET("/logout", handlers.Logout)
	router.GET("/admin/logout", handlers.AdminLogout)

	// Online store (templates/ecommerce/*.html)
	router.GET("/eccomerce", func(c *gin.Context) {
		c.HTML(http.StatusOK, "ecommerce.html", handlers.WithUser(c, gin.H{
			"ActivePage": "tienda",
		}))
	})
	router.GET("/eccomerce/:producto", func(c *gin.Context) {
		c.HTML(http.StatusOK, "detalle-producto.html", handlers.WithUser(c, gin.H{
			"ActivePage": "tienda",
			"Producto":   c.Param("producto"),
		}))
	})

	// Standalone pages (templates/pages/*.html)
	router.GET("/blog", func(c *gin.Context) {
		c.HTML(http.StatusOK, "blog.html", handlers.WithUser(c, gin.H{
			"ActivePage": "blog",
		}))
	})
	router.GET("/agendar", func(c *gin.Context) {
		c.HTML(http.StatusOK, "agendar.html", handlers.WithUser(c, gin.H{
			"ActivePage": "agendar",
		}))
	})
	router.GET("/carrito", func(c *gin.Context) {
		c.HTML(http.StatusOK, "carrito.html", handlers.WithUser(c, gin.H{
			"ActivePage": "carrito",
		}))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Servidor corriendo en http://localhost:%s\n", port)
	router.Run(":" + port)
}
