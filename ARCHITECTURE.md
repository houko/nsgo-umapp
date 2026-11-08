# Umapp architecture

Umapp is a native menu bar application that reads an Umami account and shows its websites and visitors in a panel. It is a single Go module under `source/`, built with NSGo's `ui` components in Onevra's look.

## Code map

| Path | Responsibility |
| --- | --- |
| `source/` | The only Go module and `nsgo.yaml`; run Go and the `nsgo` tool here. |
| `source/main.go` | Entry point; the tray icon, the panel, saving config and the refresh tick. |
| `source/model.go` | Panel state: websites, ranges, order, load and connect. |
| `source/umami.go` | Umami HTTP client for Cloud and self-hosted servers. |
| `source/config.go` | Config file and the macOS keychain. |
| `source/view.go` | List, header, summary and sparklines. |
| `source/detail.go` | One website's metrics, chart and breakdowns. |
| `source/settings.go` | Connect, menu bar options and which websites to show. |
| `source/locales/` | NSGo message catalogs, and the accessors the `nsgo` tool writes from them. |
| `source/assets/` | Icon sources. |

## Boundaries

- Run network work off the UI thread. Apply results on the main thread and never start that work inside a builder.
- Views follow the state through a revision: actions change plain data and call `invalidate`, and a region builds again only when its key changes.
- Present Umapp as a menu bar app: the tray icon opens the panel on a left click and offers Refresh and Quit on a right click. Where NSGo opens no panels or tray icons, the same view is the main window's.
- Keep the API key in the macOS keychain. The config file on that platform stores the rest.

## Core flows

**Connect.** Settings sends the endpoint and key to `/websites`. If Umami takes them, they are saved and the list loads.

**Refresh.** Loads every website the key can see, then each one's stats, series and visitors online for the range shown. Visitors online refresh every minute; the rest every five, or as the panel opens on numbers older than a minute.

**Order.** Websites with the most visitors come first, unless the user keeps their own order in Settings.

## Data and state

Preferences live in `config.json` under the platform configuration directory. On macOS the API key is in the login keychain under `umapp: Umami API key`. The list of websites is held in memory only: each launch loads it again.

## Verification

The Umami client, formatting, bucketizing and reorder logic are pure and fully testable headless. Localization and the view builders have headless tests. The panel and tray need review in a desktop session.

## Subjects

| Document | When to read |
| --- | --- |
