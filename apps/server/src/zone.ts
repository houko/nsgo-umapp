// Time zone arithmetic for series, which group events by the hours or days of the zone the client asks for. D1 knows UTC only, so buckets are computed here as UTC ranges.

export type Unit = "hour" | "day";

/** A bucket of a series: events at or after start and before end, labeled by its wall clock start in the zone. */
export interface Bucket {
  start: number;
  end: number;
  label: string;
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** validZone reports whether tz is a time zone Intl knows. */
export function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** wall is the wall clock time at ms in tz, as the fields of a UTC date. */
function wall(ms: number, tz: string): number {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formats.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const { type, value } of f.formatToParts(ms)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** instant is the time whose wall clock in tz is w, or the nearest after it where the zone skips w. */
function instant(w: number, tz: string): number {
  let t = w - (wall(w, tz) - w);
  // A second pass corrects for an offset that changes between w and t.
  t = w - (wall(t, tz) - t);
  return t;
}

function label(w: number): string {
  return new Date(w).toISOString().slice(0, 19).replace("T", " ");
}

/** buckets are the units of tz that [from, to] touches, at most max of them, or null when there would be more. */
export function buckets(from: number, to: number, unit: Unit, tz: string, max: number): Bucket[] | null {
  const d = new Date(wall(from, tz));
  d.setUTCMinutes(0, 0, 0);
  if (unit === "day") d.setUTCHours(0);
  const out: Bucket[] = [];
  let w = d.getTime();
  let start = instant(w, tz);
  while (start <= to) {
    const next = new Date(w);
    if (unit === "day") next.setUTCDate(next.getUTCDate() + 1);
    else next.setUTCHours(next.getUTCHours() + 1);
    const nw = next.getTime();
    const end = instant(nw, tz);
    // Where the zone repeats an hour, two wall hours can name one instant: keep the buckets increasing.
    if (end > start) {
      if (out.length === max) return null;
      out.push({ start, end, label: label(w) });
      start = end;
    }
    w = nw;
  }
  return out;
}
