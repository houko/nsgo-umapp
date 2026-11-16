// The sites of the Cloudflare account whose routes lead here: their pages pass through to their origin with the tracker added to their head, and the tracker and its events are served beside them under /_umapp.

import { bareHost, collect, type Env } from "./collect";
import { trackerResponse } from "./tracker";

export const SITE_PREFIX = "/_umapp";

const CACHE_FOR = 60_000;
const CACHE_MAX = 1000;

/** The website of each hostname this isolate has looked up, or null for none, kept for a minute so a page costs no query. Only answers are kept, never a lookup in flight: a request's I/O belongs to that request, so a pending query shared with another request could be cancelled under it. */
const sites = new Map<string, { at: number; id: string | null }>();

/** trackedWebsite is the id of the website whose domain is host without its "www." or a trailing dot, or null when there is none. A domain stored with either of those, as Umapp's API keeps what was typed, is found all the same. */
export async function trackedWebsite(env: Env, host: string, now: number): Promise<string | null> {
  const domain = bareHost(host);
  const cached = sites.get(domain);
  if (cached && now - cached.at >= 0 && now - cached.at < CACHE_FOR) return cached.id;
  const row = await env.DB.prepare("SELECT id FROM website WHERE domain IN (?1, 'www.' || ?1, ?1 || '.', 'www.' || ?1 || '.') ORDER BY created_at, id LIMIT 1")
    .bind(domain)
    .first<{ id: string }>();
  const id = row?.id ?? null;
  // A failed query threw above, so it is not remembered: the next request asks again.
  if (sites.size >= CACHE_MAX) sites.clear();
  sites.set(domain, { at: now, id });
  return id;
}

function escapeAttribute(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** tag is the script element added to a page of website id. */
export function tag(id: string): string {
  return `<script defer src="${SITE_PREFIX}/script.js" data-website-id="${escapeAttribute(id)}" data-host-url="${SITE_PREFIX}"></script>`;
}

/** withTracker adds the tracker of website id at the end of the head of an HTML page, unless the head already has a script naming a website. */
export function withTracker(response: Response, id: string): Response {
  if (!response.ok || !/^text\/html\b/i.test(response.headers.get("Content-Type") ?? "") || !response.body) return response;
  // A part of a page keeps its bytes: Content-Range states where they lie in the origin's page, which a tag would shift.
  if (response.status === 206 || response.headers.has("Content-Range")) return response;
  let done = false;
  const add = (where: { before(content: string, options: { html: boolean }): unknown }) => {
    if (done) return;
    done = true;
    where.before(tag(id), { html: true });
  };
  // The page grows, so the origin's length no longer holds; without one the page streams in chunks.
  const page = new Response(response.body, response);
  page.headers.delete("Content-Length");
  // Nor is the page byte for byte the origin's any more, which a strong ETag would promise to a range request's If-Range; a weak one still lets If-None-Match revalidate it.
  const etag = page.headers.get("ETag");
  if (etag && !etag.startsWith("W/")) page.headers.set("ETag", "W/" + etag);
  return new HTMLRewriter()
    .on("head script[data-website-id]", {
      element() {
        done = true;
      },
    })
    .on("head", {
      element(head) {
        head.onEndTag(add);
      },
    })
    // A head without its end tag ends where the body starts, which is still the head to the parser.
    .on("body", { element: add })
    .transform(page);
}

/** site answers a request to the site of website id: the tracker and its events under /_umapp, else the origin's response with the tracker added to its pages. */
export async function site(request: Request, env: Env, id: string, origin: typeof fetch, now: number): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === SITE_PREFIX + "/script.js") return trackerResponse();
  if (pathname === SITE_PREFIX + "/api/send") return collect(request, env, now);
  const response = await origin(request);
  return request.method === "GET" ? withTracker(response, id) : response;
}
