package main

import (
	"github.com/oneo-me/nsgo/core"

	"github.com/oneo-me/umapp/source/locales"
)

func (a *app) msgs() locales.Messages {
	if a.cx != nil {
		return locales.For(a.cx)
	}
	return locales.In("en")
}

func (a *app) unitWord(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func msgsOf(cx *core.Scope) locales.Messages { return locales.For(cx) }
