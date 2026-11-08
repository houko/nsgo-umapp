# Umapp

Umapp is a native menu bar app that shows the websites of an Umami account and their visitors. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing code.

## Principles

- Keep all Go code, `nsgo.yaml` and runtime payload in `source/`; run Go and NSGo commands there.
- NSGo comes from the checkout `source/go.mod` replaces it with; follow that repository's own instructions when changing it.
- Keep documentation at the repository root.
- Use NSGo's `ui` components and Warm Dusk, its Onevra theme; build reusable UI in NSGo rather than here.
- Run Umami requests off the UI thread. Apply results on the main thread and never start that work inside a builder.
- Keep the API key in the macOS keychain, and in the config file elsewhere.

## Working with the user

- Never create sub-Agents or Git worktrees; work directly in the current checkout.
- Do not commit, tag, push or publish without explicit authorization.

## Verification

Build and test from `source/`, following [Development](README.md#development). A green headless run does not prove native behavior: review UI changes in a desktop session.

## Documentation

- Update a document only when a fact its reader needs changes.
- Avoid secondary labels and descriptions that restate a heading or value; let the layout explain.
- Keep each document within its budget and written for its reader.
- Record completed user-visible outcomes as one-clause `Unreleased` bullets in [CHANGELOG.md](CHANGELOG.md) with references such as `(#12 by @alice)`, ordered by type and merging related ones.
- Repair a document you touch instead of appending to it.
- Keep `README.md` and `README.zh-CN.md` equivalent; everything else, including code comments, is English.
- Keep documentation on the code branch and reconcile it during merges.
