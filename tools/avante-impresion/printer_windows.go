//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"syscall"
	"unsafe"
)

var (
	winspool = syscall.NewLazyDLL("winspool.drv")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")
	user32   = syscall.NewLazyDLL("user32.dll")

	procOpenPrinter       = winspool.NewProc("OpenPrinterW")
	procClosePrinter      = winspool.NewProc("ClosePrinter")
	procStartDocPrinter   = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter     = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter  = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter    = winspool.NewProc("EndPagePrinter")
	procWritePrinter      = winspool.NewProc("WritePrinter")
	procEnumPrinters      = winspool.NewProc("EnumPrintersW")
	procGetDefaultPrinter = winspool.NewProc("GetDefaultPrinterW")

	procRegOpenKeyEx   = advapi32.NewProc("RegOpenKeyExW")
	procRegSetValueEx  = advapi32.NewProc("RegSetValueExW")
	procRegDeleteValue = advapi32.NewProc("RegDeleteValueW")
	procRegCloseKey    = advapi32.NewProc("RegCloseKey")
	procMessageBox     = user32.NewProc("MessageBoxW")
)

type docInfo1 struct {
	DocName    *uint16
	OutputFile *uint16
	Datatype   *uint16
}

type printerInfo4 struct {
	PrinterName *uint16
	ServerName  *uint16
	Attributes  uint32
}

func u16(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

func lastErr(what string, e error) error {
	if e == nil || e == syscall.Errno(0) {
		return errors.New(what)
	}
	return fmt.Errorf("%s: %v", what, e)
}

// printRaw manda los bytes ESC/POS tal cual al spooler de Windows
// (tipo de dato RAW: el driver no los toca).
func printRaw(printer, name string, data []byte) error {
	var h syscall.Handle
	r, _, e := procOpenPrinter.Call(uintptr(unsafe.Pointer(u16(printer))), uintptr(unsafe.Pointer(&h)), 0)
	if r == 0 {
		return lastErr(fmt.Sprintf("no se encontró la impresora %q", printer), e)
	}
	defer procClosePrinter.Call(uintptr(h))

	di := docInfo1{DocName: u16(name), Datatype: u16("RAW")}
	r, _, e = procStartDocPrinter.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&di)))
	if r == 0 {
		return lastErr("no se pudo iniciar la impresión", e)
	}
	defer procEndDocPrinter.Call(uintptr(h))

	r, _, e = procStartPagePrinter.Call(uintptr(h))
	if r == 0 {
		return lastErr("no se pudo iniciar la página", e)
	}
	defer procEndPagePrinter.Call(uintptr(h))

	for len(data) > 0 {
		var written uint32
		r, _, e = procWritePrinter.Call(uintptr(h), uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)), uintptr(unsafe.Pointer(&written)))
		if r == 0 {
			return lastErr("la impresora no recibió el ticket", e)
		}
		if written == 0 {
			return errors.New("la impresora no recibió el ticket")
		}
		data = data[written:]
	}
	return nil
}

// listPrinters regresa los nombres de las impresoras instaladas
// (locales y compartidas), igual que en el diálogo de Chrome.
func listPrinters() ([]string, error) {
	const flags = 2 | 4 // PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
	var needed, returned uint32
	procEnumPrinters.Call(flags, 0, 4, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return []string{}, nil
	}
	buf := make([]byte, needed)
	r, _, e := procEnumPrinters.Call(flags, 0, 4, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return []string{}, lastErr("no se pudo leer la lista de impresoras", e)
	}
	size := unsafe.Sizeof(printerInfo4{})
	out := make([]string, 0, returned)
	for i := uint32(0); i < returned; i++ {
		pi := (*printerInfo4)(unsafe.Pointer(&buf[uintptr(i)*size]))
		if pi.PrinterName != nil {
			out = append(out, utf16PtrToString(pi.PrinterName))
		}
	}
	return out, nil
}

func defaultPrinter() string {
	var n uint32
	procGetDefaultPrinter.Call(0, uintptr(unsafe.Pointer(&n)))
	if n == 0 {
		return ""
	}
	buf := make([]uint16, n)
	r, _, _ := procGetDefaultPrinter.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n)))
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

func utf16PtrToString(p *uint16) string {
	if p == nil {
		return ""
	}
	var s []uint16
	for ptr := unsafe.Pointer(p); ; ptr = unsafe.Add(ptr, 2) {
		c := *(*uint16)(ptr)
		if c == 0 {
			break
		}
		s = append(s, c)
	}
	return syscall.UTF16ToString(s)
}

/* ---------------- arranque con Windows (HKCU\...\Run) ---------------- */

const (
	hkeyCurrentUser = 0x80000001
	keySetValue     = 0x0002
	regSZ           = 1
	runKey          = `Software\Microsoft\Windows\CurrentVersion\Run`
	runValue        = "AvanteImpresion"
)

func openRunKey() (syscall.Handle, error) {
	var k syscall.Handle
	r, _, _ := procRegOpenKeyEx.Call(hkeyCurrentUser, uintptr(unsafe.Pointer(u16(runKey))), 0, keySetValue, uintptr(unsafe.Pointer(&k)))
	if r != 0 {
		return 0, syscall.Errno(r)
	}
	return k, nil
}

func installAutostart() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	k, err := openRunKey()
	if err != nil {
		return err
	}
	defer procRegCloseKey.Call(uintptr(k))
	val := `"` + exe + `" --background`
	data, _ := syscall.UTF16FromString(val)
	r, _, _ := procRegSetValueEx.Call(uintptr(k), uintptr(unsafe.Pointer(u16(runValue))), 0, regSZ,
		uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)*2))
	if r != 0 {
		return syscall.Errno(r)
	}
	return nil
}

func removeAutostart() error {
	k, err := openRunKey()
	if err != nil {
		return err
	}
	defer procRegCloseKey.Call(uintptr(k))
	r, _, _ := procRegDeleteValue.Call(uintptr(k), uintptr(unsafe.Pointer(u16(runValue))))
	if r != 0 && syscall.Errno(r) != syscall.ERROR_FILE_NOT_FOUND {
		return syscall.Errno(r)
	}
	return nil
}

/* ---------------- aviso en pantalla ---------------- */

func notify(title, msg string) {
	const mbOK, mbIconInfo, mbTopMost = 0x0, 0x40, 0x40000
	procMessageBox.Call(0, uintptr(unsafe.Pointer(u16(strings.ReplaceAll(msg, "\n", "\r\n")))),
		uintptr(unsafe.Pointer(u16(title))), mbOK|mbIconInfo|mbTopMost)
}
