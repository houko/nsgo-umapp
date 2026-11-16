// The Worker serves the web build's files and, at PROXY_PATH, forwards the app's requests to Umami (platform_js.go): GETs, and POSTs of JSON, as adding a website. Browsers refuse Umami's answers to a request of another origin that carries Authorization, as its CORS headers allow headers by "*", which leaves Authorization out; on the site's own origin no CORS applies.
const PROXY_PATH = "/umami-api";
const TARGET_HEADER = "X-Umami-URL";
const FORWARDED = ["Authorization", "x-umami-api-key"];
const MAX_BODY = 16 << 10;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PROXY_PATH) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
    }
    const target = allowedTarget(request.headers.get(TARGET_HEADER), env.UMAMI_ENDPOINTS);
    if (!target) {
      return Response.json({ message: "This site doesn't reach that Umami server." }, { status: 421 });
    }
    const headers = new Headers({ Accept: "application/json" });
    for (const name of FORWARDED) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    let body;
    if (request.method === "POST") {
      if (!(request.headers.get("Content-Type") ?? "").startsWith("application/json")) {
        return Response.json({ message: "The request isn't JSON." }, { status: 415 });
      }
      body = await request.text();
      if (body.length > MAX_BODY) {
        return Response.json({ message: "The request is too large." }, { status: 413 });
      }
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(target, { method: request.method, headers, body, redirect: "manual" });
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  },
};

// allowedTarget is target as a URL when it is under one of endpoints, a comma-separated list of Umami APIs such as https://api.umami.is/v1, else null.
function allowedTarget(target, endpoints) {
  if (!target || !URL.canParse(target)) return null;
  const u = new URL(target);
  for (const e of (endpoints ?? "").split(",")) {
    const s = e.trim().replace(/\/+$/, "");
    if (!URL.canParse(s)) continue;
    const base = new URL(s);
    if (u.origin === base.origin && u.pathname.startsWith(base.pathname.replace(/\/+$/, "") + "/")) return u;
  }
  return null;
}
