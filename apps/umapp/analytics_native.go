//go:build !js

package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"runtime"
	"time"

	"github.com/nsgo-dev/nsgo/core"
)

// startAnalytics gives the tracker that sends a page view to Umami's /api/send, in Umami's script's form, off the UI thread.
func startAnalytics(language func() string) func(path string) {
	client := &http.Client{Timeout: 15 * time.Second}
	agent, screen := analyticsAgent()
	return func(path string) {
		body, err := json.Marshal(map[string]any{"type": "event", "payload": map[string]any{
			"website":  analyticsWebsite,
			"hostname": "umapp",
			"url":      path,
			"language": language(),
			"screen":   screen,
			"tag":      "app",
		}})
		if err != nil {
			return
		}
		go func() {
			req, err := http.NewRequest(http.MethodPost, analyticsOrigin+"/api/send", bytes.NewReader(body))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("User-Agent", agent)
			res, err := client.Do(req)
			if err != nil {
				log.Print("analytics: ", err)
				return
			}
			res.Body.Close()
		}()
	}
}

// analyticsAgent is a browser's user agent for the platform, which Umami reads the OS and browser from and takes for no bot, and a screen that tells it the device.
func analyticsAgent() (agent, screen string) {
	version := core.App().Version
	switch runtime.GOOS {
	case "ios":
		return "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Umapp/" + version, "393x852"
	case "darwin":
		return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Umapp/" + version, "1512x982"
	}
	return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Umapp/" + version, "1920x1080"
}
