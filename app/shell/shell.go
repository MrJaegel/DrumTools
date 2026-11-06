// Package shell runs one of the drum tools as a stand-alone Windows program.
//
// The interface is the same web page as the online version, shown in the
// WebView2 component (Microsoft Edge) that ships with Windows 10 and 11.
// Saving goes through the real Windows dialogs (Save As / choose folder), and
// the last folder and the page's settings are remembered in
// %APPDATA%\<program>\settings.json. Nothing is installed.
//
// Copyright 2026 Michael Zacho Kristensen (MrJaegel). PolyForm Shield 1.0.0, see LICENSE.txt.

//go:build windows

package shell

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"

	"github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
	"golang.org/x/sys/windows"
)

// lang is "en" or "da": the language of the program's own dialogs (follows the page)
var lang = "en"

// tx picks the Danish or English text
func tx(da, en string) string {
	if lang == "en" {
		return en
	}
	return da
}

// appName is the window title and the settings folder name
var appName = "Drum tool"

var (
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	comdlg32 = windows.NewLazySystemDLL("comdlg32.dll")
	user32   = windows.NewLazySystemDLL("user32.dll")
	ole32    = windows.NewLazySystemDLL("ole32.dll")

	procSHBrowseForFolderW    = shell32.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDListW  = shell32.NewProc("SHGetPathFromIDListW")
	procGetSaveFileNameW      = comdlg32.NewProc("GetSaveFileNameW")
	procCommDlgExtendedError  = comdlg32.NewProc("CommDlgExtendedError")
	procMessageBoxW           = user32.NewProc("MessageBoxW")
	procSendMessageW          = user32.NewProc("SendMessageW")
	procCoTaskMemFree         = ole32.NewProc("CoTaskMemFree")
	browseCallback            = syscall.NewCallback(browseCallbackProc)
	browseStartDir            *uint16
)

// ---- settings ----------------------------------------------------------------------

type settings struct {
	LastFolder string `json:"lastFolder"`
	PagePrefs  string `json:"pagePrefs,omitempty"` // the page's own settings (humanizing), as JSON text
}

func settingsPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, appName, "settings.json")
}

func loadSettings() settings {
	var s settings
	if p := settingsPath(); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			_ = json.Unmarshal(b, &s)
		}
	}
	if s.LastFolder == "" {
		if home, err := os.UserHomeDir(); err == nil {
			s.LastFolder = filepath.Join(home, "Documents")
		}
	}
	return s
}

