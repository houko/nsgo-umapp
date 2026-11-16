import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../src/api";
import { collect } from "../src/collect";
import worker from "../src/index";
import { buckets } from "../src/zone";

const KEY = { Authorization: "Bearer test-key" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
// 12:00 in Tokyo, 2026-11-16.
const T = Date.UTC(2026, 10, 16, 3, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

async function call(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; now?: number } = {}) {
  const request = new Request("https://stats.test/api" + path, {
    method,
    headers: { ...KEY, ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await api(request, env, path.split("?")[0], opts.now ?? T);
  return { status: res.status, body: (await res.json()) as any };
}

async function createSite(domain = "example.com") {
  const { body } = await call("POST", "/websites", { body: { name: "Example", domain } });
  return body.id as string;
}

interface Visit {
  website: string;
  at: number;
  ip?: string;
  url?: string;
  referrer?: string;
  tag?: string;
  name?: string;
  country?: string;
  ua?: string;
}

function send(v: Visit) {
  const request = new Request("https://stats.test/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": v.ua ?? UA, "CF-Connecting-IP": v.ip ?? "203.0.113.1" },
    body: JSON.stringify({
      type: "event",
      payload: { website: v.website, hostname: "example.com", url: v.url ?? "/", referrer: v.referrer ?? "", tag: v.tag, name: v.name },
    }),
    cf: { country: v.country ?? "JP" },
  } as RequestInit);
  return collect(request, env, v.at);
}

// Storage lasts the whole file: each test starts from empty tables.
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM event"), env.DB.prepare("DELETE FROM website")]);
});

function range(from: number, to: number, extra = "") {
  return `?startAt=${from}&endAt=${to}${extra}`;
}

