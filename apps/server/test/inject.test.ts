import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { route } from "../src/index";
import { tag } from "../src/inject";
import { trackerScript } from "../src/tracker";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const T = Date.UTC(2026, 10, 16, 3, 0, 0);
const PAGE = "<!doctype html><html><head><title>Shop</title></head><body><p>Hello</p></body></html>";

// Storage lasts the whole file: each test starts from empty tables.
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM event"), env.DB.prepare("DELETE FROM website")]);
});

// The injector remembers each hostname for a minute per isolate, so each test uses hostnames of its own.
let n = 0;
function host(): string {
  n++;
  return `site${n}.test`;
}

async function addSite(domain: string, id = crypto.randomUUID(), at = T): Promise<string> {
  await env.DB.prepare("INSERT INTO website (id, name, domain, created_at) VALUES (?, ?, ?, ?)").bind(id, domain, domain, at).run();
  return id;
}

/** origin answers every request with what make returns, and keeps the requests it was given. */
function origin(make: () => Response = () => html(PAGE)) {
  const requests: Request[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return make();
  });
  return { fetch: f as unknown as typeof fetch, requests, calls: () => f.mock.calls.length };
}

function html(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { ...init, headers });
}

function get(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

describe("site injector", () => {
  it("adds the tracker at the end of the head", async () => {
    const h = host();
    const id = await addSite(h);
    const o = origin();
    const res = await route(get(`https://${h}/`), env, createExecutionContext(), o.fetch, T);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `<!doctype html><html><head><title>Shop</title><script defer src="/_umapp/script.js" data-website-id="${id}" data-host-url="/_umapp"></script></head><body><p>Hello</p></body></html>`,
    );
    expect(o.calls()).toBe(1);
  });

  it("forwards the request to the origin unchanged", async () => {
    const h = host();
    await addSite(h);
    const o = origin(() => new Response("ok", { headers: { "Content-Type": "text/plain" } }));
    await route(
      get(`https://${h}/cart?x=1`, { method: "POST", headers: { Cookie: "a=1", "X-Custom": "y" }, body: "item=2" }),
      env,
      createExecutionContext(),
      o.fetch,
      T,
    );
    const [r] = o.requests;
    expect(r.url).toBe(`https://${h}/cart?x=1`);
    expect(r.method).toBe("POST");
    expect(r.headers.get("Cookie")).toBe("a=1");
    expect(r.headers.get("X-Custom")).toBe("y");
    expect(await r.text()).toBe("item=2");
  });

  it("adds nothing when the head already has a script naming a website", async () => {
    const h = host();
    await addSite(h);
    const page = `<html><head><script defer src="https://cloud.umami.is/script.js" data-website-id="other"></script><title>x</title></head><body></body></html>`;
    const res = await route(get(`https://${h}/`), env, createExecutionContext(), origin(() => html(page)).fetch, T);
    expect(await res.text()).toBe(page);
  });

  it("still adds the tracker when only the body has a script naming a website", async () => {
    const h = host();
    const id = await addSite(h);
    const page = `<html><head></head><body><script src="/s.js" data-website-id="other"></script></body></html>`;
    const res = await route(get(`https://${h}/`), env, createExecutionContext(), origin(() => html(page)).fetch, T);
    expect(await res.text()).toBe(page.replace("</head>", tag(id) + "</head>"));
  });

  it("adds the tracker once, before the body, to a head without its end tag", async () => {
    const h = host();
    const id = await addSite(h);
    const page = `<html><head><title>x</title><body><p>a</p></body></html>`;
    const res = await route(get(`https://${h}/`), env, createExecutionContext(), origin(() => html(page)).fetch, T);
    const text = await res.text();
    expect(text).toBe(`<html><head><title>x</title>${tag(id)}<body><p>a</p></body></html>`);
  });

  it("leaves responses other than successful HTML to GETs as they are", async () => {
    const h = host();
    await addSite(h);
    const cases: [RequestInit, () => Response][] = [
      [{}, () => new Response("{}", { headers: { "Content-Type": "application/json" } })],
      [{}, () => new Response("body{}", { headers: { "Content-Type": "text/css" } })],
      [{}, () => new Response(PAGE)],
      [{ method: "POST", body: "x" }, () => html(PAGE)],
      [{ method: "HEAD" }, () => html(PAGE)],
      [{}, () => html(PAGE, { status: 404 })],
      [{}, () => html(PAGE, { status: 500 })],
      [{}, () => html("", { status: 302, headers: { Location: "/login" } })],
      [{}, () => new Response(null, { status: 304, headers: { "Content-Type": "text/html" } })],
      [{}, () => new Response(null, { status: 204, headers: { "Content-Type": "text/html" } })],
      [{ headers: { Range: "bytes=0-99" } }, () => html(PAGE.slice(0, 100), { status: 206, headers: { "Content-Range": `bytes 0-99/${PAGE.length}` } })],
      [{ headers: { Range: "bytes=0-" } }, () => html(PAGE, { headers: { "Content-Range": `bytes 0-${PAGE.length - 1}/${PAGE.length}` } })],
    ];
    for (const [init, make] of cases) {
      let given: Response | undefined;
      const res = await route(
        get(`https://${h}/`, init),
        env,
        createExecutionContext(),
        (async () => (given = make())) as unknown as typeof fetch,
        T,
      );
      expect(res).toBe(given);
    }
  });

  it("keeps the origin's status and headers, without a stale Content-Length", async () => {
    const h = host();
    await addSite(h);
    const make = () =>
      html(PAGE, {
        status: 203,
        statusText: "Non-Authoritative",
        headers: [
          ["Content-Length", String(PAGE.length)],
          ["Cache-Control", "private, max-age=10"],
          ["Set-Cookie", "sid=1; Path=/; HttpOnly"],
          ["Set-Cookie", "theme=dark; Path=/"],
          ["X-Origin", "yes"],
        ],
      });
    const res = await route(get(`https://${h}/`), env, createExecutionContext(), origin(make).fetch, T);
    expect(res.status).toBe(203);
    expect(res.statusText).toBe("Non-Authoritative");
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=10");
    expect(res.headers.getSetCookie()).toEqual(["sid=1; Path=/; HttpOnly", "theme=dark; Path=/"]);
    expect(res.headers.get("X-Origin")).toBe("yes");
    const body = new Uint8Array(await res.arrayBuffer());
    const length = res.headers.get("Content-Length");
    expect(length === null || Number(length) === body.length).toBe(true);
    expect(body.length).toBeGreaterThan(PAGE.length);
  });

  it("weakens the origin's strong ETag, which no longer names the page's bytes", async () => {
    const h = host();
    await addSite(h);
    const at = async (etag: string) =>
      (await route(get(`https://${h}/`), env, createExecutionContext(), origin(() => html(PAGE, { headers: { ETag: etag } })).fetch, T)).headers.get("ETag");
    expect(await at(`"abc"`)).toBe(`W/"abc"`);
    expect(await at(`W/"abc"`)).toBe(`W/"abc"`);
  });

  it("serves the tracker and takes its events under /_umapp", async () => {
    const h = host();
    const id = await addSite(h);
    const o = origin();
    const script = await route(get(`https://${h}/_umapp/script.js`), env, createExecutionContext(), o.fetch, T);
    expect(script.headers.get("Content-Type")).toContain("javascript");
    expect(await script.text()).toBe(trackerScript);

    const sent = await route(
      get(`https://www.${h}/_umapp/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ type: "event", payload: { website: id, hostname: `www.${h}`, url: "/docs" } }),
      }),
      env,
      createExecutionContext(),
      o.fetch,
      T,
    );
    expect(sent.status).toBe(200);
    const row = await env.DB.prepare("SELECT path, created_at FROM event WHERE website_id = ?").bind(id).first();
    expect(row).toEqual({ path: "/docs", created_at: T });
    expect(o.calls()).toBe(0);
  });

  it("passes the site's own /script.js and /api to its origin", async () => {
    const h = host();
    await addSite(h);
    const o = origin(() => new Response("origin", { headers: { "Content-Type": "text/plain" } }));
    for (const path of ["/script.js", "/api/send", "/api/websites", "/_umapp", "/_umapp/other"]) {
      const res = await route(get(`https://${h}${path}`), env, createExecutionContext(), o.fetch, T);
      expect(await res.text()).toBe("origin");
    }
    expect(o.calls()).toBe(5);
  });

  it("matches the host with or without www. and in any case, but not other subdomains", async () => {
    const h = host();
    const id = await addSite(h);
    for (const name of [`www.${h}`, h.toUpperCase(), `WWW.${h.toUpperCase()}`]) {
      const res = await route(get(`https://${name}/`), env, createExecutionContext(), origin().fetch, T);
      expect(await res.text()).toContain(`data-website-id="${id}"`);
    }
    const o = origin();
    const other = await route(get(`https://blog.${h}/`), env, createExecutionContext(), o.fetch, T);
    expect(await other.text()).toBe(PAGE);
    expect(o.calls()).toBe(1);
  });

  it("finds a website whose domain was stored with its www. or a trailing dot", async () => {
    for (const stored of [(h: string) => `www.${h}`, (h: string) => `${h}.`, (h: string) => `WWW.${h}.`.toLowerCase()]) {
      const h = host();
      const id = await addSite(stored(h));
      for (const name of [h, `www.${h}`, `${h}.`]) {
        const res = await route(get(`https://${name}/`), env, createExecutionContext(), origin().fetch, T);
        expect(await res.text()).toContain(`data-website-id="${id}"`);
      }
    }
  });

  it("finds a website added through the API with its www.", async () => {
    const h = host();
    const created = await route(
      get(`https://umapp-server.someone.workers.dev/api/websites`, {
        method: "POST",
        headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
        body: JSON.stringify({ domain: `https://www.${h}/` }),
      }),
      env,
      createExecutionContext(),
      origin().fetch,
      T,
    );
    const { id } = (await created.json()) as { id: string };
    const res = await route(get(`https://${h}/`), env, createExecutionContext(), origin().fetch, T);
    expect(await res.text()).toContain(`data-website-id="${id}"`);
  });

  it("serves the first website added for a domain added twice", async () => {
    const h = host();
    const first = await addSite(h, "b-first", T - 1000);
    await addSite(h, "a-second", T);
    const res = await route(get(`https://${h}/`), env, createExecutionContext(), origin().fetch, T);
    expect(await res.text()).toContain(`data-website-id="${first}"`);
  });

  it("keeps the server's own routes on its own hostnames", async () => {
    const h = host();
    await addSite(h);
    const servers = ["umapp-server.someone.workers.dev", "localhost", "127.0.0.1", "[::1]", "stats.example.org"];
    const e = { ...env, SERVER_HOSTS: ` stats.example.org , other.example.org` };
    for (const name of servers) {
      const o = origin();
      const script = await route(get(`https://${name}/script.js`), e, createExecutionContext(), o.fetch, T);
      expect(await script.text()).toBe(trackerScript);
      const api = await route(get(`https://${name}/api/websites`, { headers: { Authorization: "Bearer test-key" } }), e, createExecutionContext(), o.fetch, T);
      expect(((await api.json()) as any).count).toBe(1);
      expect((await route(get(`https://${name}/_umapp/script.js`), e, createExecutionContext(), o.fetch, T)).status).toBe(404);
      expect((await route(get(`https://${name}/`), e, createExecutionContext(), o.fetch, T)).status).toBe(404);
      expect(o.calls()).toBe(0);
    }
  });

  it("passes every request of a routed hostname with no website to its origin untouched", async () => {
    const h = host();
    await addSite(`other-${h}`);
    const o = origin(() => new Response("origin", { headers: { "Content-Type": "text/html" } }));
    for (const path of ["/", "/script.js", "/api/send", "/api/websites", "/_umapp/script.js", "/_umapp/api/send"]) {
      const res = await route(get(`https://${h}${path}`, { headers: { Authorization: "Bearer test-key" } }), env, createExecutionContext(), o.fetch, T);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("origin");
    }
    expect(o.requests.map((r) => new URL(r.url).pathname)).toEqual(["/", "/script.js", "/api/send", "/api/websites", "/_umapp/script.js", "/_umapp/api/send"]);
  });

  it("finds a website added after its host was looked up once the minute has passed, and lets the site be once its website is gone", async () => {
    const h = host();
    const at = async (t: number) => (await route(get(`https://${h}/`), env, createExecutionContext(), origin().fetch, t)).text();
    expect(await at(T)).toBe(PAGE);
    const id = await addSite(h);
    expect(await at(T + 30_000)).toBe(PAGE);
    expect(await at(T + 60_000)).toContain(`data-website-id="${id}"`);

    await env.DB.prepare("DELETE FROM website WHERE id = ?").bind(id).run();
    expect(await at(T + 90_000)).toContain(`data-website-id="${id}"`);
    expect(await at(T + 120_000)).toBe(PAGE);
  });

  it("asks D1 once a minute per host", async () => {
    const h = host();
    await addSite(h);
    const prepare = vi.fn(env.DB.prepare.bind(env.DB));
    const db = { prepare } as unknown as D1Database;
    for (const i of [0, 1, 2]) await route(get(`https://${h}/`), { ...env, DB: db }, createExecutionContext(), origin().fetch, T + i * 1000);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("shares no lookup in flight between requests", async () => {
    const h = host();
    const id = await addSite(h);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const prepare = vi.fn((sql: string) => {
      const statement = env.DB.prepare(sql);
      return {
        bind: (...values: unknown[]) => ({
          first: async () => {
            await gate;
            return statement.bind(...values).first();
          },
        }),
      };
    });
    const db = { prepare } as unknown as D1Database;
    const pages = [0, 1].map(() => route(get(`https://${h}/`), { ...env, DB: db }, createExecutionContext(), origin().fetch, T));
    // Each request waits on a query of its own, so none hangs on another's being cancelled.
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    release();
    for (const page of await Promise.all(pages)) expect(await page.text()).toContain(`data-website-id="${id}"`);
  });

  it("falls back to the origin on a failure, the lookup included", async () => {
    const ctx = createExecutionContext();
    const pass = vi.spyOn(ctx, "passThroughOnException");
    const broken = {
      prepare() {
        throw new Error("D1 is down");
      },
    } as unknown as D1Database;
    await expect(route(get(`https://${host()}/`), { ...env, DB: broken }, ctx, origin().fetch, T)).rejects.toThrow("D1 is down");
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it("escapes the website's id in the tag", () => {
    expect(tag(`a"b<c&`)).toContain(`data-website-id="a&quot;b&lt;c&amp;"`);
  });
});

describe("tracker", () => {
  /** run runs the tracker as a page at https://site.test/docs would, with the script's attributes, and returns the addresses it sent events to. */
  function run(src: string, attrs: Record<string, string>): string[] {
    const sent: string[] = [];
    const script = { src, getAttribute: (name: string) => attrs[name] ?? null };
    const document = { currentScript: script, referrer: "", readyState: "complete", title: "Docs", addEventListener() {} };
    const location = { href: "https://site.test/docs", hostname: "site.test", pathname: "/docs", search: "" };
    const history = { pushState() {}, replaceState() {} };
    const fetch = (url: string) => {
      sent.push(url);
      return Promise.resolve();
    };
    const globals = { document, location, history, fetch, window: {}, navigator: { language: "en" }, screen: { width: 1, height: 1 }, localStorage: { getItem: () => null }, addEventListener() {} };
    new Function(...Object.keys(globals), trackerScript)(...Object.values(globals));
    return sent;
  }

  it("sends to a relative data-host-url on the page's own origin", () => {
    const sent = run("https://site.test/_umapp/script.js", { "data-website-id": "w", "data-host-url": "/_umapp" });
    expect(sent).toEqual(["/_umapp/api/send"]);
    // fetch resolves a relative address against the page.
    expect(new URL(sent[0], "https://site.test/docs").href).toBe("https://site.test/_umapp/api/send");
  });

  it("sends to the script's origin without data-host-url", () => {
    expect(run("https://stats.test/script.js", { "data-website-id": "w" })).toEqual(["https://stats.test/api/send"]);
  });
});
