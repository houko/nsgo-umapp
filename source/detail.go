package main

import (
	"fmt"
	"math"
	"time"

	"github.com/oneo-me/nsgo/base/plot"
	"github.com/oneo-me/nsgo/core"
	"github.com/oneo-me/nsgo/icons/lucide"
	"github.com/oneo-me/nsgo/ui"
)

func (a *app) detail(cx *core.Scope, s *site) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	nav := []core.Node{
		ui.Button{Text: tr.Websites(), Icon: lucide.ChevronLeft, Variant: ui.ButtonGhost, TestID: "back", OnPress: a.back},
		ui.Spacer{},
	}
	if u := dashboardURL(a.cfg.Endpoint, s.ID); u != "" {
		nav = append(nav, ui.Button{Text: tr.OpenUmami(), Icon: lucide.ExternalLink, Variant: ui.ButtonGhost, TestID: "open",
			OnPress: func() { cx.OpenURL(u, nil) }})
	}
	return ui.ScrollView{Style: ui.FillRest, TestID: "detail-" + s.ID,
		ContentStyle: core.Style{Padding: core.All(gutter), Gap: 18},
		Children: []core.Node{
			row(0, nav...),
			column(2,
				row(8, oneLine(ui.Text(s.Name, 17, ui.Semibold, colors.Text)), a.liveBadge(cx, s.active, true)),
				domainLine(cx, s.Domain),
			),
			a.metricsGrid(cx, s),
			a.chart(cx, s),
			a.detailError(cx, s),
			breakdown(cx, tr.Pages(), tr.Views(), "path", s.pages, s.detailGen == a.gen && s.pages == nil && s.detailErr == nil),
			breakdown(cx, tr.Referrers(), tr.Visitors(), "referrer", s.referrers, s.pages == nil && s.detailErr == nil),
			breakdown(cx, tr.Countries(), tr.Visitors(), "country", s.countries, s.pages == nil && s.detailErr == nil),
		}}
}

func domainLine(cx *core.Scope, domain string) core.Node {
	if domain == "" {
		return core.Group(nil)
	}
	return caption(cx, domain)
}

func (a *app) detailError(cx *core.Scope, s *site) core.Node {
	if s.detailErr == nil {
		return core.Group(nil)
	}
	colors := ui.ColorsOf(cx)
	return row(6, ui.Icon(lucide.CircleAlert, 14, colors.Danger),
		core.Text{Content: s.detailErr.Error(), Style: core.Style{FontSize: 12, FlexGrow: 1}, StyleFunc: ui.Colored(colors.Muted)})
}

func (a *app) metricsGrid(cx *core.Scope, s *site) core.Node {
	tr := msgsOf(cx)
	perVisit := func(st stats) float64 {
		if st.Visits == 0 {
			return 0
		}
		return float64(st.Pageviews) / float64(st.Visits)
	}
	cells := []struct {
		label     string
		value     string
		cur, prev float64
		worse     bool
	}{
		{tr.Visitors(), count(float64(s.cur.Visitors)), float64(s.cur.Visitors), float64(s.prev.Visitors), false},
		{tr.Visits(), count(float64(s.cur.Visits)), float64(s.cur.Visits), float64(s.prev.Visits), false},
		{tr.Views(), count(float64(s.cur.Pageviews)), float64(s.cur.Pageviews), float64(s.prev.Pageviews), false},
		{tr.ViewsPerVisit(), fmt.Sprintf("%.1f", perVisit(s.cur)), perVisit(s.cur), perVisit(s.prev), false},
		{tr.BounceRate(), percent(s.cur.bounceRate()), s.cur.bounceRate(), s.prev.bounceRate(), true},
		{tr.VisitDuration(), duration(s.cur.visitDuration()), s.cur.visitDuration().Seconds(), s.prev.visitDuration().Seconds(), false},
	}
	children := make([]core.Node, 0, len(cells))
	for _, m := range cells {
		children = append(children, a.metricCell(cx, s.loaded, m.label, m.value, m.cur, m.prev, m.worse))
	}
	return core.View{Style: core.Style{Display: core.DisplayGrid, GridTemplateColumns: core.GridTracks("1fr 1fr 1fr"), Gap: 12},
		Children: children}
}

func (a *app) metricCell(cx *core.Scope, loaded bool, label, value string, cur, prev float64, worse bool) core.Node {
	colors := ui.ColorsOf(cx)
	inner := []core.Node{ui.Text(label, 11, ui.Regular, colors.Muted)}
	if !loaded {
		inner = append(inner,
			ui.SkeletonBlock{Width: core.Pt(48), Height: core.Pt(16), Style: core.Style{Margin: core.Symmetric(2, 0)}},
			ui.SkeletonBlock{Width: core.Pt(28), Height: core.Pt(9)},
		)
	} else {
		delta := a.delta(cx, 0, 0, worse)
		if cur != 0 || prev != 0 {
			delta = a.delta(cx, cur, prev, worse)
		}
		inner = append(inner, ui.Tabular(ui.Text(value, 17, ui.Semibold, colors.Text)), delta)
	}
	return column(3, inner...)
}

