package main

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/oneo-me/nsgo/core"
	"github.com/oneo-me/nsgo/nsgotest"
)

type fake struct {
	sites  []website
	scale  map[string]float64
	err    error
	calls  int
	mu     sync.Mutex
	keyErr bool
}

func newFake() *fake {
	return &fake{
		sites: []website{
			{ID: "a", Name: "Acme Docs", Domain: "docs.acme.dev"},
			{ID: "b", Name: "Personal blog", Domain: "egoist.dev"},
			{ID: "c", Name: "Landing page", Domain: "acme.dev"},
			{ID: "d", Name: "Changelog", Domain: "changelog.acme.dev"},
			{ID: "e", Name: "Status", Domain: "status.acme.dev"},
		},
		scale: map[string]float64{"a": 120, "b": 46, "c": 210, "d": 9, "e": 0},
	}
}

func (f *fake) websites(context.Context) ([]website, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	if f.keyErr {
		return nil, &apiError{status: 401}
	}
	return f.sites, f.err
}

func (f *fake) stats(_ context.Context, id string, from, to time.Time) (cur, prev stats, err error) {
	k := f.scale[id] * to.Sub(from).Hours() / 24
	cur = stats{Pageviews: num(k * 3.1), Visitors: num(k), Visits: num(k * 1.3), Bounces: num(k * 0.55), Totaltime: num(k * 1.3 * 94)}
	p := k * (0.8 + 0.1*float64(len(id)+int(id[0])%4))
	prev = stats{Pageviews: num(p * 3), Visitors: num(p), Visits: num(p * 1.25), Bounces: num(p * 0.6), Totaltime: num(p * 1.25 * 80)}
	return cur, prev, nil
}

func (f *fake) active(_ context.Context, id string) (int, error) {
	return int(f.scale[id] / 30), nil
}

func (f *fake) series(_ context.Context, id string, from, to time.Time, unit, _ string) (views, visitors []point, err error) {
	step := 24 * time.Hour
	if unit == "hour" {
		step = time.Hour
	}
	for t, i := from, 0; !t.After(to); t, i = t.Add(step), i+1 {
		v := f.scale[id] / 24
		if unit == "day" {
			v = f.scale[id] * (1 + 0.25*math.Sin(float64(i)/2.3))
		} else {
			v *= 1 + 0.8*math.Sin(float64(t.Hour()-9)/24*2*math.Pi)
		}
		v = math.Round(v)
		if v <= 0 {
			continue
		}
		x := t.Format("2006-01-02 15:04:05")
		visitors = append(visitors, point{X: x, Y: num(v)})
		views = append(views, point{X: x, Y: num(v * 2.9)})
	}
	return views, visitors, nil
}

func (f *fake) metrics(_ context.Context, id, kind string, _, _ time.Time, limit int) ([]metric, error) {
	k := f.scale[id]
	var rows []metric
	switch kind {
	case "path":
		rows = []metric{{"/", num(k * 2)}, {"/docs/getting-started", num(k * 1.1)}, {"/pricing", num(k * 0.6)}, {"/blog/introducing-acme-2", num(k * 0.3)}, {"/about", num(k * 0.1)}}
	case "referrer":
		rows = []metric{{"", num(k)}, {"www.google.com", num(k * 0.7)}, {"github.com", num(k * 0.4)}, {"news.ycombinator.com", num(k * 0.2)}}
	case "country":
		rows = []metric{{"US", num(k * 0.9)}, {"DE", num(k * 0.4)}, {"JP", num(k * 0.3)}, {"CN", num(k * 0.2)}}
	}
	if k == 0 {
		rows = nil
	}
	return rows[:min(limit, len(rows))], nil
}

func testApp(t *testing.T, f *fake) *app {
	t.Helper()
	cfg := config{Endpoint: cloudEndpoint, Key: "api_test"}
	var src source
	if f != nil {
		src = f
	}
	a := newApp(cfg, src)
	if f == nil {
		a.cfg.Key = ""
		a.page = pageSettings
		a.resetSettings()
	}
	loc := time.FixedZone("CST", 8*3600)
	a.now = func() time.Time { return time.Date(2026, 10, 12, 15, 20, 0, 0, loc) }
	return a
}

type tester struct {
	*nsgotest.App
	a *app
}

