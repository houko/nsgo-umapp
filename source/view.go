package main

import (
	"fmt"
	"math"
	"strconv"

	"github.com/oneo-me/nsgo/base"
	"github.com/oneo-me/nsgo/core"
	"github.com/oneo-me/nsgo/desktop"
	"github.com/oneo-me/nsgo/icons/lucide"
	"github.com/oneo-me/nsgo/ui"
)

const (
	panelWidth  = 360
	panelHeight = 560
	gutter      = 16
)

func (a *app) root(cx *core.Scope) core.Node {
	cx.SetTheme(ui.WarmDuskTheme())
	cx.OnKey("mod+r", func() {
		if a.configured() {
			a.refresh()
		}
	})
	cx.OnKey("mod+1", func() { a.setRange(0) })
	cx.OnKey("mod+2", func() { a.setRange(1) })
	cx.OnKey("mod+3", func() { a.setRange(2) })
	cx.OnKey("mod+4", func() { a.setRange(3) })
	cx.OnKey("mod+,", func() {
		if !a.configured() {
			return
		}
		a.resetSettings()
		a.page = pageSettings
		a.invalidate()
	})
	cx.OnKey("escape", func() {
		if a.page != pageSites && a.configured() {
			a.back()
		}
	})
	colors := ui.ColorsOf(cx)
	return core.View{Style: core.Style{FlexGrow: 1, MinHeight: core.Pt(0), FontSize: 13},
		StyleFunc: func() core.Style {
			if desktop.ShowsMaterial(cx) {
				return core.Style{Color: colors.Text()}
			}
			return core.Style{Background: colors.Surface(), Color: colors.Text()}
		},
		Children: []core.Node{
			a.region(a.pageKey, func(cx *core.Scope) core.Node {
				switch {
				case a.page == pageSettings:
					return a.settings(cx)
				case a.page == pageSite && a.site(a.open) != nil:
					return a.region(a.detailKey, func(cx *core.Scope) core.Node {
						return column(0, a.header(cx), a.detail(cx, a.site(a.open)))
					})
				default:
					return a.region(a.listContentKey, func(cx *core.Scope) core.Node {
						return column(0, a.header(cx), a.list(cx))
					})
				}
			}),
		}}
}

func (a *app) pageKey() string {
	return fmt.Sprint(a.page, a.open, a.configured())
}

func (a *app) listContentKey() string {
	return fmt.Sprint(a.cfg.Range, a.cfg.CustomOrder, a.listErr, a.loading, a.gen, a.loadedAt, a.listKey())
}

func (a *app) detailKey() string {
	s := a.site(a.open)
	if s == nil {
		return a.open
	}
	return fmt.Sprint(a.cfg.Range, a.loading, a.gen, s.detailGen, len(s.pages), len(s.referrers), len(s.countries), s.detailErr, s.loaded)
}

func (a *app) header(cx *core.Scope) core.Node {
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 4,
		Padding: core.Edges{Top: 12, Right: 12, Bottom: 8, Left: gutter}, FlexShrink: 0},
		Children: []core.Node{
			a.rangeControl(cx),
			ui.Spacer{},
			a.toolButton(cx, lucide.RefreshCw, a.msgs().Refresh(), live(a, func() bool { return a.loading > 0 }), a.refresh, "refresh"),
			a.toolButton(cx, lucide.Settings, a.msgs().Settings(), nil, func() {
				a.resetSettings()
				a.page = pageSettings
				a.invalidate()
			}, "settings"),
		}}
}

func (a *app) rangeControl(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	return ui.Tabs[int]{
		Options: []ui.Option[int]{
			{Value: 0, Label: tr.Range24h(), TestID: "24H"},
			{Value: 1, Label: tr.Range7d(), TestID: "7D"},
			{Value: 2, Label: tr.Range30d(), TestID: "30D"},
			{Value: 3, Label: tr.Range90d(), TestID: "90D"},
		},
		Value:    live(a, func() int { return a.cfg.Range }),
		OnChange: a.setRange,
		Label:    tr.Order(),
		TestID:   "range",
		Size:     ui.SizeSmall,
	}
}