describe("auth", () => {
  it("takes the key as a bearer token or Umami Cloud's header", async () => {
    expect((await call("GET", "/websites")).status).toBe(200);
    expect((await call("GET", "/websites", { headers: { Authorization: "", "x-umami-api-key": "test-key" } })).status).toBe(200);
  });

  it("refuses a wrong or missing key", async () => {
    expect((await call("GET", "/websites", { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
    expect((await call("GET", "/websites", { headers: { Authorization: "" } })).status).toBe(401);
  });

  it("refuses everything without API_KEY", async () => {
    const res = await api(new Request("https://stats.test/api/websites", { headers: KEY }), { DB: env.DB }, "/websites");
    expect(res.status).toBe(500);
  });
});

describe("websites", () => {
  it("creates, lists, reads and deletes", async () => {
    const created = await call("POST", "/websites", { body: { domain: "https://Blog.Example.com/posts" } });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ name: "blog.example.com", domain: "blog.example.com" });
    const id = created.body.id;

    const list = await call("GET", "/websites?page=1&pageSize=100&includeTeams=true");
    expect(list.body).toMatchObject({ count: 1, data: [{ id, domain: "blog.example.com" }] });
    expect((await call("GET", `/websites/${id}`)).body.id).toBe(id);

    await send({ website: id, at: T });
    expect((await call("DELETE", `/websites/${id}`)).status).toBe(200);
    expect((await call("GET", `/websites/${id}`)).status).toBe(404);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM event WHERE website_id = ?").bind(id).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("renames a website and changes its domain", async () => {
    const id = await createSite("old.example.com");
    const renamed = await call("POST", `/websites/${id}`, { body: { name: "Shop" } });
    expect(renamed.body).toMatchObject({ id, name: "Shop", domain: "old.example.com" });
    const moved = await call("POST", `/websites/${id}`, { body: { domain: "https://New.Example.com/x" } });
    expect(moved.body).toMatchObject({ name: "Shop", domain: "new.example.com" });
    expect((await call("POST", `/websites/${id}`, { body: { domain: "" } })).status).toBe(400);
    expect((await call("POST", "/websites/missing", { body: { name: "x" } })).status).toBe(404);
  });

  it("refuses a website without a domain", async () => {
    expect((await call("POST", "/websites", { body: { name: "x" } })).status).toBe(400);
  });
});

describe("collect", () => {
  it("answers CORS preflights", async () => {
    const res = await collect(new Request("https://stats.test/api/send", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("stores a pageview without the visitor's address", async () => {
    const id = await createSite();
    const res = await send({ website: id, at: T, url: "/docs?x=1", referrer: "https://www.google.com/search?q=a", country: "DE", tag: "spring" });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT * FROM event WHERE website_id = ?").bind(id).first<Record<string, unknown>>();
    expect(row).toMatchObject({ type: 1, path: "/docs", referrer: "google.com", country: "DE", tag: "spring", name: "" });
    expect(JSON.stringify(row)).not.toContain("203.0.113.1");
  });

  it("drops the site's own referrer, bots and unknown websites", async () => {
    const id = await createSite();
    await send({ website: id, at: T, referrer: "https://www.example.com/" });
    await send({ website: id, at: T, ua: "Googlebot/2.1" });
    expect((await send({ website: "missing", at: T })).status).toBe(400);
    const { results } = await env.DB.prepare("SELECT referrer FROM event WHERE website_id = ?").bind(id).all();
    expect(results).toEqual([{ referrer: "" }]);
  });

  it("stores a named event as a custom event", async () => {
    const id = await createSite();
    await send({ website: id, at: T, name: "signup" });
    const row = await env.DB.prepare("SELECT type, name FROM event WHERE website_id = ?").bind(id).first();
    expect(row).toEqual({ type: 2, name: "signup" });
  });
});

describe("reports", () => {
  async function seed() {
    const id = await createSite();
    // A: two pages ten minutes apart, one visit.
    await send({ website: id, at: T - 2 * HOUR, ip: "a", url: "/" });
    await send({ website: id, at: T - 2 * HOUR + 10 * MIN, ip: "a", url: "/pricing", tag: "promo" });
    // B: one page, a bounce, from Germany through a referrer.
    await send({ website: id, at: T - HOUR, ip: "b", url: "/", country: "DE", referrer: "https://news.ycombinator.com/" });
    // C: yesterday, the range before.
    await send({ website: id, at: T - 25 * HOUR, ip: "c", url: "/" });
    return id;
  }

  it("totals a range and the one before", async () => {
    const id = await seed();
    const { body } = await call("GET", `/websites/${id}/stats` + range(T - 24 * HOUR, T));
    expect(body).toMatchObject({ pageviews: 3, visitors: 2, visits: 2, bounces: 1, totaltime: 600 });
    expect(body.comparison).toMatchObject({ pageviews: 1, visitors: 1, visits: 1, bounces: 1, totaltime: 0 });
  });

  it("filters by tag", async () => {
    const id = await seed();
    const { body } = await call("GET", `/websites/${id}/stats` + range(T - 24 * HOUR, T, "&tag=promo"));
    expect(body).toMatchObject({ pageviews: 1, visitors: 1 });
  });

  it("counts visitors of the last five minutes", async () => {
    const id = await seed();
    await send({ website: id, at: T - 2 * MIN, ip: "d" });
    expect((await call("GET", `/websites/${id}/active`, { now: T })).body).toEqual({ visitors: 1 });
  });

  it("breaks down pages by views and the rest by visitors", async () => {
    const id = await seed();
    const q = (type: string) => call("GET", `/websites/${id}/metrics` + range(T - 24 * HOUR, T, `&type=${type}&limit=10`));
    expect((await q("path")).body).toEqual([
      { x: "/", y: 2 },
      { x: "/pricing", y: 1 },
    ]);
    expect((await q("referrer")).body).toEqual([{ x: "news.ycombinator.com", y: 1 }]);
    expect((await q("country")).body).toEqual([
      { x: "DE", y: 1 },
      { x: "JP", y: 1 },
    ]);
    expect((await q("tag")).body).toEqual([{ x: "promo", y: 1 }]);
    expect((await q("browser")).status).toBe(400);
  });

  it("groups a series by the hours of the zone asked for", async () => {
    const id = await seed();
    const { body } = await call("GET", `/websites/${id}/pageviews` + range(T - 24 * HOUR, T, "&unit=hour&timezone=Asia/Tokyo"));
    expect(body.pageviews).toEqual([
      { x: "2026-11-16 10:00:00", y: 2 },
      { x: "2026-11-16 11:00:00", y: 1 },
    ]);
    expect(body.sessions).toEqual([
      { x: "2026-11-16 10:00:00", y: 1 },
      { x: "2026-11-16 11:00:00", y: 1 },
    ]);
  });

  it("refuses an unknown zone or unit", async () => {
    const id = await seed();
    expect((await call("GET", `/websites/${id}/pageviews` + range(0, T, "&unit=hour&timezone=Mars/Base"))).status).toBe(400);
    expect((await call("GET", `/websites/${id}/pageviews` + range(T - HOUR, T, "&unit=week"))).status).toBe(400);
  });

  it("answers 404 for another server's website", async () => {
    expect((await call("GET", "/websites/nope/stats" + range(0, T))).status).toBe(404);
  });
});

describe("buckets", () => {
  it("starts days at the zone's midnight", () => {
    const bs = buckets(T - 2 * 86_400_000, T, "day", "Asia/Tokyo", 10)!;
    expect(bs.map((b) => b.label)).toEqual(["2026-11-14 00:00:00", "2026-11-15 00:00:00", "2026-11-16 00:00:00"]);
    expect(bs[0].start).toBe(Date.UTC(2026, 10, 13, 15));
  });

  it("follows daylight saving time", () => {
    // New York skips 02:00 on 2026-03-08: that day has 23 hours.
    const day = buckets(Date.UTC(2026, 2, 8, 12), Date.UTC(2026, 2, 8, 12), "day", "America/New_York", 10)!;
    expect(day).toHaveLength(1);
    expect(day[0].end - day[0].start).toBe(23 * HOUR);
  });

  it("refuses more than max", () => {
    expect(buckets(0, 30 * 86_400_000, "hour", "UTC", 100)).toBeNull();
  });
});

describe("worker", () => {
  it("serves the tracker", async () => {
    const res = await worker.fetch(new Request("https://stats.test/script.js"), env);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("/api/send");
  });

  it("routes /api/send and /api", async () => {
    const id = await createSite();
    const sent = await worker.fetch(
      new Request("https://stats.test/api/send", {
        method: "POST",
        headers: { "User-Agent": UA },
        body: JSON.stringify({ type: "event", payload: { website: id, hostname: "example.com", url: "/" } }),
      }),
      env,
    );
    expect(sent.status).toBe(200);
    const list = await worker.fetch(new Request("https://stats.test/api/websites", { headers: KEY }), env);
    expect(((await list.json()) as any).count).toBe(1);
    expect((await worker.fetch(new Request("https://stats.test/other"), env)).status).toBe(404);
  });
});
