package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"math"
	"runtime"
)

// trayIcon draws three rising bars, 18 points high at twice the scale:
// black on transparent for macOS to tint, a gray that shows on light and
// dark taskbars elsewhere.
func trayIcon() []byte {
	const size = 36
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	ink := color.NRGBA{R: 128, G: 128, B: 128, A: 255}
	if runtime.GOOS == "darwin" {
		ink = color.NRGBA{A: 255}
	}
	// Bars 6 wide with rounded ends, 4 apart, from the baseline at 30.
	bars := []struct{ x, top float64 }{{7, 19}, {15, 12}, {23, 5}}
	for y := range size {
		for x := range size {
			// Supersample each pixel 4x4 for smooth ends.
			cover := 0
			for sy := range 4 {
				for sx := range 4 {
					px, py := float64(x)+(float64(sx)+0.5)/4, float64(y)+(float64(sy)+0.5)/4
					for _, b := range bars {
						if inBar(px, py, b.x, b.top, 6, 31) {
							cover++
							break
						}
					}
				}
			}
			if cover > 0 {
				c := ink
				c.A = uint8(int(ink.A) * cover / 16)
				img.SetNRGBA(x, y, c)
			}
		}
	}
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}

// inBar reports whether (px, py) is in a bar from x to x+w and top to
// bottom whose ends are round.
func inBar(px, py, x, top, w, bottom float64) bool {
	r := w / 2
	cx := x + r
	if px < x || px > x+w || py > bottom || py < top {
		return false
	}
	if py < top+r {
		return math.Hypot(px-cx, py-(top+r)) <= r
	}
	if py > bottom-r {
		return math.Hypot(px-cx, py-(bottom-r)) <= r
	}
	return true
}
