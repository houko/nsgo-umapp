package main

import (
	"errors"
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
		return fmt.Sprint(a.adding, a.addErr, a.cfLoading, a.cfErr, a.cfTracking, a.cfSites)
	}, func(cx *core.Scope) core.Node {
		var children []core.Node
		cf := a.cloudflareSection(cx)
		if cf != nil {
			children = append(children, cf)
		}
		form := a.addForm(cx)
		if cf != nil {
			form.Title = msgsOf(cx).OtherWebsite()
		}
		children = append(children, form, a.addStatus(cx))
		return core.View{Style: core.Style{Padding: core.All(gutter), Gap: sectionGap,
			PaddingEnv: core.EnvEdges{Bottom: core.EnvKeyboard}}, Children: children}
	})
	return core.Scroll{Style: ui.FillRest, TestID: "add", Children: []core.Node{body}}
}

// cloudflareSection offers the websites of the Cloudflare accounts that Umapp's server can add with a tap, tracked with nothing to embed; nil on Umami, or when there is none to add.
func (a *app) cloudflareSection(cx *core.Scope) core.Node {
	if a.src == nil || a.src.hasDashboard() {
		return nil
	}
	tr := msgsOf(cx)
	section := func(rows ...core.Node) core.Node {
		return ui.FormSection{Title: tr.CloudflareSites(), Footer: tr.CloudflareSitesHint(), TestID: "cloudflare", Children: rows}
	}
	switch {
	case a.cfLoading && a.cfSites == nil:
		return section(ui.FormRow{Title: tr.Loading(), Control: ui.Spinner{Size: 14}})
	case errors.Is(a.cfErr, errNoCloudflare):
		return ui.FormSection{Title: tr.CloudflareSites(), TestID: "cloudflare", Children: []core.Node{
			ui.FormRow{Icon: lucide.CloudOff, Title: tr.CloudflareNoToken()},
		}}
	case a.cfErr != nil:
		return section(ui.FormRow{Icon: lucide.CircleAlert, Title: a.cfErr.Error(), Variant: ui.FormRowDanger})
	}
	var rows []core.Node
	for _, s := range a.cfSites {
		if s.Tracked || s.Unavailable != "" {
			continue
		}
		row := ui.FormRow{Icon: lucide.CirclePlus, Title: s.Domain, Detail: s.Account, Variant: ui.FormRowAccent,
			TestID: "track-" + s.Domain, OnPress: func() { a.trackSite(s.Domain) },
			Disabled: live(a, func() bool { return a.cfTracking != "" || a.adding })}
		if a.cfTracking == s.Domain {
			row.Control = ui.Spinner{Size: 14}
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return nil
	}
	return section(rows...)
}

func (a *app) addForm(cx *core.Scope) ui.FormSection {
	tr := msgsOf(cx)
	busy := live(a, func() bool { return a.adding || a.cfTracking != "" })
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
		Disabled: live(a, func() bool { return a.adding || a.cfTracking != "" || bareDomain(a.addDomain) == "" })}
	if a.adding {
		row.Title, row.Control = tr.Adding(), ui.Spinner{Size: 14}
	}
	return ui.FormSection{Children: append(rows, row)}
}
