package main

import (
	"html/template"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func loadTemplates() *template.Template {
	tmpl := template.Must(template.ParseGlob("templates/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/partials/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/auth/*.html"))
	return tmpl
}

func main() {
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

	log.Println("Servidor corriendo en http://localhost:8080")
	router.Run(":8080")
}
