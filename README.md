# Drum Tools

Three tools for MIDI drums, made by a musician for musicians. Everything runs on your own computer; your MIDI files are never uploaded.

| Tool | What it does |
|---|---|
| **DrumSplit** | Finds the tempo, time signature and sections (verse, chorus, fills) in a MIDI drum track and saves each section as its own MIDI file. |
| **DrumHumanize** | Gives MIDI drums living velocity: softer fast hits, beat accents, variation and the odd mishit. Programmed ghost notes are left alone. |
| **DrumTime** | Moves the hits slightly off the grid: a spread per drum, time that breathes, and fast runs (blasts, double kick) that tighten or loosen as they go. |

- Works with any DAW that exports MIDI files (Cubase, Reaper, Studio One, Logic …).
- Recognises the General MIDI drum map and the default map of Superior Drummer 3, and you can change single notes yourself.
- English and Danish.

**Free online versions:** [mrjaegel.github.io](https://mrjaegel.github.io/)  
**Windows programs:** small programs that work offline, remember your settings and save with the normal Windows dialogs. No installation and no licence key. Get them at [buymeacoffee.com/mrjaegel/extras](https://buymeacoffee.com/mrjaegel/extras).  
**Support the project:** if the tools save you time, [buy me a coffee](https://buymeacoffee.com/MrJaegel).

Only download the Windows programs from the shop above or build them yourself from this repository. Copies from other places may have been changed.

## Build it yourself

You only need [Go](https://go.dev/dl/) 1.24 or newer.

```
cd tools/build
go run .              # web site, help guides, Windows programs and zip files
go run . -web-only    # only the web site and help guides
```

Everything ends up in `dist/`:

| Path | Contents |
|---|---|
| `dist/site/` | The web site: `index.html`, the three tools and their help guides. Ready for GitHub Pages or any web host. |
| `dist/windows/<Program>/` | Each Windows program with `WebView2Loader.dll`, help guide, readme and licences. |
| `dist/*-Windows.zip`, `dist/Drum-Tools-Website.zip` | The same, zipped. |

The Windows programs can be built on Windows, macOS or Linux (Go cross-compiles them).

## Project layout

| Path | Contents |
|---|---|
| `web/src/core.js` | MIDI reading and writing, section finding, velocity and timing humanizing. Shared by all three tools. |
| `web/src/i18n.js` | The English and Danish texts. |
| `web/src/links.js` | Links to donations, the shop, the source code and the web site. An empty link hides its button. |
| `web/src/*.src.html` | The three tools, the help guide and the front page. |
| `web/test/core.test.js` | Tests for the core (`node web/test/core.test.js`). |
| `app/shell/` | The Windows program around the page: window (Microsoft Edge WebView2), Save As and folder dialogs, settings. |
| `app/<program>/` | One small `main.go` per program plus its icon, manifest and version information (`resource_windows_amd64.syso`). |
| `third_party/go-webview2/` | A changed copy of [go-webview2](https://github.com/jchv/go-webview2) (MIT) that loads `WebView2Loader.dll` only from disk. |
| `tools/build/` | The build tool. |

To change an icon or the version information, edit `app/<program>/versioninfo.json` or `icon.ico` and regenerate the resource file with [goversioninfo](https://github.com/josephspurrier/goversioninfo): `goversioninfo -64 -o resource_windows_amd64.syso versioninfo.json`.

## Licence

Copyright 2026 Michael Zacho Kristensen (MrJaegel).

Licensed under the **PolyForm Shield License 1.0.0** (see [LICENSE.txt](LICENSE.txt)). You may use the tools for anything, including paid music work, and you may change and share them, but you may not use them to make or sell a product that competes with them.

Parts made by others keep their own licences; see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt). Superior Drummer is a trademark of Toontrack; these tools are not made or endorsed by Toontrack.

---

## Dansk

Tre værktøjer til MIDI-trommer: **DrumSplit** deler et trommespor op i sektioner, **DrumHumanize** giver levende velocity, og **DrumTime** flytter slagene en smule væk fra gitteret. Alt kører på din egen computer.

Gratis online: [mrjaegel.github.io](https://mrjaegel.github.io/). Windows-programmerne: [buymeacoffee.com/mrjaegel/extras](https://buymeacoffee.com/mrjaegel/extras). Hent kun programmerne derfra, eller byg dem selv herfra.

Byg selv med Go: `cd tools/build` og `go run .`. Resultatet ligger i `dist/`.

Udgivet under PolyForm Shield License 1.0.0: du må bruge værktøjerne til alt og ændre og dele dem, men ikke lave eller sælge et konkurrerende produkt.
