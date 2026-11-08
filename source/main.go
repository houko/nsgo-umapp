// Umapp shows the websites of an Umami account, and their visitors, in a
// panel of the menu bar.
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/oneo-me/nsgo"
	"github.com/oneo-me/nsgo/core"
	"github.com/oneo-me/nsgo/desktop"
	menus "github.com/oneo-me/nsgo/desktop/locales"
)

const version = "0.1.0"

// shell is what lives as long as the app: the tray icon, the panel while
// it is open, and the state the panel shows.
type shell struct {
	a     *app
	tray  *desktop.Tray
	panel *desktop.Window

	saving   sync.Mutex
	savedKey string
}

func main() {
	base, err := os.UserConfigDir()
	if err != nil {
		log.Fatal(err)
	}
	dir := filepath.Join(base, "umapp")
	s := &shell{}
	nsgo.Run(func(cx *core.Scope) {
		s.ready(cx, dir)
	}, nsgo.HideDock(), nsgo.WindowSize(panelWidth, panelHeight))
}

func (s *shell) ready(cx *core.Scope, dir string) {
	cfg := loadConfig(dir)
	s.savedKey = cfg.Key
	var src source
	if cfg.Key != "" {
		src = newClient(cfg.Endpoint, cfg.Key)
	}
	a := newApp(cfg, src)
	s.a = a
	a.quit = cx.Quit
	a.onLive = func(n int) { s.updateTray() }
	a.changed = func(cfg config) {
		s.updateTray()
		go s.save(dir, cfg)
	}
	a.attach(cx)

	desktop.SetShutdownMode(cx, desktop.ShutdownOnExplicit)
	s.installMenu(cx)
	s.createTray(cx)
	a.refresh()
	go s.tick()
}

func (s *shell) installMenu(cx *core.Scope) {
	tr := s.a.msgs()
	desktop.SetApplicationMenu(cx, []desktop.MenuItem{
		{Label: tr.AppName(), Items: []desktop.MenuItem{
			{Label: tr.Settings(), Shortcut: "mod+,", OnSelect: func() {
				s.a.resetSettings()
				s.a.page = pageSettings
				s.a.invalidate()
				s.showPanel()
			}},
			{Separator: true},
			{Role: desktop.MenuQuit},
		}},
		{Label: menus.For(cx).Edit(), Items: []desktop.MenuItem{
			{Role: desktop.MenuUndo}, {Role: desktop.MenuRedo},
			{Separator: true},
			{Role: desktop.MenuCut}, {Role: desktop.MenuCopy}, {Role: desktop.MenuPaste}, {Role: desktop.MenuSelectAll},
		}},
	})
}

func (s *shell) createTray(cx *core.Scope) {
	s.panel = desktop.OpenPanel(cx, desktop.PanelOptions{Width: panelWidth, Height: panelHeight, HideOnBlur: true,
		Material: desktop.WindowMaterialPopover}, s.a.root)
	if s.panel == nil {
		nsgo.SetMainView(cx, s.a.root)
		return
	}
	s.tray = desktop.NewTray(cx, desktop.TrayOptions{
		Icon:     trayIcon(),
		Template: true,
		Tooltip:  s.a.msgs().Title(),
		Panel:    s.panel,
		Menu:     s.trayMenu,
	})
	panel := s.panel
	shown := false
	cx.Effect(func() {
		visible := panel.Visible()
		if visible && !shown {
			cx.Untrack(func() {
				if s.a.stale() && s.a.loading == 0 {
					s.a.refresh()
				}
			})
		}
		if shown && !visible {
			cx.Untrack(func() {
				s.a.selected = -1
				s.a.invalidate()
			})
		}
		shown = visible
	})
	s.updateTray()
}

func (s *shell) trayMenu() []desktop.MenuItem {
	tr := s.a.msgs()
	return []desktop.MenuItem{
		{Label: tr.Refresh(), OnSelect: s.a.refresh},
		{Separator: true},
		{Label: tr.Quit(), OnSelect: s.a.quit},
	}
}

func (s *shell) showPanel() {
	if s.panel == nil {
		if s.a.cx != nil {
			desktop.OrderFront(s.a.cx)
		}
		return
	}
	s.panel.Focus()
}

func (s *shell) updateTray() {
	if s.tray == nil || s.a == nil {
		return
	}
	tr := s.a.msgs()
	title, tip := "", tr.Title()
	live := s.a.liveTotal()
	if s.a.configured() && !s.a.cfg.HideLive && live > 0 {
		title = fmt.Sprint(live)
	}
	if s.a.configured() {
		tip = tr.TrayTooltip(live, s.a.unitWord(live, tr.Visitor(), tr.VisitorsUnit()))
	}
	s.tray.SetTitle(title)
	s.tray.SetTooltip(tip)
}

func (s *shell) save(dir string, cfg config) {
	s.saving.Lock()
	defer s.saving.Unlock()
	if cfg.Key == s.savedKey && runtime.GOOS == "darwin" {
		cfg.Key = ""
		if err := writeConfig(dir, cfg); err != nil {
			log.Print("config: ", err)
		}
		return
	}
	if err := saveConfig(dir, cfg); err != nil {
		log.Print("config: ", err)
		return
	}
	s.savedKey = cfg.Key
}

func (s *shell) tick() {
	n := 0
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for range tick.C {
		n++
		s.a.post(func() {
			if n%5 == 0 {
				s.a.refresh()
			} else {
				s.a.refreshActive()
			}
		})
	}
}