func saveSettings(s settings) {
	p := settingsPath()
	if p == "" {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	b, _ := json.MarshalIndent(s, "", "  ")
	_ = os.WriteFile(p, b, 0o644)
}

// ---- Windows dialogs ---------------------------------------------------------------

type browseInfo struct {
	HwndOwner      uintptr
	PidlRoot       uintptr
	PszDisplayName *uint16
	LpszTitle      *uint16
	UlFlags        uint32
	Lpfn           uintptr
	LParam         uintptr
	IImage         int32
}

const (
	bifReturnOnlyFsDirs = 0x0001
	bifEditBox          = 0x0010
	bifNewDialogStyle   = 0x0040
	bffmInitialized     = 1
	bffmSetSelectionW   = 0x0400 + 103
)

func browseCallbackProc(hwnd, msg, lp, data uintptr) uintptr {
	if msg == bffmInitialized && browseStartDir != nil {
		procSendMessageW.Call(hwnd, bffmSetSelectionW, 1, uintptr(unsafe.Pointer(browseStartDir)))
	}
	return 0
}

// pickFolder shows the Windows folder dialog. Returns "" if cancelled.
func pickFolder(owner uintptr, title, start string) string {
	display := make([]uint16, windows.MAX_PATH)
	t, _ := windows.UTF16PtrFromString(title)
	browseStartDir, _ = windows.UTF16PtrFromString(start)
	bi := browseInfo{
		HwndOwner:      owner,
		PszDisplayName: &display[0],
		LpszTitle:      t,
		UlFlags:        bifReturnOnlyFsDirs | bifNewDialogStyle | bifEditBox,
		Lpfn:           browseCallback,
	}
	pidl, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl == 0 {
		return ""
	}
	defer procCoTaskMemFree.Call(pidl)
	path := make([]uint16, 32768)
	ok, _, _ := procSHGetPathFromIDListW.Call(pidl, uintptr(unsafe.Pointer(&path[0])))
	if ok == 0 {
		return ""
	}
	return windows.UTF16ToString(path)
}

type openFileName struct {
	LStructSize       uint32
	HwndOwner         uintptr
	HInstance         uintptr
	LpstrFilter       *uint16
	LpstrCustomFilter *uint16
	NMaxCustFilter    uint32
	NFilterIndex      uint32
	LpstrFile         *uint16
	NMaxFile          uint32
	LpstrFileTitle    *uint16
	NMaxFileTitle     uint32
	LpstrInitialDir   *uint16
	LpstrTitle        *uint16
	Flags             uint32
	NFileOffset       uint16
	NFileExtension    uint16
	LpstrDefExt       *uint16
	LCustData         uintptr
	LpfnHook          uintptr
	LpTemplateName    *uint16
	PvReserved        uintptr
	DwReserved        uint32
	FlagsEx           uint32
}

const (
	ofnOverwritePrompt = 0x00000002
	ofnNoChangeDir     = 0x00000008
	ofnPathMustExist   = 0x00000800
	ofnExplorer        = 0x00080000
)

// utf16z turns a Go string into a zero-terminated UTF-16 buffer. Unlike
// windows.StringToUTF16 it keeps NUL characters inside the text, which the
// file-type filter of the save dialog needs ("MIDI file\x00*.mid\x00...").
func utf16z(s string) []uint16 {
	return append(utf16.Encode([]rune(s)), 0)
}

// saveAs shows the Windows "Gem som" dialog. Returns "" if cancelled.
func saveAs(owner uintptr, name, startDir, titleText, filterText, defExt string) (string, error) {
	file := make([]uint16, 32768)
	copy(file[:len(file)-1], utf16z(name))
	filter := utf16z(filterText)
	title, _ := windows.UTF16PtrFromString(titleText)
	ext, _ := windows.UTF16PtrFromString(defExt)
	dir, _ := windows.UTF16PtrFromString(startDir)
	ofn := openFileName{
		HwndOwner:       owner,
		LpstrFilter:     &filter[0],
		NFilterIndex:    1,
		LpstrFile:       &file[0],
		NMaxFile:        uint32(len(file)),
		LpstrInitialDir: dir,
		LpstrTitle:      title,
		Flags:           ofnOverwritePrompt | ofnNoChangeDir | ofnPathMustExist | ofnExplorer,
		LpstrDefExt:     ext,
	}
	ofn.LStructSize = uint32(unsafe.Sizeof(ofn))
	ok, _, _ := procGetSaveFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	if ok == 0 {
		if code, _, _ := procCommDlgExtendedError.Call(); code != 0 {
			return "", errors.New(tx("Windows kunne ikke åbne gem-vinduet", "Windows could not open the save window"))
		}
		return "", nil
	}
	return windows.UTF16ToString(file), nil
}

func messageBox(text, title string, flags uintptr) {
	t, _ := windows.UTF16PtrFromString(text)
	c, _ := windows.UTF16PtrFromString(title)
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
}

// ---- saving ------------------------------------------------------------------------

type midiFile struct {
	Name string `json:"name"`
	Data string `json:"data"` // base64
}

type result struct {
	Path      string `json:"path,omitempty"`
	Error     string `json:"error,omitempty"`
	Cancelled bool   `json:"cancelled,omitempty"`
}

// cleanName keeps a file or folder name valid on Windows.
func cleanName(s string) string {
	s = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, s)
	s = strings.TrimRight(strings.TrimSpace(s), ".")
	if s == "" {
		s = "sektion"
	}
	return s
}

func writeFolder(base, sub string, files []midiFile) result {
	dir := filepath.Join(base, cleanName(sub))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return result{Error: err.Error()}
	}
	for _, f := range files {
		data, err := base64.StdEncoding.DecodeString(f.Data)
		if err != nil {
			return result{Error: tx("ugyldige data i ", "invalid data in ") + f.Name}
		}
		if err := os.WriteFile(filepath.Join(dir, cleanName(f.Name)), data, 0o644); err != nil {
			return result{Error: err.Error()}
		}
	}
	return result{Path: dir}
}

// ---- main --------------------------------------------------------------------------

// openWithWindows opens a file or a web address with the program Windows uses for it
func openWithWindows(target string) error {
	verb, _ := windows.UTF16PtrFromString("open")
	t, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	return windows.ShellExecute(0, verb, t, nil, nil, windows.SW_SHOWNORMAL)
}

