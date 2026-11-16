package main

import (
	"fmt"
	"strings"

	"github.com/nsgo-dev/nsgo/base"
	"github.com/nsgo-dev/nsgo/core"
	"github.com/nsgo-dev/nsgo/icons/lucide"
	"github.com/nsgo-dev/nsgo/ui"
)

// The main window's size as it first opens, and its sidebar's.
const (
	windowWidth  = 1080
	windowHeight = 720
	sidebarWidth = 260
)

// windowRoot is the main window: the websites in a sidebar beside the page the panel shows, wider. Both follow the same state, so a website chosen here is the panel's too.
func (a *app) windowRoot(cx *core.Scope) core.Node {
	base.SetScrollbarTheme(cx, ui.ScrollbarTheme(cx))
	a.bindKeys(cx)
	tr := msgsOf(cx)
	open := core.NewSignal(cx, true)
	width := core.NewSignal(cx, core.Points(sidebarWidth))
	return ui.SidebarShell{TestID: "window",
		Open: open.Get, OnOpenChange: open.Set, ToggleLabel: tr.ToggleSidebar(),
		Width: width.Get, OnWidthChange: width.Set, DefaultWidth: sidebarWidth, MinWidth: 200, MaxWidth: 420,
		ResizeLabel: tr.ResizeSidebar(),
		Sidebar:     []core.Node{a.region(a.sidebarKey, a.windowSidebar)},
		SidebarFooter: []core.Node{
			a.toolButton(cx, lucide.Plus, tr.AddWebsite(), live(a, func() bool { return !a.configured() }), a.startAdd, "window-add"),
			ui.Spacer{},
			a.toolButton(cx, lucide.Settings, tr.Settings(), nil, a.showSettings, "window-settings"),
		},
		Header:  []core.Node{a.region(a.pageKey, a.windowTitle)},
		Actions: []core.Node{a.region(a.windowActionsKey, a.windowActions)},
		Content: []core.Node{a.region(a.pageKey, a.windowContent)},
	}
}

// sidebarKey changes as what the sidebar shows does: the page, the website open, and each website's name and visitors online.
func (a *app) sidebarKey() string {
	var b strings.Builder
	fmt.Fprint(&b, a.page, a.open, a.cfg.Sort, a.configured(), ";")
	for _, s := range a.ordered() {
		fmt.Fprintf(&b, "%s:%s:%s:%d;", s.ID, s.Name, s.Domain, s.active)
	}
	return b.String()
}

// windowSidebar is the overview, then every website in the list's order, the one open selected.
func (a *app) windowSidebar(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	if !a.configured() {
		return core.View{}
	}
	rows := []core.Node{ui.SidebarButton{Text: tr.Overview(), Icon: lucide.LayoutDashboard, TestID: "window-overview",
		Selected: func() bool { return a.page == pageSites }, OnPress: a.showOverview}}
	for _, s := range a.ordered() {
		rows = append(rows, a.sidebarSite(cx, s))
	}
	return core.View{Style: core.Style{Gap: 1, Padding: core.Symmetric(0, inset)}, Children: rows}
}

func (a *app) sidebarSite(cx *core.Scope, s *site) core.Node {
	colors := ui.ColorsOf(cx)
	id := s.ID
	name := oneLine(ui.Text(s.Name, 13, ui.Regular, colors.Text))
	name.Style = name.Style.Merge(core.Style{FlexGrow: 1})
	return base.Button{Label: s.Name, TestID: "window-site-" + id,
		Selected: func() bool { return a.page == pageSite && a.open == id },
		OnPress:  func(core.PressEvent) { a.openSite(id) },
		Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 8, MinHeight: core.Pt(32), MinWidth: core.Pt(0),
			FlexShrink: 0, Padding: core.Symmetric(0, 8), CornerRadius: 8, Cursor: core.CursorDefault},
		StyleFunc: func() core.Style {
			return core.Style{Selected: &core.Style{Background: ui.Alpha(colors.Text(), 0.1)}, FocusVisible: ui.FocusRing(cx, -2)}
		},
		Children: []core.Node{favicon(cx, s.Domain, 16), name, a.liveBadge(cx, s.active, false)},
	}
}

// showOverview shows every website, as the panel's list does.
func (a *app) showOverview() {
	if a.page == pageSettings {
		a.resetSettings()
	}
	a.page, a.selected, a.copied = pageSites, -1, ""
	a.invalidate()
}

// windowTitle names the page the window shows.
func (a *app) windowTitle(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	title := tr.Overview()
	switch {
	case !a.configured():
		title = tr.ConnectTitle()
	case a.page == pageSettings:
		title = tr.SettingsTitle()
	case a.page == pageAdd:
		title = tr.AddWebsite()
	case a.page == pageManage:
		title = a.managed.Name
	case a.page == pageSite && a.site(a.open) != nil:
		title = a.site(a.open).Name
	}
	text := oneLine(ui.Text(title, 13, ui.Semibold, colors.Text))
	text.Role = core.RoleHeader
	return text
}

func (a *app) windowActionsKey() string {
	return fmt.Sprint(a.pageKey(), a.cfg.Range, a.src != nil && a.src.hasDashboard())
}

// windowActions are the content's tools: the range and refresh for the lists and charts, and a website's settings and Umami page on its own.
func (a *app) windowActions(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	if !a.configured() || a.page != pageSites && a.page != pageSite {
		return core.View{}
	}
	nodes := []core.Node{a.rangeControl(cx)}
	if s := a.site(a.open); a.page == pageSite && s != nil {
		id := s.ID
		nodes = append(nodes, a.toolButton(cx, lucide.SlidersHorizontal, tr.WebsiteSettings(), nil, func() { a.manageSite(id) }, "window-manage"))
		if u := dashboardURL(a.cfg.Endpoint, id); u != "" && a.src.hasDashboard() {
			nodes = append(nodes, a.toolButton(cx, lucide.ExternalLink, tr.OpenUmami(), nil, func() { cx.OpenURL(u, nil) }, "window-open"))
		}
	}
	nodes = append(nodes, a.refreshButton(cx))
	return row(4, nodes...)
}

// windowContent is the page the panel would show, without the panel's own bars, and a site's page laid out wide.
func (a *app) windowContent(cx *core.Scope) core.Node {
	switch {
	case !a.configured() || a.page == pageSettings:
		return formColumn(a.settingsContent(cx))
	case a.page == pageAdd:
		return formColumn(a.addContent(cx))
	case a.page == pageManage:
		return formColumn(a.manageContent(cx))
	case a.page == pageSite && a.site(a.open) != nil:
		return a.region(a.detailKey, func(cx *core.Scope) core.Node { return a.detailView(cx, a.site(a.open), true) })
	}
	return a.region(a.listContentKey, a.list)
}

// formMaxWidth keeps a form's labels near their values in a wide window.
const formMaxWidth = 680

// formColumn centers a form page in the window at a width it reads well at.
func formColumn(page core.Node) core.Node {
	return core.View{Style: ui.FillRest.Merge(core.Style{AlignItems: core.AlignCenter}), Children: []core.Node{
		core.View{Style: core.Style{FlexGrow: 1, Width: core.Pct(100), MaxWidth: core.Pt(formMaxWidth), MinHeight: core.Pt(0)}, Children: []core.Node{page}},
	}}
}