func build(t *testing.T, a *app) *tester {
	t.Helper()
	return &tester{App: nsgotest.Start(t, func(cx *core.Scope) core.Node {
		cx.SetLocale("en")
		a.attach(cx)
		return a.root(cx)
	}, nsgotest.Size(panelWidth, panelHeight)), a: a}
}

func (tt *tester) hasText(s string) bool {
	for _, text := range tt.Texts() {
		if strings.Contains(text, s) {
			return true
		}
	}
	return false
}

func names(sites []*site) []string {
	var out []string
	for _, s := range sites {
		out = append(out, s.Name)
	}
	return out
}

func TestList(t *testing.T) {
	a := testApp(t, newFake())
	a.refresh()
	if v := a.visible(); v[0].ID != "c" || v[len(v)-1].ID != "e" {
		t.Errorf("order %v", []string{v[0].ID, v[len(v)-1].ID})
	}
	if got := a.liveTotal(); got != 4+1+7 {
		t.Errorf("live %d", got)
	}
	tt := build(t, a)
	for _, s := range []string{"Acme Docs", "Personal blog", "Landing page", "Visitors", "Compared with the previous 24 hours"} {
		if !tt.hasText(s) {
			t.Errorf("no %q in %q", s, tt.Texts())
		}
	}
}

func TestRange(t *testing.T) {
	a := testApp(t, newFake())
	a.refresh()
	tt := build(t, a)
	tt.Press("7D")
	tt.WaitUntil(2*time.Second, func() bool { return a.cfg.Range == 1 && a.loading == 0 })
	if a.cfg.Range != 1 || len(a.buckets) != 7 {
		t.Fatalf("range %d, %d buckets", a.cfg.Range, len(a.buckets))
	}
	if !tt.hasText("Compared with the previous 7 days") {
		t.Errorf("texts %q", tt.Texts())
	}
	tt.Key("mod+3")
	tt.WaitUntil(2*time.Second, func() bool { return a.cfg.Range == 2 && a.loading == 0 })
	if a.cfg.Range != 2 || len(a.site("a").visitors) != 30 {
		t.Errorf("range %d after Cmd+3", a.cfg.Range)
	}
}

func TestDetail(t *testing.T) {
	a := testApp(t, newFake())
	a.cfg.Range = 1
	a.refresh()
	tt := build(t, a)
	tt.Press("Acme Docs")
	tt.WaitUntil(2*time.Second, func() bool { return a.page == pageSite && a.loading == 0 })
	if a.page != pageSite || a.open != "a" {
		t.Fatalf("page %v %q", a.page, a.open)
	}
	for _, s := range []string{"Bounce rate", "Visit duration", "/docs/getting-started", "Direct", "google.com", "United States", "Open in Umami"} {
		if !tt.hasText(s) {
			t.Errorf("no %q in %q", s, tt.Texts())
		}
	}
	tt.Press("Open in Umami")
	if got := tt.OpenedURLs; len(got) != 1 || got[0] != "https://cloud.umami.is/websites/a" {
		t.Errorf("opened %q", got)
	}
	tt.Key("escape")
	if a.page != pageSites {
		t.Errorf("page %v after Escape", a.page)
	}
}

func TestOnboarding(t *testing.T) {
	a := testApp(t, nil)
	tt := build(t, a)
	if !tt.hasText("Connect to Umami") {
		t.Fatalf("texts %q", tt.Texts())
	}

	f := newFake()
	f.keyErr = true
	connect := func() { a.connect(func(string, string) source { return f }) }
	a.editKey = "api_wrong"
	connect()
	tt.WaitUntil(2*time.Second, func() bool { return a.connectErr != "" })
	if a.configured() || !tt.hasText("The API key was rejected.") {
		t.Fatalf("configured %v, texts %q", a.configured(), tt.Texts())
	}

	f.keyErr = false
	saved := 0
	a.changed = func(config) { saved++ }
	a.editKey = "api_right"
	connect()
	tt.WaitUntil(2*time.Second, func() bool { return a.configured() && a.loading == 0 })
	if !a.configured() || a.page != pageSites || saved == 0 || len(a.sites) != 5 {
		t.Fatalf("configured %v, page %v, saved %d", a.configured(), a.page, saved)
	}
}

