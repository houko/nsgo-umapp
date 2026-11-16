//go:build js

package main

import "syscall/js"

// startAnalytics adds Umami's script to the page, which counts the site's visits; the web build has no switch for it, so it gives no tracker.
func startAnalytics(language func() string) func(path string) {
	doc := js.Global().Get("document")
	s := doc.Call("createElement", "script")
	s.Set("defer", true)
	s.Set("src", analyticsOrigin+"/script.js")
	s.Call("setAttribute", "data-website-id", analyticsWebsite)
	s.Call("setAttribute", "data-tag", "web")
	doc.Get("head").Call("appendChild", s)
	return nil
}