func (a *app) toolButton(cx *core.Scope, icon func() *core.SVG, label string, disabled func() bool, press func(), id string) core.Node {
	return ui.IconButton{Icon: icon, Label: label, Disabled: disabled, OnPress: press, TestID: id}
}

func (a *app) list(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	switch {
	case a.listErr != nil && len(a.sites) == 0:
		return a.problem(cx, tr.LoadErrorTitle(), a.listErr.Error())
	case len(a.sites) == 0 && a.loading > 0:
		return column(0, a.summary(cx), a.skeletonList(cx))
	case len(a.visible()) == 0:
		if len(a.sites) == 0 {
			return a.problem(cx, tr.NoSitesTitle(), tr.NoSitesBody())
		}
		return a.problem(cx, tr.AllHiddenTitle(), tr.AllHiddenBody())
	}
	return core.View{Style: ui.FillRest, Children: []core.Node{
		a.summary(cx),
		a.listHeading(cx),
		a.region(a.listKey, a.siteList),
		a.footer(cx),
	}}
}

func (a *app) listKey() string {
	var b string
	b += fmt.Sprint(a.cfg.CustomOrder, a.cfg.Range, a.loading, a.gen)
	for _, s := range a.visible() {
		b += fmt.Sprintf("%s:%v:%d:%g;", s.ID, s.loaded, s.active, s.cur.Visitors)
	}
	return b
}

func (a *app) listHeading(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 2,
		Padding: core.Edges{Top: 8, Right: gutter, Bottom: 2, Left: gutter}, FlexShrink: 0},
		Children: []core.Node{
			ui.Text(tr.Websites(), 11, ui.Medium, colors.Faint),
			a.orderMenu(cx),
			ui.Spacer{},
			ui.Text(tr.Visitors(), 11, ui.Medium, colors.Faint),
		}}
}

func (a *app) orderMenu(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	label := tr.ByVisitors()
	if a.cfg.CustomOrder {
		label = tr.InYourOrder()
	}
	return ui.Menu{
		Trigger: ui.Button{Text: label, Variant: ui.ButtonGhost, TestID: "order"},
		Face: row(3,
			muted(cx, label, 11),
			ui.Icon(lucide.ChevronDown, 10, colors.Faint),
		),
		Label:  tr.Order(),
		TestID: "order",
		Children: []core.Node{
			ui.MenuItem{Text: tr.MostVisitorsFirst(), Checked: live(a, func() bool { return !a.cfg.CustomOrder }),
				OnSelect: func() { a.setCustomOrder(false) }},
			ui.MenuItem{Text: tr.YourOrder(), Checked: live(a, func() bool { return a.cfg.CustomOrder }),
				OnSelect: func() { a.setCustomOrder(true) }},
		},
	}
}

func (a *app) siteList(cx *core.Scope) core.Node {
	vis := a.visible()
	children := make([]core.Node, 0, len(vis))
	for i, s := range vis {
		children = append(children, a.siteRow(cx, s, i))
	}
	return ui.ScrollView{Style: ui.FillRest, TestID: "sites",
		ContentStyle: core.Style{Padding: core.Edges{Top: 0, Right: 6, Bottom: 6, Left: 6}, Gap: 0},
		Children:     children}
}

func (a *app) siteRow(cx *core.Scope, s *site, _ int) core.Node {
	colors := ui.ColorsOf(cx)
	id := s.ID
	name := s.Name
	domain := s.Domain
	if domain == "" {
		domain = "—"
	}
	left := column(1,
		row(6, oneLine(ui.Text(name, 13, ui.Medium, colors.Text)), a.liveBadge(cx, s.active, false)),
		caption(cx, domain),
	)
	left.Style = left.Style.Merge(core.Style{FlexGrow: 1, FlexShrink: 1, MinWidth: core.Pt(0)})
	var spark core.Node
	switch {
	case !s.loaded:
		spark = ui.SkeletonBlock{Width: core.Pt(56), Height: core.Pt(20)}
	case s.err != nil && s.cur.Visitors == 0:
		spark = ui.Icon(lucide.CircleAlert, 13, colors.Danger)
	default:
		spark = a.sparkline(cx, s.visitors, 20, 56, false)
	}
	right := column(1, a.visitorCount(cx, s)...)
	right.Style = right.Style.Merge(core.Style{Width: core.Pt(58), AlignItems: core.AlignEnd})
	return base.Button{
		Label: name, TestID: id,
		OnPress: func(core.PressEvent) { a.openSite(id) },
		Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 12,
			Padding: core.Symmetric(8, 10), CornerRadius: 8, Width: core.Pct(100)},
		StyleFunc: func() core.Style {
			return core.Style{
				Hover:  &core.Style{Background: colors.Hover()},
				Active: &core.Style{Background: colors.Pressed()},
			}
		},
		Children: []core.Node{left, spark, right},
	}
}

