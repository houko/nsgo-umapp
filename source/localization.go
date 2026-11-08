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

func (a *app) spanLong() string {
	tr := a.msgs()
	switch a.cfg.Range {
	case 1:
		return tr.Range7dLong()
	case 2:
		return tr.Range30dLong()
	case 3:
		return tr.Range90dLong()
	default:
		return tr.Range24hLong()
	}
}

func (a *app) unitWord(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func msgsOf(cx *core.Scope) locales.Messages { return locales.For(cx) }
