package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"math"
	"runtime"
)

// trayIcon draws a U holding a dot, 18 points high at twice the scale:
// black on transparent for macOS to tint, a gray that shows on light and
// dark taskbars elsewhere.
func trayIcon() []byte {
	const size = 36
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	ink := color.NRGBA{R: 128, G: 128, B: 128, A: 255}
	if runtime.GOOS == "darwin" {
		ink = color.NRGBA{A: 255}
	}
	for y := range size {
		for x := range size {
			// Supersample each pixel 4x4 for smooth edges.
			cover := 0
			for sy := range 4 {
				for sx := range 4 {
					if inCup(float64(x)+(float64(sx)+0.5)/4, float64(y)+(float64(sy)+0.5)/4) {
						cover++
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

// inCup reports whether (px, py) is in the tray icon: a U 4.5 wide with
// round ends around a centerline of radius 10, and a dot in its bowl.
func inCup(px, py float64) bool {
	const cx, cy, r, top, half = 18, 18.5, 10, 6, 2.25
	if math.Hypot(px-cx, py-17) <= 3.6 {
		return true
	}
	if py >= cy {
		return math.Abs(math.Hypot(px-cx, py-cy)-r) <= half
	}
	for _, x := range [2]float64{cx - r, cx + r} {
		if math.Hypot(px-x, py-max(py, top)) <= half {
			return true
		}
	}
	return false
}
