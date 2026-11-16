// The script sites embed. It sends what Umami's tracker sends, to /api/send of the server it came from, so either script works with either server: a pageview on load and on each change of the history, and umami.track(name, data) or a click on an element with data-umami-event for a custom event.
//
// Attributes of the script: data-website-id (required), data-host-url, data-tag, data-domains (a comma-separated list of the hostnames to count on), data-auto-track="false" and data-do-not-track="true".
export const trackerScript = `(() => {
  const script = document.currentScript;
  if (!script) return;
  const attr = (name) => script.getAttribute("data-" + name);
  const website = attr("website-id");
  if (!website) return;
  const host = (attr("host-url") || new URL(script.src).origin).replace(/\\/+$/, "");
  const tag = attr("tag") || undefined;
  const domains = (attr("domains") || "").split(",").map((d) => d.trim()).filter(Boolean);
  const dnt = attr("do-not-track") === "true" && (navigator.doNotTrack === "1" || window.doNotTrack === "1");
  let referrer = document.referrer;
  let current = location.href;

  const disabled = () => {
    if (dnt || (domains.length && !domains.includes(location.hostname))) return true;
    try {
      return !!localStorage.getItem("umami.disabled");
    } catch {
      return false;
    }
  };
  const payload = (extra) => ({
    website,
    hostname: location.hostname,
    screen: screen.width + "x" + screen.height,
    language: navigator.language,
    title: document.title,
    url: location.pathname + location.search,
    referrer,
    tag,
    ...extra,
  });
  const send = (body) => {
    if (disabled()) return;
    fetch(host + "/api/send", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };
  const track = (name, data) => send({ type: "event", payload: typeof name === "string" ? payload({ name, data }) : payload() });
  window.umami = { track };

  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element && e.target.closest("[data-umami-event]");
    if (!el) return;
    const data = {};
    for (const a of el.attributes) {
      const m = a.name.match(/^data-umami-event-(.+)$/);
      if (m) data[m[1]] = a.value;
    }
    track(el.getAttribute("data-umami-event"), data);
  }, true);

  if (attr("auto-track") === "false") return;
  const changed = () => {
    if (location.href === current) return;
    referrer = current;
    current = location.href;
    track();
  };
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      changed();
      return result;
    };
  }
  addEventListener("popstate", changed);
  if (document.readyState === "complete") track();
  else addEventListener("load", () => track(), { once: true });
})();
`;

/** trackerResponse serves the script, cached for a day and to any origin. */
export function trackerResponse(): Response {
  return new Response(trackerScript, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
