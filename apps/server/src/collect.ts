// /api/send: the events sites send, in the form of Umami's tracker.

export interface Env {
  DB: D1Database;
  API_KEY?: string;
  /** SERVER_HOSTS lists, separated by commas, the hostnames besides workers.dev that are this server's own, such as a custom domain: on any other hostname, a request that is no tracked site's goes on to the site's origin. */
  SERVER_HOSTS?: string;
  /** CF_API_TOKEN lets the server add the websites of the Cloudflare accounts it covers (cloudflare.ts): Zone Read, Workers Routes Edit and Workers Scripts Edit. */
  CF_API_TOKEN?: string;
  /** CF_ACCOUNT_ID is the account the server runs in, whose sites' routes lead to the server itself rather than to a relay. */
  CF_ACCOUNT_ID?: string;
  /** SCRIPT_NAME is the server's Worker, umapp-server when unset. */
  SCRIPT_NAME?: string;
}

const MAX_BODY = 16 << 10;

// Crawlers and headless browsers run scripts too; their pageviews are not visitors.
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|monitor|preview|facebookexternalhit|curl|wget|python|go-http|java\//i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-umami-cache",
  "Access-Control-Max-Age": "86400",
};

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** The websites that exist, remembered for a minute per isolate so most events cost one write. */
const known = new Map<string, number>();

async function websiteExists(env: Env, id: string, now: number): Promise<boolean> {
  const at = known.get(id);
  if (at !== undefined && now - at < 60_000) return true;
  const row = await env.DB.prepare("SELECT 1 FROM website WHERE id = ?").bind(id).first();
  if (row) known.set(id, now);
  return row !== null;
}

/** forget drops a deleted website from what this isolate remembers. */
export function forget(id: string) {
  known.delete(id);
}

async function hash(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("\n"));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** bareHost is host in lower case without a leading "www." or a trailing dot, as scripts/sites.mjs's normalizeDomain stores the domains of the sites routed here. */
export function bareHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function clip(v: unknown, n: number): string {
  return typeof v === "string" ? v.slice(0, n) : "";
}

interface Payload {
  website?: unknown;
  hostname?: unknown;
  url?: unknown;
  referrer?: unknown;
  name?: unknown;
  tag?: unknown;
}

export async function collect(request: Request, env: Env, now = Date.now()): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { message: "Method not allowed." });
  const text = await request.text();
  if (text.length > MAX_BODY) return reply(413, { message: "The event is too large." });
  let body: { type?: unknown; payload?: Payload };
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { message: "The event isn't JSON." });
  }
  // Umami's tracker also identifies sessions; there is nothing to keep of that here.
  if (body?.type !== "event") return reply(200, {});
  const p = body.payload ?? {};
  const website = clip(p.website, 64);
  if (!website) return reply(400, { message: "The event names no website." });

  const ua = request.headers.get("User-Agent") ?? "";
  if (!ua || BOT.test(ua)) return reply(200, {});
  if (!(await websiteExists(env, website, now))) return reply(400, { message: "No such website." });

  const hostname = bareHost(clip(p.hostname, 255));
  let path = "/";
  try {
    path = new URL(clip(p.url, 2000) || "/", "https://" + (hostname || "localhost")).pathname.slice(0, 500);
  } catch {
    // An address that does not parse counts as the root.
  }
  let referrer = "";
  try {
    const r = clip(p.referrer, 2000);
    if (r) {
      const host = bareHost(new URL(r).hostname);
      if (host !== hostname) referrer = host;
    }
  } catch {
    // A referrer that does not parse is no referrer.
  }
  const cf = (request as { cf?: { country?: string } }).cf;
  // T1 is Tor and XX unknown: neither is a country.
  const country = /^[A-Z]{2}$/.test(cf?.country ?? "") && cf?.country !== "T1" && cf?.country !== "XX" ? cf!.country! : "";
  const name = clip(p.name, 50);

  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const day = new Date(now);
  // Sessions last a month and visits an hour, as Umami's, keyed by a salt that changes with them so no lasting identifier is kept.
  const month = `${day.getUTCFullYear()}-${day.getUTCMonth()}`;
  const session = await hash(env.API_KEY ?? "", month, website, ip, ua);
  const visit = await hash(session, String(Math.floor(now / 3_600_000)));

  await env.DB.prepare(
    "INSERT INTO event (website_id, created_at, session_id, visit_id, type, name, path, referrer, country, tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(website, now, session, visit, name ? 2 : 1, name, path, referrer, country, clip(p.tag, 50))
    .run();
  return reply(200, {});
}
