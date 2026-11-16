package main

// Umapp counts its own use on Umapp's Umami: the web build through Umami's script, always (analytics_js.go), and the apps by sending page views themselves while the user leaves it on (analytics_native.go).
const (
	analyticsOrigin  = "https://umami.oneo.me"
	analyticsWebsite = "29e04798-7aeb-4e90-81f8-bb1f7727362d"
)

// pagePath is the path a page counts as: the page's kind alone, never the website it shows.
func pagePath(p page) string {
	switch p {
	case pageSite:
		return "/site"
	case pageSettings:
		return "/settings"
	case pageAdd:
		return "/add"
	}
	return "/"
}

// trackPage counts the page shown when it differs from the one counted last, while the user leaves analytics on.
func (a *app) trackPage() {
	if a.sendView == nil || a.cfg.NoAnalytics || a.page == a.tracked {
		return
	}
	a.tracked = a.page
	a.sendView(pagePath(a.page))
}
