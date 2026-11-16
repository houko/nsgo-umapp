package main

import (
	"fmt"

	"github.com/nsgo-dev/nsgo/base"
	"github.com/nsgo-dev/nsgo/core"
	"github.com/nsgo-dev/nsgo/icons/lucide"
	"github.com/nsgo-dev/nsgo/ui"
)

// addPage adds a website to the account, then shows the tracking code it embeds.
func (a *app) addPage(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	body := a.region(func() string {
		return fmt.Sprint(a.adding, a.addErr, a.added != nil, a.copied)
	}, func(cx *core.Scope) core.Node {
		var nodes []core.Node
		if a.added == nil {
			nodes = []core.Node{a.addForm(cx), a.addStatus(cx)}
		} else {
			nodes = a.addedSections(cx, *a.added)
		}
		return core.View{Style: core.Style{Padding: core.All(gutter), Gap: sectionGap,
			PaddingEnv: core.EnvEdges{Bottom: core.EnvKeyboard}}, Children: nodes}
	})
	return core.View{Style: ui.FillRest, Children: []core.Node{
		a.pageHeader(cx, tr.AddWebsite()),
		core.Scroll{Style: ui.FillRest, TestID: "add", Children: []core.Node{body}},
	}}
}

func (a *app) addForm(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	busy := live(a, func() bool { return a.adding })
	return ui.FormSection{Children: []core.Node{
		ui.FormField{Title: tr.Domain(), Input: base.Input{
			Value: live(a, func() string { return a.addDomain }), Placeholder: "example.com",
			AutoFocus: true, Disabled: busy, TestID: "domain",
			OnChange: func(s string) { a.addDomain = s; a.invalidate() },
			OnSubmit: func(string) { a.addWebsite() },
		}},
		ui.FormField{Title: tr.WebsiteName(), Input: base.Input{
			Value: live(a, func() string { return a.addName }), Placeholder: tr.Domain(),
			Disabled: busy, TestID: "name",
			OnChange: func(s string) { a.addName = s; a.invalidate() },
			OnSubmit: func(string) { a.addWebsite() },
		}},
	}}
}

// addStatus is what went wrong adding, and the button that adds.
func (a *app) addStatus(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	var rows []core.Node
	if a.addErr != "" {
		rows = append(rows, ui.FormRow{Icon: lucide.CircleAlert, Title: a.addErr, Variant: ui.FormRowDanger})
	}
	row := ui.FormRow{Title: tr.Add(), Variant: ui.FormRowAccent, TestID: "add-website", OnPress: a.addWebsite,
		Disabled: live(a, func() bool { return a.adding || bareDomain(a.addDomain) == "" })}
	if a.adding {
		row.Title, row.Control = tr.Adding(), ui.Spinner{Size: 14}
	}
	return ui.FormSection{Children: append(rows, row)}
}

// addedSections show the added website's tracking code, to copy.
func (a *app) addedSections(cx *core.Scope, w website) []core.Node {
	tr := msgsOf(cx)
	colors := ui.ColorsOf(cx)
	code := core.Text{Content: trackingCode(a.cfg.Endpoint, w.ID), Selectable: core.SelectableOn, TestID: "tracking-code",
		Style:     core.Style{FontFamily: ui.Mono, FontSize: 11, LineHeight: 16, Padding: core.All(inset)},
		StyleFunc: ui.Colored(colors.Text)}
	return []core.Node{
		ui.FormSection{Title: tr.TrackingCode(), Footer: tr.TrackingCodeHint(), Children: []core.Node{
			code,
			a.copyRow(cx, w.ID),
		}},
		ui.FormSection{Children: []core.Node{
			ui.FormRow{Title: tr.Done(), TestID: "done", OnPress: a.back},
		}},
	}
}

func (a *app) copyRow(cx *core.Scope, id string) core.Node {
	tr := msgsOf(cx)
	if a.copied == id {
		return ui.FormRow{Icon: lucide.Check, Title: tr.Copied(), TestID: "copy"}
	}
	return ui.FormRow{Icon: lucide.Copy, Title: tr.Copy(), Variant: ui.FormRowAccent, TestID: "copy",
		OnPress: func() { a.copyTrackingCode(cx, id) }}
}

// copyTrackingCode puts website id's tracking code on the clipboard.
func (a *app) copyTrackingCode(cx *core.Scope, id string) {
	cx.SetClipboard(trackingCode(a.cfg.Endpoint, id))
	a.copied = id
	a.invalidate()
}
