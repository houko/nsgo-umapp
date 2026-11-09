package main

import (
	"fmt"
	"slices"

	"github.com/oneo-me/nsgo/base"
	"github.com/oneo-me/nsgo/core"
	"github.com/oneo-me/nsgo/icons/lucide"
	"github.com/oneo-me/nsgo/ui"
)

func (a *app) settings(cx *core.Scope) core.Node {
	connected := a.configured()
	body := core.View{Style: ui.FillRest, Children: []core.Node{
		core.Scroll{Style: ui.FillRest, TestID: "settings",
			Children: []core.Node{core.View{Style: core.Style{Padding: core.All(gutter), Gap: 22},
				Children: a.settingsBody(cx, connected)}}},
		a.settingsFooter(cx),
	}}
	if !connected {
		return body
	}
	return core.View{Style: ui.FillRest, Children: []core.Node{a.settingsHeader(cx), body}}
}

func (a *app) settingsHeader(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	title := oneLine(ui.Text(tr.SettingsTitle(), 13, ui.Semibold, colors.Text))
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

func (a *app) settingsFooter(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 6, FlexShrink: 0,
		Padding: core.All(gutter), Borders: core.Edges{Top: 1}},
		StyleFunc: func() core.Style { return core.Style{BorderColor: colors.Line()} },
		Children: []core.Node{
			core.Text{Content: tr.Version(version), Style: core.Style{FontSize: 11, FlexGrow: 1, FlexShrink: 1},
				StyleFunc: ui.Colored(colors.Faint)},
			base.Button{Label: tr.Quit(), TestID: "quit",
				OnPress: func(core.PressEvent) { a.quit() },
				Style: core.Style{Padding: core.Symmetric(0, 2), CornerRadius: 6},
				StyleFunc: func() core.Style {
					return core.Style{Hover: &core.Style{Background: ui.Alpha(colors.Text(), 0.08)},
						Active: &core.Style{Background: ui.Alpha(colors.Text(), 0.14)}}
				},
				Children: []core.Node{ui.Text(tr.Quit(), 11, ui.Regular, colors.Text)}},
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
	nodes = append(nodes, a.accountSection(cx, title, connected))
	if connected {
		general := []core.Node{a.liveSwitch(cx)}
		if a.canLaunchAtLogin {
			general = append([]core.Node{a.loginSwitch(cx)}, general...)
		}
		nodes = append(nodes, a.section(cx, tr.General(), general...))
		if len(a.sites) > 0 {
			nodes = append(nodes, a.websitesSection(cx))
		}
	}
	return nodes
}

func (a *app) accountSection(cx *core.Scope, title string, connected bool) core.Node {
	tr := msgsOf(cx)
	fields := []core.Node{
		a.field(cx, tr.ApiEndpoint(), tr.ApiEndpointHint(), ui.Input{Input: base.Input{
			Value: live(a, func() string { return a.editEndpoint }), Placeholder: cloudEndpoint, Label: tr.ApiEndpoint(),
			Disabled: live(a, func() bool { return a.connecting }), TestID: "endpoint",
			OnChange: func(s string) { a.editEndpoint = s; a.invalidate() },
			OnSubmit: func(string) { a.save() },
		}}),
		a.field(cx, tr.ApiKey(), "", ui.Input{Input: base.Input{
			Value: live(a, func() string { return a.editKey }), Placeholder: "api_…", Label: tr.ApiKey(),
			Masked: true, AutoFocus: !connected, Disabled: live(a, func() bool { return a.connecting }), TestID: "key",
			OnChange: func(s string) { a.editKey = s; a.invalidate() },
			OnSubmit: func(string) { a.save() },
		}}),
	}
	fields = append(fields, a.region(func() string {
		return fmt.Sprint(a.connecting, a.connectErr, connected)
	}, func(cx *core.Scope) core.Node {
		return a.accountStatus(cx, connected)
	}))
	return a.section(cx, title, fields...)
}

func (a *app) accountStatus(cx *core.Scope, connected bool) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	var nodes []core.Node
	if a.connectErr != "" {
		nodes = append(nodes, row(6, ui.Icon(lucide.CircleAlert, 14, colors.Danger),
			core.Text{Content: a.connectErr, Style: core.Style{FontSize: 12, FlexGrow: 1, LineHeight: 16},
				StyleFunc: ui.Colored(colors.Danger)}))
	}
	label := tr.Connect()
	if connected {
		label = tr.Save()
	}
	actions := []core.Node{
		ui.Button{Text: label, TestID: "connect", OnPress: a.save,
			Disabled: live(a, func() bool {
				dirty := a.editKey != a.cfg.Key || normalizeEndpoint(a.editEndpoint) != a.cfg.Endpoint
				return a.connecting || (connected && !dirty) || a.editKey == ""
			})},
	}
	if a.connecting {
		actions = append(actions, ui.Spinner{Size: 14}, muted(cx, tr.CheckingKey(), 12))
	}
	actions = append(actions, ui.Spacer{})
	if connected && !a.connecting {
		actions = append(actions, ui.Button{Text: tr.Disconnect(), Variant: ui.ButtonGhost, TestID: "disconnect", OnPress: a.disconnect})
	}
	nodes = append(nodes, row(8, actions...))
	return column(10, nodes...)
}

