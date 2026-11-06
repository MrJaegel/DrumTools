// Build tool for the drum tools.
//
//	cd tools/build
//	go run .            web site, help guides, Windows programs and zip files
//	go run . -web-only  only the web site and help guides
//
// Everything ends up in dist/ at the top of the project:
//
//	dist/site/                   the web site (index, the three tools, help guides)
//	dist/windows/<Program>/      each Windows program with its DLL, help and licences
//	dist/<Program>-Windows.zip   one zip per program (for the shop)
//	dist/Drum-Tools-Windows.zip  all three programs in one zip
//	dist/Drum-Tools-Website.zip  the web site
//
// Copyright 2026 Michael Zacho Kristensen (MrJaegel). PolyForm Shield 1.0.0, see LICENSE.txt.
package main

import (
	"archive/zip"
	"flag"
	"fmt"
	"html"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

type tool struct {
	Name, Stem, TaglineEN, TaglineDA string
}

var tools = []tool{
	{"DrumSplit", "drumsplit",
		"Finds the tempo, time signature and sections in a MIDI drum track and saves each section as its own MIDI file.",
		"Finder tempo, taktart og sektioner i et MIDI-trommespor og gemmer hver sektion som sin egen MIDI-fil."},
	{"DrumHumanize", "drumhumanize",
		"Gives MIDI drums living velocity: softer fast hits, beat accents, variation and the odd mishit.",
		"Giver MIDI-trommer levende velocity: svagere hurtige slag, takt-accenter, variation og et sjældent fejlslag."},
	{"DrumTime", "drumtime",
		"Moves MIDI drum hits slightly off the grid, with fast runs that tighten or loosen as they go.",
		"Flytter MIDI-trommeslag en smule væk fra gitteret, med hurtige rækker der strammes eller løsnes undervejs."},
}

const (
	author = "MrJaegel"
	legal  = "Michael Zacho Kristensen (MrJaegel)"
	year   = "2026"
)

var root string

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func read(rel string) string {
	b, err := os.ReadFile(filepath.Join(root, rel))
	must(err)
	return string(b)
}

func write(path, content string) {
	must(os.MkdirAll(filepath.Dir(path), 0o755))
	must(os.WriteFile(path, []byte(content), 0o644))
}

func copyFile(src, dst string) {
	in, err := os.Open(src)
	must(err)
	defer in.Close()
	must(os.MkdirAll(filepath.Dir(dst), 0o755))
	out, err := os.Create(dst)
	must(err)
	_, err = io.Copy(out, in)
	must(err)
	must(out.Close())
}

// page puts the shared scripts into a tool's page and wraps it as a complete document
func page(t tool) string {
	src := read("web/src/" + t.Stem + ".src.html")
	src = strings.Replace(src, "/*__LINKS__*/", read("web/src/links.js"), 1)
	src = strings.Replace(src, "/*__I18N__*/", read("web/src/i18n.js"), 1)
	src = strings.Replace(src, "/*__CORE__*/", read("web/src/core.js"), 1)
	for _, p := range []string{"__LINKS__", "__I18N__", "__CORE__"} {
		if strings.Contains(src, "/*"+p+"*/") {
			must(fmt.Errorf("%s: placeholder %s left", t.Stem, p))
		}
	}
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/png" href="` + favicon() + `"></head><body>` + src + "</body></html>"
}

var toolBlock = regexp.MustCompile(`(?s)<!--tool:([a-z,]+)-->(.*?)<!--/tool-->`)

// favicon is the small robot-head icon, inlined so every page works on its own
func favicon() string {
	return "data:image/png;base64," + strings.TrimSpace(read("web/assets/favicon-64.b64"))
}

// help builds the help guide for one tool from the shared source
func help(t tool) string {
	src := read("web/src/help.src.html")
	src = toolBlock.ReplaceAllStringFunc(src, func(m string) string {
		parts := toolBlock.FindStringSubmatch(m)
		for _, name := range strings.Split(parts[1], ",") {
			if name == t.Stem {
				return parts[2]
			}
		}
		return ""
	})
	r := strings.NewReplacer(
		"{{TOOL}}", t.Name, "{{TAGLINE_EN}}", t.TaglineEN, "{{TAGLINE_DA}}", t.TaglineDA,
		"{{YEAR}}", year, "{{AUTHOR}}", author, "{{LEGAL}}", legal,
		"{{LICENSE_TEXT}}", html.EscapeString(read("LICENSE.txt")),
		"{{THIRD_PARTY_TEXT}}", html.EscapeString(read("THIRD-PARTY-NOTICES.txt")),
		"/*__LINKS__*/", read("web/src/links.js"), "{{FAVICON}}", favicon(),
	)
	return r.Replace(src)
}

// readme fills in the Windows readme for one program or for all three
func readme(list []tool, title, titleDA string) string {
	var en, da strings.Builder
	for _, t := range list {
		fmt.Fprintf(&en, "  %s.exe\n    %s\n", t.Name, t.TaglineEN)
		fmt.Fprintf(&da, "  %s.exe\n    %s\n", t.Name, t.TaglineDA)
	}
	links := linksFromJS()
	var le, ld strings.Builder
	if links["donate"] != "" {
		fmt.Fprintf(&le, "\nSupport the project: %s\n", links["donate"])
		fmt.Fprintf(&ld, "\nStøt projektet: %s\n", links["donate"])
	}
	if links["website"] != "" {
		fmt.Fprintf(&le, "Free online versions: %s\n", links["website"])
		fmt.Fprintf(&ld, "Gratis online-versioner: %s\n", links["website"])
	}
	if links["source"] != "" {
		fmt.Fprintf(&le, "Source code: %s\n", links["source"])
		fmt.Fprintf(&ld, "Kildekode: %s\n", links["source"])
	}
	// official download places, one per line
	var official []string
	if shop := links["buy"]; shop != "" {
		official = append(official, "  "+shop)
	} else if links["donate"] != "" {
		official = append(official, "  "+links["donate"])
	}
	if links["source"] != "" {
		official = append(official, "  "+links["source"])
	}
	if len(official) == 0 {
		must(fmt.Errorf("README: set a donate, buy or source link in web/src/links.js"))
	}
	r := strings.NewReplacer(
		"{{OFFICIAL}}", strings.Join(official, "\n"), "{{DONATE}}", "  "+links["donate"],
		"{{TITLE}}", title, "{{UNDERLINE}}", strings.Repeat("=", len([]rune(title))),
		"{{TITLE_DA}}", titleDA, "{{UNDERLINE_DA}}", strings.Repeat("=", len([]rune(titleDA))),
		"{{PROGRAM_LIST_EN}}", strings.TrimRight(en.String(), "\n"),
		"{{PROGRAM_LIST_DA}}", strings.TrimRight(da.String(), "\n"),
		"{{LINKS_EN}}", le.String(), "{{LINKS_DA}}", ld.String(),
	)
	// Windows Notepad is happiest with CRLF line ends
	return strings.ReplaceAll(r.Replace(read("docs/README-windows.txt")), "\n", "\r\n")
}

var linkRe = regexp.MustCompile(`(?m)^\s*(donate|buy|source|website):\s*"([^"]*)"`)

func linksFromJS() map[string]string {
	m := map[string]string{}
	for _, x := range linkRe.FindAllStringSubmatch(read("web/src/links.js"), -1) {
		m[x[1]] = x[2]
	}
	return m
}

// zipDir packs dir into zipPath, with the folder itself as the top level
func zipDir(dir, zipPath string) {
	f, err := os.Create(zipPath)
	must(err)
	zw := zip.NewWriter(f)
	base := filepath.Dir(dir)
	must(filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(base, p)
		h, _ := zip.FileInfoHeader(info)
		h.Name = filepath.ToSlash(rel)
		h.Method = zip.Deflate
		w, err := zw.CreateHeader(h)
		if err != nil {
			return err
		}
		in, err := os.Open(p)
		if err != nil {
			return err
		}
		defer in.Close()
		_, err = io.Copy(w, in)
		return err
	}))
	must(zw.Close())
	must(f.Close())
}

