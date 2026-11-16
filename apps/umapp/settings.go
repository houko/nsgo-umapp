package main

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/nsgo-dev/nsgo/base"
	"github.com/nsgo-dev/nsgo/core"
	"github.com/nsgo-dev/nsgo/icons/lucide"
	"github.com/nsgo-dev/nsgo/ui"
)

// sectionGap parts the settings' sections.
const sectionGap = 22

func (a *app) settings(cx *core.Scope) core.Node {
	body := a.settingsContent(cx)
	if !a.configured() {
		return body
	}
	return core.View{Style: ui.FillRest, Children: []core.Node{a.pageHeader(cx, msgsOf(cx).SettingsTitle()), body}}
}

// settingsContent is the settings without their bar, which the window shows under its own.
func (a *app) settingsContent(cx *core.Scope) core.Node {
	return core.Scroll{Style: ui.FillRest, TestID: "settings",
		Children: []core.Node{core.View{Style: core.Style{Padding: core.All(gutter), Gap: sectionGap,
			PaddingEnv: core.EnvEdges{Bottom: core.EnvKeyboard}},
			Children: a.settingsBody(cx, a.configured())}}}
}

// pageHeader is the bar of a page under the list: the way back, and the page's title.
func (a *app) pageHeader(cx *core.Scope, text string) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	title := oneLine(ui.Text(text, 13, ui.Semibold, colors.Text))
	title.Role = core.RoleHeader
	title.Style = title.Style.Merge(core.Style{FlexGrow: 1, TextAlign: core.TextAlignCenter})
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 4,
		Padding: core.All(gutter), Borders: core.Edges{Bottom: 1}, FlexShrink: 0},
		StyleFunc: func() core.Style { return core.Style{BorderColor: colors.Line()} },
		Children: []core.Node{
			ui.IconButton{Icon: lucide.ChevronLeft, Label: tr.Websites(), TestID: "back", OnPress: a.back},
			title,
			core.View{Style: core.Style{Width: core.Pt(28), Height: core.Pt(28), FlexShrink: 0}},
		}}
}

func (a *app) settingsBody(cx *core.Scope, connected bool) []core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	var nodes []core.Node
	if !connected {
		nodes = append(nodes, column(4,
			a.mark(cx),
			ui.Text(tr.ConnectTitle(), 17, ui.Semibold, colors.Text),
			core.Text{Content: tr.ConnectBody(), Style: core.Style{FontSize: 12, LineHeight: 17}, StyleFunc: ui.Colored(colors.Muted)},
		))
	}
	title := tr.Account()
	if !connected {
		title = ""
	}
	if a.fromLink {
		nodes = append(nodes, ui.FormSection{Children: []core.Node{
			ui.FormRow{Icon: lucide.Link, Title: tr.FromLink(), Detail: tr.FromLinkHint(), TestID: "from-link"},
		}})
	}
	nodes = append(nodes, column(0, a.accountSection(cx, title, connected), a.region(func() string {
		return fmt.Sprint(a.connecting, a.connectErr, connected, a.dirty())
	}, func(cx *core.Scope) core.Node {
		return a.accountStatus(cx, connected)
	})))
	if connected {
		general := []core.Node{a.languageRow(cx)}
		if a.canLaunchAtLogin {
			general = append(general, a.loginSwitch(cx))
		}
		footer := ""
		if !a.noTray {
			general = append(general, a.liveSwitch(cx))
			footer = tr.LiveHint()
		}
		nodes = append(nodes, a.region(a.websitesKey, a.websitesSection))
		nodes = append(nodes, ui.FormSection{Title: tr.General(), Footer: footer, Children: general})
		if a.sendView != nil {
			nodes = append(nodes, ui.FormSection{Footer: tr.AnalyticsHint(), Children: []core.Node{a.analyticsSwitch(cx)}})
		}
		if a.checkUpdates != nil {
			footer := ""
			if v := core.App().Version; v != "" {
				footer = tr.VersionLabel(v)
			}
			nodes = append(nodes, ui.FormSection{Footer: footer, Children: []core.Node{
				ui.FormRow{Icon: lucide.RefreshCw, Title: tr.CheckForUpdates(), TestID: "check-updates", OnPress: a.checkUpdates},
			}})
		}
		nodes = append(nodes, ui.FormSection{Children: []core.Node{
			ui.FormRow{Title: tr.Disconnect(), Variant: ui.FormRowDanger, TestID: "disconnect", OnPress: a.disconnect},
		}})
	}
	return nodes
}

// websitesKey changes as the websites the settings list do.
func (a *app) websitesKey() string {
	var b strings.Builder
	for _, s := range a.sites {
		fmt.Fprintf(&b, "%s:%s:%s;", s.ID, s.Name, s.Domain)
	}
	return b.String()
}

// websitesSection lists the account's websites by name, each opening its page, and adds one.
func (a *app) websitesSection(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	sites := slices.Clone(a.sites)
	slices.SortFunc(sites, func(x, y *site) int { return cmp.Compare(strings.ToLower(x.Name), strings.ToLower(y.Name)) })
	rows := make([]core.Node, 0, len(sites)+1)
	for _, s := range sites {
		rows = append(rows, ui.FormRow{Title: s.Name, Detail: s.Domain, TestID: "manage-" + s.ID,
			OnPress: func() { a.manageSite(s.ID) }})
	}
	rows = append(rows, ui.FormRow{Icon: lucide.Plus, Title: tr.AddWebsite(), Variant: ui.FormRowAccent, TestID: "settings-add", OnPress: a.startAdd})
	return ui.FormSection{Title: tr.Websites(), Children: rows}
}