func (a *app) liveSwitch(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	return a.switchRow(cx, tr.LiveLabel(), tr.LiveHint(), live(a, func() bool { return !a.cfg.HideLive }),
		func(on bool) {
			a.cfg.HideLive = !on
			a.commitCfg()
		})
}

func (a *app) loginSwitch(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	return a.switchRow(cx, tr.LaunchAtLoginLabel(), "", live(a, func() bool { return a.launchAtLogin }), a.setLaunchAtLogin)
}

func (a *app) websitesSection(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	return a.section(cx, tr.Websites(),
		a.region(func() string {
			return fmt.Sprint(a.cfg.Sort, a.cfg.Hidden)
		}, a.websiteRows),
	)
}

func (a *app) websiteRows(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	sites := a.ordered()
	rows := make([]core.Node, 0, len(sites))
	for _, s := range sites {
		text := column(1, body(cx, s.Name), caption(cx, s.Domain))
		text.Style = text.Style.Merge(core.Style{FlexGrow: 1, FlexShrink: 1})
		siteID := s.ID
		rows = append(rows, core.View{
			Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 8,
				Padding: core.All(6), CornerRadius: 8},
			Children: []core.Node{
				text,
				ui.Switch{
					Checked: live(a, func() bool { return !slices.Contains(a.cfg.Hidden, siteID) }),
					Label:   tr.ShowSite(s.Name),
					OnChange: func(on bool) {
						hidden := slices.Contains(a.cfg.Hidden, siteID)
						if on == !hidden {
							return
						}
						a.toggleHidden(siteID)
					},
				},
			},
		})
	}
	return column(0, rows...)
}

func (a *app) save() {
	if a.connecting || a.editKey == "" {
		return
	}
	a.connect(func(endpoint, key string) source { return newClient(endpoint, key) })
}

func (a *app) section(cx *core.Scope, title string, children ...core.Node) core.Node {
	var nodes []core.Node
	if title != "" {
		nodes = append(nodes, ui.Text(title, 11, ui.Medium, ui.ColorsOf(cx).Faint))
	}
	nodes = append(nodes, children...)
	return column(10, nodes...)
}

func (a *app) field(cx *core.Scope, label, hint string, input core.Node) core.Node {
	colors := ui.ColorsOf(cx)
	nodes := []core.Node{ui.Text(label, 12, ui.Medium, colors.Text), input}
	if hint != "" {
		nodes = append(nodes, core.Text{Content: hint, Style: core.Style{FontSize: 11, LineHeight: 15}, StyleFunc: ui.Colored(colors.Muted)})
	}
	return column(5, nodes...)
}

func (a *app) switchRow(cx *core.Scope, label, detail string, on func() bool, changed func(bool)) core.Node {
	colors := ui.ColorsOf(cx)
	text := column(1, oneLine(ui.Text(label, 13, ui.Regular, colors.Text)))
	if detail != "" {
		text.Children = append(text.Children, oneLine(ui.Text(detail, 11, ui.Regular, colors.Muted)))
	}
	text.Style = text.Style.Merge(core.Style{FlexGrow: 1, FlexShrink: 1})
	return row(12, text, ui.Switch{Checked: on, OnChange: changed, Label: label})
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