func (a *app) chart(cx *core.Scope, s *site) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	n := len(a.buckets)
	if n == 0 || len(s.views) != n || len(s.visitors) != n {
		return core.View{Style: core.Style{Height: core.Pt(150), CornerRadius: 8}, StyleFunc: ui.Filled(colors.Hover)}
	}
	views, visitors := append([]float64(nil), s.views...), append([]float64(nil), s.visitors...)
	hi := 4.0
	for _, v := range views {
		if v > hi {
			hi = v
		}
	}
	label := tr.ChartByDay()
	if a.span().hours {
		label = tr.ChartByHour()
	}
	ticks := axisTicks(n, a.span().hours, a.buckets)
	return column(8,
		row(12,
			legend(cx, colors.Accent, tr.Visitors()),
			legend(cx, func() core.Color { return ui.Alpha(colors.Accent(), 0.28) }, tr.Views()),
		),
		plot.Plot{
			Count:  func() int { return n },
			YScale: func() plot.Scale { return plot.LinearScale(0, hi) },
			XScale: func() plot.Scale { return plot.BandScale(plot.Band{PaddingInner: 0.28, PaddingOuter: 0.06}) },
			Label:  label,
			TestID: "chart",
			Style:  core.Style{Height: core.Pt(150)},
			Children: []core.Node{
				plot.Grid{StyleFunc: func() core.Style { return core.Style{Stroke: core.PaintColor(colors.Line())} }},
				plot.Bar{Value: func() []float64 { return views }, HoverDim: 0.6,
					Corners: plot.Corners{TopLeft: 2, TopRight: 2},
					StyleFunc: func() core.Style {
						return core.Style{Fill: core.PaintColor(ui.Alpha(colors.Accent(), 0.28))}
					}},
				plot.Bar{Value: func() []float64 { return visitors }, HoverDim: 0.4,
					Corners:   plot.Corners{TopLeft: 2, TopRight: 2},
					StyleFunc: func() core.Style { return core.Style{Fill: core.PaintColor(colors.Accent())} }},
				plot.Axis{Placement: plot.AxisBottom, TickValues: func() []float64 { return ticks.at },
					Format: func(_ float64, i int) string {
						if i >= 0 && i < len(ticks.labels) {
							return ticks.labels[i]
						}
						return ""
					},
					LabelStyleFunc: func() core.Style {
						return core.Style{FontSize: 10, Color: colors.Faint()}
					}},
			},
		},
	)
}

type axisLabels struct {
	at     []float64
	labels []string
}

func axisTicks(n int, hours bool, buckets []time.Time) axisLabels {
	every := map[int]int{24: 6, 7: 1, 30: 7, 90: 30}[n]
	if every == 0 {
		every = max(1, n/4)
	}
	var out axisLabels
	for i := 0; i < n; i += every {
		if n-i < every/2 && i != 0 {
			break
		}
		l := buckets[i].Format("Jan 2")
		if hours {
			l = buckets[i].Format("15:04")
		} else if n == 7 {
			l = buckets[i].Format("Mon")
		}
		out.at = append(out.at, float64(i))
		out.labels = append(out.labels, l)
	}
	return out
}

func legend(cx *core.Scope, color func() core.Color, label string) core.Node {
	return row(5,
		core.View{Style: core.Style{Width: core.Pt(8), Height: core.Pt(8), CornerRadius: 2}, StyleFunc: ui.Filled(color)},
		muted(cx, label, 11),
	)
}

func breakdown(cx *core.Scope, title, unit, kind string, rows []metric, loading bool) core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	head := core.View{Style: core.Style{Direction: core.Row},
		Children: []core.Node{
			core.Text{Content: title, Style: core.Style{FontSize: 11, FontWeight: ui.Medium, FlexGrow: 1}, StyleFunc: ui.Colored(colors.Faint)},
			ui.Text(unit, 11, ui.Medium, colors.Faint),
		}}
	var body core.Node
	switch {
	case loading:
		sk := make([]core.Node, 3)
		for i := range sk {
			sk[i] = ui.SkeletonBlock{Width: core.Pt(core.Points(160 - i*36)), Height: core.Pt(10),
				Style: core.Style{Height: core.Pt(28), AlignItems: core.AlignCenter}}
		}
		body = column(0, sk...)
	case len(rows) == 0:
		body = ui.Text(tr.NothingInRange(), 12, ui.Regular, colors.Faint)
	default:
		top := math.Max(float64(rows[0].Y), 1)
		items := make([]core.Node, 0, len(rows))
		for _, m := range rows {
			share := float32(float64(m.Y) / top * 100)
			label := pathLabel(kind, m.X)
			items = append(items, core.View{Style: core.Style{Height: core.Pt(28)}, Children: []core.Node{
				core.View{Style: core.Style{Position: core.Absolute, Top: core.Pt(0), Bottom: core.Pt(0), Left: core.Pt(0),
					Width: core.Pct(share), CornerRadius: 5},
					StyleFunc: func() core.Style { return core.Style{Background: ui.Alpha(colors.Accent(), 0.1)} }},
				core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: 8, FlexGrow: 1,
					Padding: core.All(6), Height: core.Pt(28)},
					Children: []core.Node{
						oneLine(ui.Text(label, 12, ui.Regular, colors.Text)),
						ui.Tabular(ui.Text(count(float64(m.Y)), 12, ui.Regular, colors.Muted)),
					}},
			}})
		}
		body = column(0, items...)
	}
	return column(4, head, body)
}
