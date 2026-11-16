# Umapp architecture

Umapp is a native macOS menu bar application, built for Apple silicon, and an iPhone app, that reads an Umami account and shows its websites and visitors in a panel. It is a single Go module at the repository root, built with NSGo's `ui` components in its default theme.

## Code map

| Path | Responsibility |
| --- | --- |
| `go.mod`, `nsgo.yaml` | The only Go module and the packaging configuration; run Go and the `nsgo` tool at the root. |
| `main.go` | Entry point; the tray icon, the panel or the iPhone's main view, saving config and the refresh tick. |
| `model.go` | Panel state: websites, ranges, order, load and connect. |
| `umami.go` | Umami HTTP client for Cloud and self-hosted servers. |
| `config.go` | Config file and the macOS keychain. |
| `view.go` | List, header, summary and sparklines. |
| `detail.go` | One website's tag filter, metrics, chart and breakdowns, with favicons and flags. |
| `settings.go` | Connect and menu bar options. |
| `screenshots_test.go` | The README's screenshots, on a made-up account. |
| `locales/` | NSGo message catalogs, and the accessors the `nsgo` tool writes from them. |
| `assets/` | Icon sources. |

## Boundaries

- Run network work off the UI thread. Apply results on the main thread and never start that work inside a builder.
- Views follow the state through a revision: actions change plain data and call `invalidate`, and a region builds again only when its key changes.
- Present Umapp as a menu bar app: the tray icon opens the panel on a left click and offers Quit on a right click. Where panels are not available, as on iOS, the panel's content is the main view inside the safe area, without the menu bar's options (`noTray`).
- Keep the API key in the macOS keychain. On iOS, which has no `security` command, it stays in the config file inside the app's sandbox.

## Core flows

**Connect.** Settings sends the endpoint and key to `/websites`. If Umami takes them, they are saved and the list loads.

**Refresh.** Loads every website the key can see, then each one's stats, series and visitors online for the range shown. Visitors online refresh every minute, and on a website's page so do the tags, pages and countries they are on, counted over Umami's same five minutes and marked beside each one's count; the rest every five, or as the panel opens, or the iPhone app becomes active again, on numbers older than a minute.

**Tags.** A website's page lists the tags of its events in the range. Choosing one loads that tag's totals, series and breakdowns, while the list keeps every event's; opening a website starts on all of them.

**Order.** Websites with the most visitors come first, or the most views, or by name, as the user chooses.

## Data and state

Preferences live in `config.json` under `~/Library/Application Support/umapp`, in the app's container on iOS. The API key is in the login keychain under `umapp: Umami API key`. Whether the app opens at login is the system's, read and changed through NSGo. The list of websites is held in memory only: each launch loads it again.

## Verification

The Umami client, formatting, bucketizing and sort logic are pure and fully testable headless. Localization and the view builders have headless tests. The phone layout has a headless test. The panel and tray need review in a desktop session, and the iPhone app in the simulator.