func TestSettings(t *testing.T) {
	a := testApp(t, newFake())
	a.refresh()
	tt := build(t, a)
	tt.Press("settings")
	if a.page != pageSettings {
		t.Fatalf("page %v", a.page)
	}
	v := tt.Find("id:settings")
	if v.Content.Height <= v.Frame.Size.Height {
		t.Fatalf("settings does not scroll: content %g, viewport %g", v.Content.Height, v.Frame.Size.Height)
	}
	tt.Press("Show Landing page")
	if len(a.cfg.Hidden) != 1 || a.cfg.Hidden[0] != "c" {
		t.Fatalf("hidden %q", a.cfg.Hidden)
	}
	tt.Press("back")
	if tt.hasText("Landing page") {
		t.Error("a hidden website is listed")
	}
}

func TestLaunchAtLogin(t *testing.T) {
	a := testApp(t, newFake())
	var set []bool
	a.canLaunchAtLogin = true
	a.readLogin = func(done func(bool)) { done(true) }
	a.setLogin = func(on bool) { set = append(set, on) }
	a.refresh()
	tt := build(t, a)
	tt.Press("settings")
	if !a.launchAtLogin {
		t.Fatal("the system's setting is not read")
	}
	tt.Press("Open at login")
	if a.launchAtLogin || !slices.Equal(set, []bool{false}) {
		t.Fatalf("on %v, set %v", a.launchAtLogin, set)
	}
}

func TestErrors(t *testing.T) {
	f := newFake()
	f.err = errors.New("Couldn't reach the server.")
	a := testApp(t, f)
	a.refresh()
	tt := build(t, a)
	if !tt.hasText("Couldn't load your websites") {
		t.Fatalf("texts %q", tt.Texts())
	}
	f.err = nil
	tt.Press("retry")
	tt.WaitUntil(2*time.Second, func() bool { return a.loading == 0 && len(a.sites) > 0 })
	if !tt.hasText("Acme Docs") {
		t.Errorf("texts %q after retrying", tt.Texts())
	}
}

func TestBucketize(t *testing.T) {
	loc := time.FixedZone("CST", 8*3600)
	now := time.Date(2026, 10, 12, 15, 20, 0, 0, loc)
	from, _, buckets := spans[0].window(now)
	if len(buckets) != 24 || !from.Equal(time.Date(2026, 10, 11, 16, 0, 0, 0, loc)) {
		t.Fatalf("from %v, %d buckets", from, len(buckets))
	}
	got := bucketize([]point{
		{X: "2026-10-12 15:00:00", Y: 3},
		{X: "2026-10-11T16:00:00+08:00", Y: 2},
		{X: "2026-10-12T06:00:00Z", Y: 5},
		{X: "nonsense", Y: 9},
	}, buckets, true)
	if got[23] != 3 || got[0] != 2 || got[22] != 5 {
		t.Errorf("buckets %v", got)
	}
	_, _, days := spans[1].window(now)
	if len(days) != 7 || days[6].Day() != 12 || days[0].Day() != 6 {
		t.Errorf("days %v", days)
	}
}

func TestFormat(t *testing.T) {
	for v, want := range map[float64]string{0: "0", 999: "999", 9999: "9,999", 12_480: "12.4k", 123_456: "123k", 1_250_000: "1.2M"} {
		if got := count(v); got != want {
			t.Errorf("count(%v) = %q, want %q", v, got, want)
		}
	}
	for d, want := range map[time.Duration]string{48 * time.Second: "48s", 125 * time.Second: "2m 05s", 72 * time.Minute: "1h 12m"} {
		if got := duration(d); got != want {
			t.Errorf("duration(%v) = %q, want %q", d, got, want)
		}
	}
	for in, want := range map[string]string{
		"":                               cloudEndpoint,
		"cloud.umami.is":                 cloudEndpoint,
		"umami.example.com":              "https://umami.example.com/api",
		"https://umami.example.com/api/": "https://umami.example.com/api",
		"https://api.umami.is/v1":        cloudEndpoint,
		"http://localhost:3000":          "http://localhost:3000/api",
	} {
		if got := normalizeEndpoint(in); got != want {
			t.Errorf("normalizeEndpoint(%q) = %q, want %q", in, got, want)
		}
	}
	if got := dashboardURL("https://umami.example.com/api", "x"); got != "https://umami.example.com/websites/x" {
		t.Errorf("dashboard %q", got)
	}
	if !strings.HasPrefix(percent(0.082), "8.2") {
		t.Errorf("percent %q", percent(0.082))
	}
}