// Run starts the program. name is the window title, page the complete HTML page.
func Run(name, page string) {
	appName = name
	cfg := loadSettings()

	// Language: the one saved with the page settings, otherwise English
	var saved struct {
		Lang string `json:"lang"`
	}
	if json.Unmarshal([]byte(cfg.PagePrefs), &saved) == nil && (saved.Lang == "da" || saved.Lang == "en") {
		lang = saved.Lang
	}

	// WebView2Loader.dll (from Microsoft) must sit next to the program
	if _, err := os.Stat(webviewloader.LoaderPath); err != nil {
		messageBox(tx("WebView2Loader.dll mangler.\n\nDen skal ligge i samme mappe som "+appName+".exe. "+
			"Pak hele zip-filen ud, og start programmet fra den udpakkede mappe.",
			"WebView2Loader.dll is missing.\n\nIt must be in the same folder as "+appName+".exe. "+
				"Extract the whole zip file and start the program from the extracted folder."), appName, 0x10)
		return
	}

	dataDir := ""
	if d, err := os.UserCacheDir(); err == nil { // %LOCALAPPDATA%
		dataDir = filepath.Join(d, appName, "WebView2")
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  dataDir,
		WindowOptions: webview2.WindowOptions{
			Title:  appName,
			Width:  1180,
			Height: 900,
			IconId: 2,
			Center: true,
		},
	})
	if w == nil {
		messageBox(tx(appName+" skal bruge Microsoft Edge WebView2, som normalt følger med Windows 10 og 11.\n\n"+
			"Den ser ud til at mangle på denne computer. Hent \"Evergreen Bootstrapper\" fra\n"+
			"developer.microsoft.com/microsoft-edge/webview2 og start programmet igen.",
			appName+" needs Microsoft Edge WebView2, which normally comes with Windows 10 and 11.\n\n"+
				"It seems to be missing on this computer. Get the \"Evergreen Bootstrapper\" from\n"+
				"developer.microsoft.com/microsoft-edge/webview2 and start the program again."),
			appName, 0x10)
		return
	}
	defer w.Destroy()
	w.SetSize(900, 600, webview2.HintMin)
	owner := uintptr(w.Window())

	// The page calls these and gets the answer through window.__nativeResult.
	// The dialogs run from the main loop (Dispatch), not inside the WebView2
	// message handler, so the window keeps painting while a dialog is open.
	reply := func(r result) {
		b, _ := json.Marshal(r)
		w.Eval("window.__nativeResult && window.__nativeResult(" + string(b) + ")")
	}
	// safely runs a save action: if anything goes wrong, show it on the page
	// instead of letting the program close
	safely := func(f func()) func() {
		return func() {
			defer func() {
				if r := recover(); r != nil {
					reply(result{Error: fmt.Sprint(r)})
				}
			}()
			f()
		}
	}

	_ = w.Bind("nativeSaveFolder", func(sub string, files []midiFile) {
		w.Dispatch(safely(func() {
			base := pickFolder(owner, tx("Vælg mappen hvor sektionerne skal gemmes.\nDer laves en undermappe: ", "Choose the folder where the sections will be saved.\nA subfolder is created: ")+cleanName(sub), cfg.LastFolder)
			if base == "" {
				reply(result{Cancelled: true})
				return
			}
			cfg.LastFolder = base
			saveSettings(cfg)
			reply(writeFolder(base, sub, files))
		}))
	})

	saveOne := func(name, data, title, filter, ext string) {
		w.Dispatch(safely(func() {
			path, err := saveAs(owner, cleanName(name), cfg.LastFolder, title, filter, ext)
			if err != nil {
				reply(result{Error: err.Error()})
				return
			}
			if path == "" {
				reply(result{Cancelled: true})
				return
			}
			bytes, err := base64.StdEncoding.DecodeString(data)
			if err != nil {
				reply(result{Error: tx("ugyldige data", "invalid data")})
				return
			}
			if err := os.WriteFile(path, bytes, 0o644); err != nil {
				reply(result{Error: err.Error()})
				return
			}
			cfg.LastFolder = filepath.Dir(path)
			saveSettings(cfg)
			reply(result{Path: path})
		}))
	}
	_ = w.Bind("nativeSaveZip", func(name string, data string) {
		saveOne(name, data, tx("Gem sektioner som zip", "Save sections as zip"), tx("Zip-fil (*.zip)", "Zip file (*.zip)")+"\x00*.zip\x00"+tx("Alle filer", "All files")+"\x00*.*\x00", "zip")
	})
	_ = w.Bind("nativeSaveFile", func(name string, data string) {
		saveOne(name, data, tx("Gem MIDI-fil", "Save MIDI file"), tx("MIDI-fil (*.mid)", "MIDI file (*.mid)")+"\x00*.mid;*.midi\x00"+tx("Alle filer", "All files")+"\x00*.*\x00", "mid")
	})

	// The page's settings (humanizing) are kept with the program's other settings
	// Help: "<program> Help.html" next to the program, opened in the normal browser
	_ = w.Bind("nativeOpenHelp", func() string {
		exe, err := os.Executable()
		if err != nil {
			return err.Error()
		}
		help := filepath.Join(filepath.Dir(exe), appName+" Help.html")
		if _, err := os.Stat(help); err != nil {
			return tx("Hjælpefilen mangler: ", "The help file is missing: ") + help
		}
		if err := openWithWindows(help); err != nil {
			return err.Error()
		}
		return ""
	})
	// Web links (donate, shop, source code) open in the normal browser
	_ = w.Bind("nativeOpenURL", func(url string) string {
		if !strings.HasPrefix(url, "https://") {
			return "only https links"
		}
		if err := openWithWindows(url); err != nil {
			return err.Error()
		}
		return ""
	})
	_ = w.Bind("nativeSetLang", func(l string) {
		if l == "da" || l == "en" {
			lang = l
		}
	})
	_ = w.Bind("nativeLoadPrefs", func() string { return cfg.PagePrefs })
	_ = w.Bind("nativeSavePrefs", func(json string) {
		cfg.PagePrefs = json
		saveSettings(cfg)
	})

	w.SetHtml(page)
	w.Run()
}
