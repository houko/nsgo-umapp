package main

import (
	"fmt"

	"github.com/nsgo-dev/nsgo/base"
	"github.com/nsgo-dev/nsgo/core"
	"github.com/nsgo-dev/nsgo/icons/lucide"
	"github.com/nsgo-dev/nsgo/ui"
)

// addPage adds a website to the account; its page then shows the tracking code it embeds (manage.go).
func (a *app) addPage(cx *core.Scope) core.Node {
	return core.View{Style: ui.FillRest, Children: []core.Node{a.pageHeader(cx, msgsOf(cx).AddWebsite()), a.addContent(cx)}}
}

// addContent is the add page without its bar, which the window shows under its own.
func (a *app) addContent(cx *core.Scope) core.Node {
	body := a.region(func() string {
		return fmt.Sprint(a.adding, a.addErr)
	}, func(cx *core.Scope) core.Node {
		return core.View{Style: core.Style{Padding: core.All(gutter), Gap: sectionGap,
			PaddingEnv: core.EnvEdges{Bottom: core.EnvKeyboard}}, Children: []core.Node{a.addForm(cx), a.addStatus(cx)}}
	})
	return core.Scroll{Style: ui.FillRest, TestID: "add", Children: []core.Node{body}}
}

func (a *app) addForm(cx *core.Scope) core.Node {
	tr := msgsOf(cx)
	busy := live(a, func() bool { return a.adding })
	return ui.FormSection{Footer: tr.AddWebsiteHint(), Children: []core.Node{
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
