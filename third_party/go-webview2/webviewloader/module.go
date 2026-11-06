package webviewloader

// Local change for Trommesplitter / Trommehumanizer / Trommetiming:
// WebView2Loader.dll is loaded only from disk, from the folder the program is
// in. The original package also carried an embedded copy of the DLL that it
// mapped into memory by hand; that technique is common in malware and makes
// some virus scanners flag the program, so it is removed here.

import (
	"fmt"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

// LoaderPath is where WebView2Loader.dll is expected: next to the program.
var LoaderPath = func() string {
	exe, err := os.Executable()
	if err != nil {
		return "WebView2Loader.dll"
	}
	return filepath.Join(filepath.Dir(exe), "WebView2Loader.dll")
}()

var (
	nativeModule                                       = windows.NewLazyDLL(LoaderPath)
	nativeCreate                                       = nativeModule.NewProc("CreateCoreWebView2EnvironmentWithOptions")
	nativeCompareBrowserVersions                       = nativeModule.NewProc("CompareBrowserVersions")
	nativeGetAvailableCoreWebView2BrowserVersionString = nativeModule.NewProc("GetAvailableCoreWebView2BrowserVersionString")
)

func load(p *windows.LazyProc) error {
	if err := nativeModule.Load(); err != nil {
		return fmt.Errorf("Unable to load %s: %w", LoaderPath, err)
	}
	return p.Find()
}

// CompareBrowserVersions will compare the 2 given versions and return:
//
//	-1 = v1 < v2
//	 0 = v1 == v2
//	 1 = v1 > v2
func CompareBrowserVersions(v1 string, v2 string) (int, error) {
	_v1, err := windows.UTF16PtrFromString(v1)
	if err != nil {
		return 0, err
	}
	_v2, err := windows.UTF16PtrFromString(v2)
	if err != nil {
		return 0, err
	}
	if err := load(nativeCompareBrowserVersions); err != nil {
		return 0, err
	}
	var result int
	_, _, err = nativeCompareBrowserVersions.Call(
		uintptr(unsafe.Pointer(_v1)),
		uintptr(unsafe.Pointer(_v2)),
		uintptr(unsafe.Pointer(&result)))
	if err != windows.ERROR_SUCCESS {
		return result, err
	}
	return result, nil
}

// GetInstalledVersion returns the installed version of the webview2 runtime.
// If there is no version installed, a blank string is returned.
func GetInstalledVersion() (string, error) {
	if err := load(nativeGetAvailableCoreWebView2BrowserVersionString); err != nil {
		return "", err
	}
	var result *uint16
	hr, _, _ := nativeGetAvailableCoreWebView2BrowserVersionString.Call(
		uintptr(unsafe.Pointer(nil)),
		uintptr(unsafe.Pointer(&result)))
	defer windows.CoTaskMemFree(unsafe.Pointer(result)) // Safe even if result is nil
	if hr != uintptr(windows.S_OK) {
		if hr&0xFFFF == uintptr(windows.ERROR_FILE_NOT_FOUND) {
			return "", nil // no runtime installed
		}
		return "", fmt.Errorf("GetAvailableCoreWebView2BrowserVersionString returned HRESULT 0x%X", hr)
	}
	return windows.UTF16PtrToString(result), nil
}

// CreateCoreWebView2EnvironmentWithOptions loads WebView2Loader.dll and calls
// the CreateCoreWebView2EnvironmentWithOptions routine.
func CreateCoreWebView2EnvironmentWithOptions(browserExecutableFolder, userDataFolder *uint16, environmentOptions uintptr, environmentCompletedHandle uintptr) (uintptr, error) {
	if err := load(nativeCreate); err != nil {
		return 0, err
	}
	res, _, _ := nativeCreate.Call(
		uintptr(unsafe.Pointer(browserExecutableFolder)),
		uintptr(unsafe.Pointer(userDataFolder)),
		environmentOptions,
		environmentCompletedHandle,
	)
	return res, nil
}
