// Umapp's server: on its own hostnames, it counts the visitors of the sites that embed /script.js and answers Umapp, as an Umami server does, at /api. The sites of its own Cloudflare account whose routes lead here are tracked without embedding anything, by the injector in inject.ts.

import { api } from "./api";
import { collect, type Env } from "./collect";
import { site, trackedWebsite } from "./inject";
import { trackerResponse } from "./tracker";

/** ownHost tells whether hostname is this server's own: its workers.dev address, one SERVER_HOSTS names, or an address such as localhost that `wrangler dev` answers at. No route can lead here from any of them, so none of them is a site's. */
export function ownHost(hostname: string, env: Env): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "workers.dev" || h.endsWith(".workers.dev")) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  return (env.SERVER_HOSTS ?? "").split(",").some((s) => s.trim().toLowerCase().replace(/\.$/, "") === h);
}

/** route answers a request; origin is how a site's own responses are fetched, and now the time to count events at. */
export async function route(request: Request, env: Env, ctx: ExecutionContext, origin: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  // On a site, any failure here, the lookup included, must leave the site as its origin serves it.
  ctx.passThroughOnException();
  const url = new URL(request.url);
  const { pathname } = url;
  if (ownHost(url.hostname, env)) {
    if (pathname === "/script.js") return trackerResponse();
    if (pathname === "/api/send") return collect(request, env, now);
    if (pathname === "/api" || pathname.startsWith("/api/")) return api(request, env, pathname.slice(4), now);
    return new Response("Not found", { status: 404 });
  }
  // Any other hostname is a site whose route leads here. One whose website is gone, or no longer has its domain, still goes to its origin untouched, so the site stays up until its routes are removed.
  const website = await trackedWebsite(env, url.hostname, now);
  return website ? site(request, env, website, origin, now) : origin(request);
}

export default {
  fetch: (request, env, ctx) => route(request, env, ctx),
} satisfies ExportedHandler<Env>;
