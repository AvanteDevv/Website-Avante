//go:build !windows

package main

// Versión de prueba para Linux/Mac: no imprime, guarda el ticket en
// un archivo .bin junto al programa para poder revisarlo.

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

func printRaw(printer, name string, data []byte) error {
	if printer != "Prueba" && printer != "WL88S" {
		return fmt.Errorf("no se encontró la impresora %q", printer)
	}
	exe, _ := os.Executable()
	safe := regexp.MustCompile(`[^A-Za-z0-9_-]+`).ReplaceAllString(name, "_")
	p := filepath.Join(filepath.Dir(exe), fmt.Sprintf("ticket-%s-%d.bin", safe, time.Now().UnixNano()))
	return os.WriteFile(p, data, 0o644)
}

func listPrinters() ([]string, error) { return []string{"Canon GX6000 series", "WL88S", "Prueba"}, nil }
func defaultPrinter() string          { return "Canon GX6000 series" }
func installAutostart() error         { return nil }
func removeAutostart() error          { return nil }
func notify(title, msg string)        { log.Printf("[%s] %s", title, msg) }