func (a *app) visitorCount(cx *core.Scope, s *site) []core.Node {
	if !s.loaded {
		return []core.Node{
			ui.SkeletonBlock{Width: core.Pt(32), Height: core.Pt(11), Style: core.Style{Margin: core.Symmetric(2, 0)}},
			ui.SkeletonBlock{Width: core.Pt(24), Height: core.Pt(9), Style: core.Style{Margin: core.Symmetric(2, 0)}},
		}
	}
	return []core.Node{
		ui.Tabular(ui.Text(count(float64(s.cur.Visitors)), 13, ui.Semibold, ui.ColorsOf(cx).Text)),
		a.delta(cx, float64(s.cur.Visitors), float64(s.prev.Visitors), false),
	}
}

func (a *app) skeletonList(cx *core.Scope) core.Node {
	rows := make([]core.Node, 4)
	for i := range rows {
		rows[i] = a.skeletonRow(cx)
	}
	return column(0, rows...)
}

func (a *app) skeletonRow(cx *core.Scope) core.Node {
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 12, Padding: core.Symmetric(8, 10)},
		Children: []core.Node{
			column(6, ui.SkeletonBlock{Width: core.Pt(120), Height: core.Pt(11)}, ui.SkeletonBlock{Width: core.Pt(80), Height: core.Pt(9)}),
			ui.SkeletonBlock{Width: core.Pt(56), Height: core.Pt(20)},
			column(6, ui.SkeletonBlock{Width: core.Pt(32), Height: core.Pt(11)}, ui.SkeletonBlock{Width: core.Pt(24), Height: core.Pt(9)}),
		}}
}

func (a *app) summary(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	cur, prev, visitors, active, loaded := a.totals()
	var figure core.Node
	if loaded && len(a.sites) > 0 {
		figure = row(10,
			ui.Tabular(ui.Text(count(float64(cur.Visitors)), 30, ui.Semibold, colors.Text)),
			a.delta(cx, float64(cur.Visitors), float64(prev.Visitors), false),
			ui.Spacer{},
			row(4, ui.Tabular(ui.Text(count(float64(cur.Pageviews)), 13, ui.Semibold, colors.Text)), muted(cx, tr.Views(), 13)),
		)
	} else {
		figure = ui.SkeletonBlock{Width: core.Pt(96), Height: core.Pt(26), Style: core.Style{Margin: core.Edges{Top: 6, Bottom: 4}}}
	}
	return core.View{Style: core.Style{Padding: core.Edges{Top: 6, Right: gutter, Bottom: 4, Left: gutter}, Gap: 2, FlexShrink: 0},
		Children: []core.Node{
			row(6, ui.Text(tr.Visitors(), 12, ui.Medium, colors.Muted), ui.Spacer{}, a.liveBadge(cx, active, true)),
			figure,
			a.sparkline(cx, visitors, 40, 0, true),
		}}
}

func (a *app) footer(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	compared := oneLine(ui.Text(tr.ComparedWith(a.spanLong()), 11, ui.Regular, colors.Faint))
	compared.Style = compared.Style.Merge(core.Style{FlexGrow: 1, FlexShrink: 1})
	children := []core.Node{compared}
	if !a.loadedAt.IsZero() {
		children = append(children, ui.Text(tr.Updated(ago(a.now(), a.loadedAt)), 11, ui.Regular, colors.Faint))
	}
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 6, FlexShrink: 0,
		Padding: core.Edges{Top: 8, Right: gutter, Bottom: 10, Left: gutter}, Borders: core.Edges{Top: 1}},
		StyleFunc: func() core.Style { return core.Style{BorderColor: colors.Line()} },
		Children:  children}
}

