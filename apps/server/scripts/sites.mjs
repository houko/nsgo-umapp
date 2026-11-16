// The sites of a Cloudflare account that the Worker can track, decided without any I/O: which zones and routes there are, which hostnames the user chose, and which routes and websites that adds or removes. deploy.mjs does the requests.

/** The Cloudflare API's base, as Wrangler takes it from CLOUDFLARE_API_BASE_URL. */
export const API_BASE = "https://api.cloudflare.com/client/v4";

/** apiHeaders are the headers that authorize a request with what `wrangler auth token --json` printed. */
export function apiHeaders(auth) {
  if (auth?.type === "api_key") return { "X-Auth-Key": auth.key, "X-Auth-Email": auth.email };
  if (typeof auth?.token === "string" && auth.token) return { Authorization: `Bearer ${auth.token}` };
  throw new Error("Wrangler gave no token.");
}

/** hasMorePages tells from a list's result_info whether another page follows, as Wrangler's fetchPagedListResult does. */
export function hasMorePages(info) {
  const { page, per_page: perPage, total_count: total } = info ?? {};
  return typeof page === "number" && typeof perPage === "number" && typeof total === "number" && page * perPage < total;
}

/** parseZones keeps the active zones of GET /zones results, by name. */
export function parseZones(results) {
  return (results ?? [])
    .filter((z) => z && typeof z.id === "string" && typeof z.name === "string" && z.status === "active")
    .map((z) => ({ id: z.id, name: z.name.toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** inactiveZones are the zones of GET /zones results that aren't active yet or anymore, by name with their status, so the user learns why they aren't offered. */
export function inactiveZones(results) {
  return (results ?? [])
    .filter((z) => z && typeof z.name === "string" && typeof z.status === "string" && z.status !== "active")
    .map((z) => ({ name: z.name.toLowerCase(), status: z.status }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** describeInactive says why a zone isn't offered and what makes it active. */
export function describeInactive(zone) {
  return zone.status === "pending" ? `${zone.name} is pending until its nameservers are switched to Cloudflare's` : `${zone.name} is ${zone.status}, not active`;
}

/** permissionAdvice is what to do when Cloudflare refused a request of the sites step for want of a permission, from the answer's HTTP status and errors, or "" when it refused for another reason. */
export function permissionAdvice(status, errors) {
  const codes = new Set((errors ?? []).map((e) => e?.code));
  if (status !== 401 && status !== 403 && !codes.has(10000) && !codes.has(9109)) return "";
  return "The sites need the permissions Zone Read and Workers Routes Edit: sign in with `npx wrangler login`, whose login has both, or give the API token both, then run `npm run deploy` again.";
}

/** parseCustomDomains are the hostnames of GET /accounts/:id/workers/domains results that the Worker named script answers at as its own, lowercased. */
export function parseCustomDomains(results, script) {
  return (results ?? [])
    .filter((d) => d && typeof d.hostname === "string" && d.service === script)
    .map((d) => d.hostname.toLowerCase().replace(/\.$/, ""));
}

/** serverHosts is the SERVER_HOSTS value the Worker is deployed with: what wrangler.jsonc sets, its custom-domain routes, and the custom domains the account gives the Worker, so the Worker answers Umapp at each of them rather than taking it for a site. */
export function serverHosts(configured, routes, customDomains) {
  const hosts = new Set();
  for (const h of String(configured ?? "").split(",")) if (h.trim()) hosts.add(h.trim().toLowerCase().replace(/\.$/, ""));
  for (const r of Array.isArray(routes) ? routes : []) {
    if (r && typeof r === "object" && r.custom_domain && typeof r.pattern === "string") hosts.add(patternParts(r.pattern).host.replace(/\.$/, ""));
  }
  for (const h of customDomains) hosts.add(h);
  return [...hosts].sort().join(",");
}

/** parseRoutes reads GET /zones/:id/workers/routes results; script is "" for a route that runs no Worker. */
export function parseRoutes(results) {
  return (results ?? [])
    .filter((r) => r && typeof r.id === "string" && typeof r.pattern === "string")
    .map((r) => ({ id: r.id, pattern: r.pattern, script: typeof r.script === "string" ? r.script : "" }));
}

/** normalizeDomain is a hostname as the Worker and D1 compare it: lowercase, without a trailing dot or a leading "www.". */
export function normalizeDomain(host) {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return h.startsWith("www.") ? h.slice(4) : h;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** parseHostname is the hostname of what the user typed, a hostname or an address, or "" when it is not one. */
export function parseHostname(input) {
  let s = input.trim().toLowerCase();
  if (!s) return "";
  if (!s.includes("://")) s = "https://" + s;
  let host;
  try {
    host = new URL(s).hostname;
  } catch {
    return "";
  }
  host = host.replace(/\.$/, "");
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || /^\d+$/.test(labels.at(-1))) return "";
  return host;
}

/** zoneOf is the zone a hostname belongs to, the longest whose name it is or ends in, or undefined. */
export function zoneOf(host, zones) {
  let best;
  for (const z of zones) {
    if ((host === z.name || host.endsWith("." + z.name)) && (!best || z.name.length > best.name.length)) best = z;
  }
  return best;
}

/** sitePatterns are the routes that bring a site's traffic to the Worker: its hostname, and its "www." too when it is the zone's apex. */
export function sitePatterns(domain, zoneName) {
  return domain === zoneName ? [`${domain}/*`, `www.${domain}/*`] : [`${domain}/*`];
}

/** patternParts splits a route pattern into its host and path, without a scheme. */
function patternParts(pattern) {
  const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, "");
  const slash = p.indexOf("/");
  return slash < 0 ? { host: p, path: "" } : { host: p.slice(0, slash), path: p.slice(slash) };
}

/** hostGlobMatches tells whether a route's host, which may begin with "*", matches host. */
function hostGlobMatches(glob, host) {
  return glob.startsWith("*") ? host.endsWith(glob.slice(1)) : glob === host;
}

/** conflictFor is the route of another Worker, or of none, that keeps pattern from the Worker named script: the same pattern, or a wildcard host over the same hostname that a route of the hostname itself would take its traffic from. */
export function conflictFor(pattern, routes, script) {
  const { host } = patternParts(pattern);
  return routes.find((r) => {
    if (r.script === script) return false;
    if (r.pattern.trim().toLowerCase() === pattern) return true;
    const other = patternParts(r.pattern);
    return other.host.startsWith("*") && hostGlobMatches(other.host, host) && (r.script !== "" || other.path === "/*");
  });
}

/** describeConflict says plainly whose route is in the way. */
export function describeConflict(route) {
  return route.script ? `${route.pattern} goes to the Worker "${route.script}"` : `${route.pattern} is set to run no Worker`;
}

/** siteState is one site: its domain and zone, each of its patterns with the route of the Worker named script on it or what keeps it, whether the Worker has any of them (routed), whether it is tracked, and why it cannot be: its hostname is one the Worker answers at as its own (ownHosts), or, unless the Worker has one of its patterns already, its own hostname is taken. A site is tracked when it is routed and has its website: websites, the normalized domains of D1's websites, or null when they are unknown. One routed without a website (orphaned), as one deleted in Umapp, isn't kept by default, so its routes go. A site the Worker has keeps the patterns it has; planRoutes skips the one taken. */
export function siteState(domain, zone, routes, script, ownHosts = [], websites = null) {
  const patterns = sitePatterns(domain, zone.name).map((pattern) => ({
    pattern,
    route: routes.find((r) => r.script === script && r.pattern.trim().toLowerCase() === pattern),
    conflict: conflictFor(pattern, routes, script),
  }));
  const own = patterns[0];
  const routed = patterns.some((p) => p.route);
  const tracked = routed && (!websites || websites.has(domain));
  let unavailable = "";
  if (ownHosts.some((h) => normalizeDomain(h) === domain)) unavailable = "it is an address the Worker answers Umapp at";
  else if (!routed && own.conflict) unavailable = describeConflict(own.conflict);
  return { domain, zone, patterns, routed, tracked, orphaned: routed && !tracked, unavailable };
}

/** listSites is every site to offer: each zone's apex, then the other hostnames the Worker already has a route of their own for, in their zone's order. routesByZone maps a zone's id to its routes, ownHosts are the hostnames the Worker answers Umapp at, and websites the normalized domains of D1's websites, or null when unknown. */
export function listSites(zones, routesByZone, script, ownHosts = [], websites = null) {
  const sites = [];
  for (const zone of zones) {
    const routes = routesByZone.get(zone.id) ?? [];
    sites.push(siteState(zone.name, zone, routes, script, ownHosts, websites));
    const extra = new Set();
    for (const r of routes) {
      if (r.script !== script) continue;
      const { host, path } = patternParts(r.pattern);
      if (path !== "/*" || host.includes("*")) continue;
      // A "www." route of another hostname is none of a site's patterns, so it is not offered as one.
      if (host !== normalizeDomain(host)) continue;
      if (host !== zone.name && zoneOf(host, zones) === zone) extra.add(host);
    }
    for (const domain of [...extra].sort()) sites.push(siteState(domain, zone, routes, script, ownHosts, websites));
  }
  return sites;
}

/** parseSelection reads what the user chose: "" keeps the sites tracked now, "all" every site that can be tracked, "none" no site, else numbers of the list and hostnames inside its zones, separated by commas or spaces. inactive are the zones that aren't active, to say why a hostname in one can't be chosen, and ownHosts the hostnames the Worker answers Umapp at. It returns the chosen sites, new hostnames among them, or an error to show. */
export function parseSelection(input, sites, zones, routesByZone, script, { inactive = [], ownHosts = [], websites = null } = {}) {
  const text = input.trim().toLowerCase();
  if (text === "") return { sites: sites.filter((s) => s.tracked) };
  if (text === "none") return { sites: [] };
  if (text === "all") return { sites: sites.filter((s) => !s.unavailable) };
  const chosen = new Map();
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    let site;
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n < 1 || n > sites.length) return { error: `There is no site ${token}: choose from 1 to ${sites.length}.` };
      site = sites[n - 1];
    } else {
      const host = parseHostname(token);
      if (!host) return { error: `"${token}" is neither a number of the list nor a hostname.` };
      const domain = normalizeDomain(host);
      site = sites.find((s) => s.domain === domain);
      if (!site) {
        const zone = zoneOf(domain, zones);
        if (!zone) {
          const waiting = zoneOf(domain, inactive);
          return { error: waiting ? `${host} can't be tracked yet: ${describeInactive(waiting)}.` : `${host} is in none of this account's zones.` };
        }
        site = siteState(domain, zone, routesByZone.get(zone.id) ?? [], script, ownHosts, websites);
      }
    }
    if (site.unavailable) return { error: `${site.domain} can't be tracked: ${site.unavailable}.` };
    chosen.set(site.domain, site);
  }
  return { sites: [...chosen.values()] };
}

/** planRoutes is what changes the routes of the Worker named script into chosen: the patterns chosen sites lack that no other route keeps, and the Worker's routes of the sites tracked now that are not chosen. It never names another Worker's route. */
export function planRoutes(sites, chosen) {
  const keep = new Set(chosen.map((s) => s.domain));
  const add = [];
  const skip = [];
  for (const site of chosen) {
    for (const p of site.patterns) {
      if (p.route) continue;
      if (p.conflict) skip.push({ domain: site.domain, pattern: p.pattern, reason: describeConflict(p.conflict) });
      else add.push({ domain: site.domain, zoneId: site.zone.id, pattern: p.pattern });
    }
  }
  const remove = [];
  for (const site of sites) {
    if (keep.has(site.domain)) continue;
    for (const p of site.patterns) {
      if (p.route) remove.push({ domain: site.domain, zoneId: site.zone.id, id: p.route.id, pattern: p.route.pattern });
    }
  }
  return { add, remove, skip };
}

/** sqlString is s as an SQLite string literal. */
export function sqlString(s) {
  if (s.includes("\0")) throw new Error("A NUL can't be in an SQL string.");
  return `'${s.replaceAll("'", "''")}'`;
}

/** planWebsites is what D1's website table needs so that each domain has a row the Worker finds by it: a new row, or a row of the same site under its "www." or another case given the bare domain. Rows already right stay as they are. */
export function planWebsites(domains, rows) {
  const insert = [];
  const update = [];
  for (const domain of domains) {
    if (rows.some((r) => r.domain === domain)) continue;
    const variant = rows.find((r) => typeof r.domain === "string" && normalizeDomain(r.domain) === domain);
    if (variant) update.push({ id: variant.id, from: variant.domain, domain });
    else insert.push(domain);
  }
  return { insert, update };
}

/** insertWebsiteSql adds the website of domain named after it, unless one has the domain already, so running it twice adds one. */
export function insertWebsiteSql(id, domain, now) {
  const d = sqlString(domain);
  return `INSERT INTO website (id, name, domain, created_at) SELECT ${sqlString(id)}, ${d}, ${d}, ${Math.trunc(now)} WHERE NOT EXISTS (SELECT 1 FROM website WHERE domain = ${d})`;
}

/** updateWebsiteSql gives a website its bare domain. */
export function updateWebsiteSql(id, domain) {
  return `UPDATE website SET domain = ${sqlString(domain)} WHERE id = ${sqlString(id)}`;
}

/** websiteDomainSql is an SQL expression of a website row's domain as normalizeDomain gives it. */
const websiteDomainSql = "(CASE WHEN rtrim(lower(domain), '.') LIKE 'www.%' THEN substr(rtrim(lower(domain), '.'), 5) ELSE rtrim(lower(domain), '.') END)";

/** autoTrackSql marks the websites of domains as tracked through the Worker, and every other website as not, so Umapp shows which need the tracker embedded by hand. */
export function autoTrackSql(domains) {
  return `UPDATE website SET auto_track = (${websiteDomainSql} IN (${domains.map(sqlString).join(", ")}))`;
}

/** mergeConfig is Umapp's config.json text with endpoint set and any key removed, every other field kept; it throws when the text is there but not a JSON object, so a file the app can't read is not lost. */
export function mergeConfig(text, endpoint) {
  let cfg = {};
  if (text !== undefined && text.trim() !== "") {
    cfg = JSON.parse(text);
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw new Error("config.json isn't a JSON object.");
  }
  const { key: _key, ...rest } = cfg;
  return JSON.stringify({ ...rest, endpoint }, null, 2) + "\n";
}
