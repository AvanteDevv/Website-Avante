package main

import (
	"html/template"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"avante-optics/auth"
	"avante-optics/db"
	"avante-optics/handlers"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx").

func loadTemplates() *template.Template {
	tmpl := template.Must(template.ParseGlob("templates/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/partials/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/auth/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/client/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/admin/*.html"))
	return tmpl
}

func main() {
	// .env es opcional: en local lo usas para tus credenciales de Railway;
	// en producción (Railway/otro host) las variables ya vienen inyectadas
	// directo al entorno, así que si no hay .env no pasa nada.
	if err := godotenv.Load(); err != nil {
		log.Println("No se encontró .env — usando variables de entorno del sistema.")
	}

	db.Connect()
	defer db.DB.Close()

	auth.InitStore()

	router := gin.Default()

	router.SetHTMLTemplate(loadTemplates())
	router.Static("/static", "./static")
	router.Static("/css", "./static/css")
	router.Static("/js", "./static/js")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"ActivePage": "inicio",
		})
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

	// Vistas del panel de cliente (templates/client/*.html)
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

	// Vistas del panel de administrador (templates/admin/*.html)
	router.GET("/admin/base-de-datos", func(c *gin.Context) {
		c.HTML(http.StatusOK, "base-de-datos.html", gin.H{
			"ActivePage": "admin-base-de-datos",
		})
	})

	// API de autenticación — llamadas desde iniciar-sesion.js / registro.js
	api := router.Group("/api")
	{
		api.POST("/registro", handlers.Register)
		api.POST("/iniciar-sesion", handlers.Login)
	}
	router.GET("/logout", handlers.Logout)

	// Cuando existan tienda.html / blog.html directo en templates/, se
	// agregan aquí de la misma forma:
	//
	// router.GET("/tienda", func(c *gin.Context) {
	// 	c.HTML(http.StatusOK, "eccomerce.html", gin.H{"ActivePage": "tienda"})
	// })
	// router.GET("/blog", func(c *gin.Context) {
	// 	c.HTML(http.StatusOK, "blog.html", gin.H{"ActivePage": "blog"})
	// })

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Servidor corriendo en http://localhost:%s\n", port)
	router.Run(":" + port)
}
