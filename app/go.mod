module drumtools

go 1.24

require (
	github.com/jchv/go-webview2 v0.0.0-00010101000000-000000000000
	golang.org/x/sys v0.30.0
)

// A changed copy of go-webview2 that loads WebView2Loader.dll only from disk
// (see third_party/go-webview2/webviewloader/module.go).
replace github.com/jchv/go-webview2 => ../third_party/go-webview2