func (a *app) liveBadge(cx *core.Scope, n int, long bool) core.Node {
	if n <= 0 && !long {
		return core.Group(nil)
	}
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	dotColor := colors.Faint
	textColor := colors.Muted
	weight := ui.Regular
	if n > 0 {
		dotColor = colors.Up
		textColor = colors.Up
		weight = ui.Medium
	}
	label := strconv.Itoa(n)
	if long {
		label = tr.Online(n)
	}
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 5},
		Label: tr.LiveTooltip(n, a.unitWord(n, tr.Visitor(), tr.VisitorsUnit())),
		Children: []core.Node{
			core.View{Style: core.Style{Width: core.Pt(6), Height: core.Pt(6), CornerRadius: 3}, StyleFunc: ui.Filled(dotColor)},
			ui.Tabular(ui.Text(label, 11, weight, textColor)),
		}}
}

func (a *app) delta(cx *core.Scope, cur, prev float64, worse bool) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	f, ok := change(cur, prev)
	switch {
	case !ok && cur == 0:
		return muted(cx, tr.Dash(), 11)
	case !ok:
		return muted(cx, tr.New(), 11)
	case math.Abs(f) < 0.005:
		return muted(cx, "0%", 11)
	}
	good := f > 0 != worse
	c := colors.Down
	icon := lucide.ArrowDown
	if good {
		c = colors.Up
	}
	if f > 0 {
		icon = lucide.ArrowUp
	}
	return row(1, ui.Icon(icon, 10, c), ui.Tabular(ui.Text(percent(f), 11, ui.Medium, c)))
}

func (a *app) sparkline(cx *core.Scope, values []float64, h, w float32, wide bool) core.Node {
	style := core.Style{Height: core.Pt(core.Points(h)), FlexGrow: 1, MinWidth: core.Pt(0)}
	if w > 0 {
		style.Width, style.FlexGrow = core.Pt(core.Points(w)), 0
	}
	if len(values) < 2 {
		return core.View{Style: style}
	}
	vals := append([]float64(nil), values...)
	colors := ui.ColorsOf(cx)
	width := float32(1.5)
	if wide {
		width = 1.75
	}
	return core.Canvas{
		Style: style,
		Draw: func(d *core.Drawing, size core.Size) {
			a.track()
			hi := 0.0
			for _, v := range vals {
				if v > hi {
					hi = v
				}
			}
			empty := hi == 0
			if empty {
				hi = 1
			}
			accent := colors.Accent()
			if empty {
				accent = colors.Faint()
			}
			n := len(vals)
			w, ht := float32(size.Width), float32(size.Height)-2
			if w <= 0 || ht <= 0 {
				return
			}
			d.SetLineWidth(width)
			d.SetStrokeColor(accent)
			d.SetFillColor(ui.Alpha(accent, 0.2))
			d.BeginPath()
			for i, v := range vals {
				x := float32(i) / float32(n-1) * w
				y := 1 + ht - float32(v/hi*0.92)*ht
				if i == 0 {
					d.MoveTo(x, y)
				} else {
					d.LineTo(x, y)
				}
			}
			d.Stroke()
			d.LineTo(w, 1+ht)
			d.LineTo(0, 1+ht)
			d.ClosePath()
			d.Fill()
		},
	}
}

func (a *app) problem(cx *core.Scope, title, detail string) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	actions := []core.Node{}
	if a.listErr != nil {
		actions = append(actions, ui.Button{Text: tr.TryAgain(), TestID: "retry", OnPress: a.refresh})
	}
	actions = append(actions, ui.Button{Text: tr.Settings(), Variant: ui.ButtonSecondary, TestID: "open-settings", OnPress: func() {
		a.resetSettings()
		a.page = pageSettings
		a.invalidate()
	}})
	return core.View{Style: core.Style{FlexGrow: 1, AlignItems: core.AlignCenter, JustifyContent: core.JustifyCenter, Gap: 6,
		Padding: core.Symmetric(24, 32)},
		Children: []core.Node{
			ui.Text(title, 14, ui.Semibold, colors.Text),
			core.Text{Content: detail, Style: core.Style{FontSize: 12, TextAlign: core.TextAlignCenter, LineHeight: 16},
				StyleFunc: ui.Colored(colors.Muted)},
			row(8, actions...),
		}}
}