func (a *app) accountSection(cx *core.Scope, title string, connected bool) core.Node {
	tr := msgsOf(cx)
	busy := live(a, func() bool { return a.connecting })
	return ui.FormSection{Title: title, Footer: tr.ApiEndpointHint(), Children: []core.Node{
		ui.FormField{Title: tr.ApiEndpoint(), Input: base.Input{
			Value: live(a, func() string { return a.editEndpoint }), Placeholder: cloudEndpoint,
			Disabled: busy, TestID: "endpoint",
			OnChange: func(s string) { a.editEndpoint = s; a.invalidate() },
			OnSubmit: func(string) { a.save() },
		}},
		ui.FormField{Title: tr.ApiKey(), Input: base.Input{
			Value: live(a, func() string { return a.editKey }), Placeholder: "api_…",
			Masked: true, AutoFocus: !connected, Disabled: busy, TestID: "key",
			OnChange: func(s string) { a.editKey = s; a.invalidate() },
			OnSubmit: func(string) { a.save() },
		}},
	}}
}

// accountStatus is what went wrong connecting, and the button that
// connects or saves an edit.
func (a *app) accountStatus(cx *core.Scope, connected bool) core.Node {
	tr := msgsOf(cx)
	var rows []core.Node
	if a.connectErr != "" {
		rows = append(rows, ui.FormRow{Icon: lucide.CircleAlert, Title: a.connectErr, Variant: ui.FormRowDanger})
	}
	if !connected || a.dirty() || a.connecting {
		label := tr.Connect()
		if connected {
			label = tr.Save()
		}
		row := ui.FormRow{Title: label, Variant: ui.FormRowAccent, TestID: "connect", OnPress: a.save,
			Disabled: live(a, func() bool { return a.connecting || a.editKey == "" })}
		if a.connecting {
			row.Title, row.Control = tr.CheckingKey(), ui.Spinner{Size: 14}
		}
		rows = append(rows, row)
	}
	if rows == nil {
		return core.View{}
	}
	return ui.FormSection{Style: core.Style{Margin: core.Edges{Top: sectionGap}}, Children: rows}
}

// dirty reports whether the endpoint or key differs from the saved ones.
func (a *app) dirty() bool {
	return a.editKey != a.cfg.Key || normalizeEndpoint(a.editEndpoint) != a.cfg.Endpoint
}

func (a *app) liveSwitch(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	return ui.FormRow{Icon: lucide.Activity, Title: tr.LiveLabel(), Control: ui.Switch{Label: tr.LiveLabel(),
		Checked: live(a, func() bool { return !a.cfg.HideLive }),
		OnChange: func(on bool) {
			a.cfg.HideLive = !on
			a.commitCfg()
		}}}
}

func (a *app) analyticsSwitch(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	return ui.FormRow{Icon: lucide.ChartColumn, Title: tr.AnalyticsLabel(), Control: ui.Switch{Label: tr.AnalyticsLabel(), TestID: "analytics",
		Checked: live(a, func() bool { return !a.cfg.NoAnalytics }),
		OnChange: func(on bool) {
			a.cfg.NoAnalytics = !on
			if on {
				a.tracked = -1
			}
			a.commitCfg()
		}}}
}

// languages are the catalogs' languages, each named in itself.
var languages = []struct{ tag, name string }{
	{"en", "English"},
	{"zh-Hans", "简体中文"},
}

func (a *app) languageRow(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	options := []ui.Option[string]{{Value: "", Label: tr.FollowSystem()}}
	for _, l := range languages {
		options = append(options, ui.Option[string]{Value: l.tag, Label: l.name})
	}
	return ui.FormRow{Icon: lucide.Languages, Title: tr.Language(), Control: ui.Select[string]{
		Options: options, Label: tr.Language(), TestID: "language", Style: core.Style{Width: core.Pt(140)},
		Value:    live(a, func() string { return a.cfg.Language }),
		OnChange: a.setLanguage,
	}}
}

func (a *app) loginSwitch(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	return ui.FormRow{Icon: lucide.Power, Title: tr.LaunchAtLoginLabel(), Control: ui.Switch{Label: tr.LaunchAtLoginLabel(),
		Checked: live(a, func() bool { return a.launchAtLogin }), OnChange: a.setLaunchAtLogin}}
}

func (a *app) save() {
	if a.connecting || a.editKey == "" {
		return
	}
	a.connect(func(endpoint, key string) source { return newClient(endpoint, key) })
}

func (a *app) mark(cx *core.Scope) core.Node {
	colors := ui.ColorsOf(cx)
	bars := make([]core.Node, 0, 3)
	for _, h := range []core.Points{10, 16, 22} {
		bars = append(bars, core.View{Style: core.Style{Width: core.Pt(6), Height: core.Pt(h), CornerRadius: 3},
			StyleFunc: ui.Filled(func() core.Color { return core.RGB(0xffffff) })})
	}
	return core.View{Style: core.Style{Direction: core.Row, Width: core.Pt(44), Height: core.Pt(44), CornerRadius: 11,
		Padding: core.All(9), Gap: 4, JustifyContent: core.JustifyCenter, AlignItems: core.AlignEnd,
		AlignSelf: core.AlignStart, Margin: core.Edges{Bottom: 12}},
		StyleFunc: ui.Filled(colors.AccentFill),
		Children:  bars}
}
