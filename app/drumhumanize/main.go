// DrumHumanize as a stand-alone Windows program. The page itself is built from
// web/src/drumhumanize.src.html by tools/build into page.html in this folder.
//
// Copyright 2026 Michael Zacho Kristensen (MrJaegel). PolyForm Shield 1.0.0, see LICENSE.txt.

//go:build windows

package main

import (
	_ "embed"

	"drumtools/shell"
)

//go:embed page.html
var page string

func main() {
	shell.Run("DrumHumanize", page)
}
