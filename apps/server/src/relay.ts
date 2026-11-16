// The Worker Umapp's server puts in another Cloudflare account to track that account's websites: a route can only lead to a Worker of the zone's own account, so this one stands in for the server there. It passes each request to the site's origin and adds the server's tracker to its HTML pages, which then send their events to the server itself, from the visitor's own address.

/** RELAY is the relay's script name in each account it is uploaded to. */
export const RELAY = "umapp-relay";

interface RelayEnv {
  /** SITES maps each website's domain, without "www.", to its id: JSON. */
  SITES?: string;
  /** SERVER is the server's origin, as https://umapp-server.example.workers.dev. */
  SERVER?: string;
}

/** relayFetch is the relay's whole handler. It stands alone, using nothing outside its body, as relaySource uploads its text. */
export async function relayFetch(request: Request, env: RelayEnv, ctx: ExecutionContext, origin: typeof fetch = fetch): Promise<Response> {
  ctx.passThroughOnException();
  const response = await origin(request);
  let sites: Record<string, string> = {};
  try {
    sites = JSON.parse(env.SITES || "{}");
  } catch {
    return response;
  }
  const host = new URL(request.url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const id = sites[host];
  const server = (env.SERVER || "").replace(/\/+$/, "");
  if (!id || !server || request.method !== "GET" || !response.ok || !response.body) return response;
  if (!/^text\/html\b/i.test(response.headers.get("Content-Type") || "")) return response;
  // A part of a page keeps its bytes: Content-Range states where they lie in the origin's page, which a tag would shift.
  if (response.status === 206 || response.headers.has("Content-Range")) return response;
  const quote = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const tag = `<script defer src="${quote(server)}/script.js" data-website-id="${quote(id)}" data-host-url="${quote(server)}"></script>`;
  let done = false;
  const add = (where: { before(content: string, options: { html: boolean }): unknown }) => {
    if (done) return;
    done = true;
    where.before(tag, { html: true });
  };
  const page = new Response(response.body, response);
  page.headers.delete("Content-Length");
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
    .on("body", { element: add })
    .transform(page);
}

/** relaySource is the relay as the module uploaded to an account. */
export function relaySource(): string {
  return `export default { fetch: ${relayFetch.toString()} };\n`;
}