func TestStatsShapes(t *testing.T) {
	var cur stats
	if err := json.Unmarshal([]byte(`{"pageviews":"12","visitors":5,"visits":6,"bounces":3,"totaltime":600}`), &cur); err != nil || cur.Pageviews != 12 || cur.Visitors != 5 {
		t.Errorf("v3 %+v %v", cur, err)
	}
	var old stats
	if err := json.Unmarshal([]byte(`{"pageviews":{"value":10,"prev":8},"visitors":{"value":4,"prev":2}}`), &old); err != nil || old.Pageviews != 10 || old.Visitors != 4 {
		t.Errorf("v2 %+v %v", old, err)
	}
}

func TestClient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer k" {
			w.WriteHeader(401)
			return
		}
		switch r.URL.Path {
		case "/api/websites":
			w.Write([]byte(`{"data":[{"id":"a","name":"A","domain":"a.dev"}],"count":1,"page":1,"pageSize":100}`))
		case "/api/websites/a/stats":
			if r.URL.Query().Get("startAt") == "" {
				w.WriteHeader(400)
				return
			}
			w.Write([]byte(`{"pageviews":30,"visitors":10,"visits":12,"bounces":6,"totaltime":1200,"comparison":{"pageviews":20,"visitors":8,"visits":9,"bounces":5,"totaltime":900}}`))
		case "/api/websites/a/active":
			w.Write([]byte(`{"visitors":3}`))
		case "/api/websites/a/metrics":
			if r.URL.Query().Get("type") == "path" {
				w.WriteHeader(400)
				return
			}
			w.Write([]byte(`[{"x":"/","y":5}]`))
		}
	}))
	defer srv.Close()
	ctx := context.Background()
	cl := newClient(srv.URL+"/api/", "k")
	list, err := cl.websites(ctx)
	if err != nil || len(list) != 1 || list[0].Domain != "a.dev" {
		t.Fatalf("websites %v %v", list, err)
	}
	cur, prev, err := cl.stats(ctx, "a", time.Now().Add(-time.Hour), time.Now())
	if err != nil || cur.Visitors != 10 || prev.Visitors != 8 || cur.visitDuration() != 100*time.Second {
		t.Errorf("stats %+v %+v %v", cur, prev, err)
	}
	if n, err := cl.active(ctx, "a"); n != 3 || err != nil {
		t.Errorf("active %d %v", n, err)
	}
	if m, err := cl.metrics(ctx, "a", "path", time.Now(), time.Now(), 5); len(m) != 1 || err != nil {
		t.Errorf("metrics %v %v", m, err)
	}
	_, err = newClient(srv.URL+"/api", "wrong").websites(ctx)
	if err == nil || err.Error() != "The API key was rejected." {
		t.Errorf("wrong key: %v", err)
	}
}

func TestSort(t *testing.T) {
	a := testApp(t, newFake())
	saved := 0
	a.changed = func(config) { saved++ }
	a.refresh()
	if got := names(a.visible()); got[0] != "Landing page" || got[len(got)-1] != "Status" {
		t.Errorf("by visitors %q", got)
	}
	a.site("e").cur.Pageviews = 1e6
	a.setSort(sortByViews)
	if a.visible()[0].Name != "Status" || saved == 0 {
		t.Fatalf("by views %q, saved %d", names(a.visible()), saved)
	}
	a.setSort(sortByName)
	got := names(a.visible())
	want := []string{"Acme Docs", "Changelog", "Landing page", "Personal blog", "Status"}
	if !slices.Equal(got, want) || a.cfg.Sort != sortByName {
		t.Fatalf("by name %q", got)
	}
	a.setSort(sortByVisitors)
	if a.cfg.Sort != sortByVisitors || a.visible()[0].Name != "Landing page" {
		t.Errorf("by visitors again %q", names(a.visible()))
	}
}

func TestTrayIcon(t *testing.T) {
	b := trayIcon()
	if len(b) < 100 {
		t.Fatalf("icon %d bytes", len(b))
	}
}