func goBuild(t tool, out string) {
	// -mod=mod lets Go fetch golang.org/x/sys and write go.sum the first time
	cmd := exec.Command("go", "build", "-mod=mod", "-trimpath", "-ldflags", "-H windowsgui", "-o", out, "./"+t.Stem)
	cmd.Dir = filepath.Join(root, "app")
	cmd.Env = append(os.Environ(), "GOOS=windows", "GOARCH=amd64", "CGO_ENABLED=0")
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	must(cmd.Run())
}

func main() {
	webOnly := flag.Bool("web-only", false, "only build the web site and help guides")
	flag.Parse()
	wd, _ := os.Getwd()
	root, _ = filepath.Abs(filepath.Join(wd, "..", ".."))
	if _, err := os.Stat(filepath.Join(root, "web", "src", "core.js")); err != nil {
		must(fmt.Errorf("run this from tools/build inside the project"))
	}
	dist := filepath.Join(root, "dist")
	must(os.RemoveAll(dist))

	// ---- web site -----------------------------------------------------------------
	site := filepath.Join(dist, "site")
	for _, t := range tools {
		write(filepath.Join(site, t.Stem+".html"), page(t))
		write(filepath.Join(site, t.Stem+"-help.html"), help(t))
	}
	index := strings.Replace(read("web/src/index.src.html"), "/*__LINKS__*/", read("web/src/links.js"), 1)
	write(filepath.Join(site, "index.html"), strings.Replace(index, "{{FAVICON}}", favicon(), 1))
	copyFile(filepath.Join(root, "web", "assets", "logo-badge-560.jpg"), filepath.Join(site, "assets", "logo-badge-560.jpg"))
	copyFile(filepath.Join(root, "LICENSE.txt"), filepath.Join(site, "LICENSE.txt"))
	write(filepath.Join(site, ".nojekyll"), "") // GitHub Pages: serve the files as they are
	fmt.Println("web site:", site)
	if *webOnly {
		return
	}

	// ---- Windows programs ---------------------------------------------------------
	dll := filepath.Join(root, "third_party", "go-webview2", "webviewloader", "sdk", "x64", "WebView2Loader.dll")
	common := func(dir string) {
		copyFile(dll, filepath.Join(dir, "WebView2Loader.dll"))
		copyFile(filepath.Join(root, "LICENSE.txt"), filepath.Join(dir, "LICENSE.txt"))
		copyFile(filepath.Join(root, "THIRD-PARTY-NOTICES.txt"), filepath.Join(dir, "THIRD-PARTY-NOTICES.txt"))
	}
	all := filepath.Join(dist, "windows", "Drum Tools")
	for _, t := range tools {
		write(filepath.Join(root, "app", t.Stem, "page.html"), page(t))
		dir := filepath.Join(dist, "windows", t.Name)
		exe := filepath.Join(dir, t.Name+".exe")
		fmt.Println("building", t.Name+".exe")
		goBuild(t, exe)
		write(filepath.Join(dir, t.Name+" Help.html"), help(t))
		write(filepath.Join(dir, "README.txt"), readme([]tool{t}, t.Name, t.Name))
		common(dir)
		zipDir(dir, filepath.Join(dist, t.Name+"-Windows.zip"))

		copyFile(exe, filepath.Join(all, t.Name+".exe"))
		write(filepath.Join(all, t.Name+" Help.html"), help(t))
	}
	write(filepath.Join(all, "README.txt"), readme(tools, "DRUM TOOLS", "DRUM TOOLS"))
	common(all)
	zipDir(all, filepath.Join(dist, "Drum-Tools-Windows.zip"))
	zipDir(site, filepath.Join(dist, "Drum-Tools-Website.zip"))
	fmt.Println("done:", dist)
}
