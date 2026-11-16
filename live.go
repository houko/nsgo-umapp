package main

import (
	"github.com/nsgo-dev/nsgo/core"
	"github.com/nsgo-dev/nsgo/ui"
)

// track has the running computation follow the state.
func (a *app) track() {
	if a.rev != nil {
		a.rev.Get()
	}
}

// live is fn following the state, for a binding such as Disabled or a label.
func live[T any](a *app, fn func() T) func() T {
	return func() T {
		a.track()
		return fn()
	}
}

// region builds its nodes again only when key or the language changes, keeping what the user
// is doing inside it across other changes of the state.
func (a *app) region(key func() string, build func(cx *core.Scope) core.Node) core.Node {
	return core.Func(func(cx *core.Scope) core.Node {
		// The language shown is part of every key, so its words follow.
		memo := core.NewMemo(cx, func() string { return cx.Env().Language() + "\x00" + live(a, key)() })
		return core.Dynamic(func(cx *core.Scope) core.Node {
			memo.Get()
			var node core.Node
			cx.Untrack(func() { node = build(cx) })
			return node
		})
	})
}

func row(gap core.Points, children ...core.Node) core.View {
	return core.View{Style: core.Style{Direction: core.Row, AlignItems: core.AlignCenter, Gap: gap, MinWidth: core.Pt(0)}, Children: children}
}

func column(gap core.Points, children ...core.Node) core.View {
	return core.View{Style: core.Style{Gap: gap, MinWidth: core.Pt(0)}, Children: children}
}

func oneLine(t core.Text) core.Text {
	t.MaxLines = 1
	t.Style = t.Style.Merge(core.Style{FlexShrink: 1, MinWidth: core.Pt(0)})
	return t
}

func body(cx *core.Scope, text string) core.Text {
	return oneLine(ui.Text(text, 13, ui.Regular, ui.ColorsOf(cx).Text))
}

func caption(cx *core.Scope, text string) core.Text {
	return oneLine(ui.Text(text, 12, ui.Regular, ui.ColorsOf(cx).Muted))
}

func muted(cx *core.Scope, text string, size core.Points) core.Text {
	return ui.Text(text, size, ui.Regular, ui.ColorsOf(cx).Muted)
}

func constant(s string) func() string { return func() string { return s } }
