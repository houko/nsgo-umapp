import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  apiHeaders,
  autoTrackSql,
  connectLink,
  conflictFor,
  describeInactive,
  hasMorePages,
  inactiveZones,
  insertWebsiteSql,
  listSites,
  mergeConfig,
  normalizeDomain,
  parseCustomDomains,
  parseHostname,
  parseRoutes,
  parseSelection,
  parseZones,
  permissionAdvice,
  planRoutes,
  planWebsites,
  serverHosts,
  tokenLink,
  trackedElsewhere,
  sitePatterns,
  sqlString,
  updateWebsiteSql,
  zoneOf,
} from "./sites.mjs";

const SCRIPT = "umapp-server";
const zones = [
  { id: "z1", name: "example.com" },
  { id: "z2", name: "other.org" },
  { id: "z3", name: "shop.net" },
];
const routesByZone = new Map([
  [
    "z1",
    [
      { id: "r1", pattern: "example.com/*", script: SCRIPT },
      { id: "r2", pattern: "www.example.com/*", script: SCRIPT },
      { id: "r3", pattern: "blog.example.com/*", script: SCRIPT },
      { id: "r4", pattern: "example.com/api/*", script: "api" },
    ],
  ],
  ["z2", []],
  ["z3", [{ id: "r5", pattern: "shop.net/*", script: "shop" }]],
]);

test("apiHeaders authorizes with what wrangler auth token --json printed", () => {
  assert.deepEqual(apiHeaders({ type: "oauth", token: "t" }), { Authorization: "Bearer t" });
  assert.deepEqual(apiHeaders({ type: "api_token", token: "t" }), { Authorization: "Bearer t" });
  assert.deepEqual(apiHeaders({ type: "api_key", key: "k", email: "e@x" }), { "X-Auth-Key": "k", "X-Auth-Email": "e@x" });
  assert.throws(() => apiHeaders({ type: "oauth" }));
});

test("hasMorePages follows result_info", () => {
  assert.equal(hasMorePages({ page: 1, per_page: 50, total_count: 51 }), true);
  assert.equal(hasMorePages({ page: 2, per_page: 50, total_count: 100 }), false);
  assert.equal(hasMorePages({ page: 1, per_page: 50 }), false);
  assert.equal(hasMorePages(undefined), false);
});

test("parseZones keeps active zones by name", () => {
  const got = parseZones([
    { id: "b", name: "B.com", status: "active", account: { id: "a" } },
    { id: "a", name: "a.com", status: "active" },
    { id: "p", name: "pending.com", status: "pending" },
    { id: 1, name: "bad" },
    null,
  ]);
  assert.deepEqual(got, [
    { id: "a", name: "a.com" },
    { id: "b", name: "b.com" },
  ]);
  assert.deepEqual(parseZones(undefined), []);
});

test("parseRoutes gives a route without a Worker an empty script", () => {
  assert.deepEqual(parseRoutes([{ id: "1", pattern: "a.com/*", script: "w" }, { id: "2", pattern: "a.com/x*" }, { pattern: "no-id" }]), [
    { id: "1", pattern: "a.com/*", script: "w" },
    { id: "2", pattern: "a.com/x*", script: "" },
  ]);
});

test("normalizeDomain lowercases and drops www. and a trailing dot", () => {
  assert.equal(normalizeDomain(" WWW.Example.COM. "), "example.com");
  assert.equal(normalizeDomain("blog.example.com"), "blog.example.com");
  assert.equal(normalizeDomain("wwwx.example.com"), "wwwx.example.com");
});

test("parseHostname takes hostnames and addresses only", () => {
  assert.equal(parseHostname("Blog.Example.com"), "blog.example.com");
  assert.equal(parseHostname("https://blog.example.com/path?q"), "blog.example.com");
  assert.equal(parseHostname("example.com."), "example.com");
  for (const bad of ["", "localhost", "1.2.3.4", "exa mple.com", "-a.com", "a_b.com", "*.example.com", "'; DROP TABLE website;--"]) {
    assert.equal(parseHostname(bad), "", bad);
  }
});

test("zoneOf picks the longest zone a hostname is in", () => {
  const zs = [...zones, { id: "z4", name: "sub.example.com" }];
  assert.equal(zoneOf("example.com", zs).id, "z1");
  assert.equal(zoneOf("a.b.example.com", zs).id, "z1");
  assert.equal(zoneOf("x.sub.example.com", zs).id, "z4");
  assert.equal(zoneOf("notexample.com", zs), undefined);
});

test("sitePatterns adds www. for a zone apex only", () => {
  assert.deepEqual(sitePatterns("example.com", "example.com"), ["example.com/*", "www.example.com/*"]);
  assert.deepEqual(sitePatterns("blog.example.com", "example.com"), ["blog.example.com/*"]);
});

test("conflictFor finds the same pattern or a wildcard host of another Worker", () => {
  const routes = [
    { id: "1", pattern: "a.com/*", script: "other" },
    { id: "2", pattern: "*.b.com/*", script: "other" },
    { id: "3", pattern: "c.com/api/*", script: "api" },
    { id: "4", pattern: "*d.com/static/*", script: "" },
    { id: "5", pattern: "*e.com/*", script: "" },
    { id: "6", pattern: "f.com/*", script: SCRIPT },
  ];
  assert.equal(conflictFor("a.com/*", routes, SCRIPT)?.id, "1");
  assert.equal(conflictFor("x.b.com/*", routes, SCRIPT)?.id, "2");
  assert.equal(conflictFor("b.com/*", routes, SCRIPT), undefined);
  assert.equal(conflictFor("c.com/*", routes, SCRIPT), undefined);
  assert.equal(conflictFor("d.com/*", routes, SCRIPT), undefined);
  assert.equal(conflictFor("www.e.com/*", routes, SCRIPT)?.id, "5");
  assert.equal(conflictFor("f.com/*", routes, SCRIPT), undefined);
});

test("listSites offers apexes and the Worker's own other hostnames", () => {
  const sites = listSites(zones, routesByZone, SCRIPT);
  assert.deepEqual(
    sites.map((s) => [s.domain, s.tracked, s.unavailable]),
    [
      ["example.com", true, ""],
      ["blog.example.com", true, ""],
      ["other.org", false, ""],
      ["shop.net", false, 'shop.net/* goes to the Worker "shop"'],
    ],
  );
  const odd = new Map([["z2", [{ id: "x", pattern: "www.blog.other.org/*", script: SCRIPT }, { id: "y", pattern: "*.other.org/*", script: SCRIPT }]]]);
  assert.deepEqual(listSites([zones[1]], odd, SCRIPT).map((s) => s.domain), ["other.org"]);
  assert.deepEqual(
    sites[0].patterns.map((p) => [p.pattern, p.route?.id]),
    [
      ["example.com/*", "r1"],
      ["www.example.com/*", "r2"],
    ],
  );
});

test("parseSelection reads numbers, all, none, hostnames and Enter", () => {
  const sites = listSites(zones, routesByZone, SCRIPT);
  const pick = (input) => {
    const r = parseSelection(input, sites, zones, routesByZone, SCRIPT);
    return r.error ? r : r.sites.map((s) => s.domain);
  };
  assert.deepEqual(pick(""), ["example.com", "blog.example.com"]);
  assert.deepEqual(pick("1,3"), ["example.com", "other.org"]);
  assert.deepEqual(pick(" 3 , 1 3 "), ["other.org", "example.com"]);
  assert.deepEqual(pick("ALL"), ["example.com", "blog.example.com", "other.org"]);
  assert.deepEqual(pick("none"), []);
  assert.deepEqual(pick("1, docs.example.com"), ["example.com", "docs.example.com"]);
  assert.deepEqual(pick("www.other.org"), ["other.org"]);
  assert.deepEqual(pick("https://Blog.Example.com/"), ["blog.example.com"]);
  assert.match(pick("0").error, /no site 0/);
  assert.match(pick("5").error, /no site 5/);
  assert.match(pick("4").error, /shop\.net can't be tracked/);
  assert.match(pick("shop.net").error, /can't be tracked/);
  assert.match(pick("elsewhere.com").error, /none of this account's zones/);
  assert.match(pick("1;2").error, /neither a number/);
  const added = parseSelection("docs.example.com", sites, zones, routesByZone, SCRIPT).sites[0];
  assert.deepEqual(added.patterns.map((p) => p.pattern), ["docs.example.com/*"]);
  assert.equal(added.zone.id, "z1");
});

test("planRoutes adds what chosen sites lack and removes the Worker's routes of sites left out", () => {
  const routes = new Map(routesByZone);
  routes.set("z2", [{ id: "w", pattern: "www.other.org/*", script: "legacy" }]);
  const sites = listSites(zones, routes, SCRIPT);
  const chosen = parseSelection("1,3", sites, zones, routes, SCRIPT).sites;
  const plan = planRoutes(sites, chosen);
  assert.deepEqual(plan.add, [{ domain: "other.org", zoneId: "z2", pattern: "other.org/*" }]);
  assert.deepEqual(plan.skip, [{ domain: "other.org", pattern: "www.other.org/*", reason: 'www.other.org/* goes to the Worker "legacy"' }]);
  assert.deepEqual(plan.remove, [{ domain: "blog.example.com", zoneId: "z1", id: "r3", pattern: "blog.example.com/*" }]);

  const none = planRoutes(sites, []);
  assert.deepEqual(none.add, []);
  assert.deepEqual(none.remove.map((r) => r.id), ["r1", "r2", "r3"]);

  const same = planRoutes(sites, sites.filter((s) => s.tracked));
  assert.deepEqual(same, { add: [], remove: [], skip: [] });
});

test("planRoutes completes a site the Worker has only part of", () => {
  const routes = new Map([["z2", [{ id: "w", pattern: "www.other.org/*", script: SCRIPT }]]]);
  const sites = listSites([zones[1]], routes, SCRIPT);
  assert.equal(sites[0].tracked, true);
  const plan = planRoutes(sites, sites);
  assert.deepEqual(plan.add, [{ domain: "other.org", zoneId: "z2", pattern: "other.org/*" }]);
  assert.deepEqual(plan.remove, []);
});

test("sqlString escapes quotes and refuses NUL", () => {
  assert.equal(sqlString("a.com"), "'a.com'");
  assert.equal(sqlString("it's"), "'it''s'");
  assert.equal(sqlString("''"), "''''''");
  assert.throws(() => sqlString("a\0b"));
});

test("website statements insert once and update by id", () => {
  assert.equal(
    insertWebsiteSql("id-1", "a.com", 1700000000000.7),
    "INSERT INTO website (id, name, domain, created_at) SELECT 'id-1', 'a.com', 'a.com', 1700000000000 WHERE NOT EXISTS (SELECT 1 FROM website WHERE domain = 'a.com')",
  );
  assert.equal(updateWebsiteSql("x'y", "a.com"), "UPDATE website SET domain = 'a.com' WHERE id = 'x''y'");
});

test("planWebsites adds missing websites and gives variants their bare domain", () => {
  const rows = [
    { id: "1", domain: "a.com" },
    { id: "2", domain: "www.b.com" },
    { id: "3", domain: "C.com" },
  ];
  assert.deepEqual(planWebsites(["a.com", "b.com", "c.com", "d.com"], rows), {
    insert: ["d.com"],
    update: [
      { id: "2", from: "www.b.com", domain: "b.com" },
      { id: "3", from: "C.com", domain: "c.com" },
    ],
  });
  assert.deepEqual(planWebsites([], rows), { insert: [], update: [] });
});

test("mergeConfig sets the endpoint, drops the key and keeps the rest", () => {
  const got = JSON.parse(mergeConfig('{"endpoint":"https://api.umami.is/v1","key":"old","range":2,"language":"zh-Hans"}', "https://w.dev/api"));
  assert.deepEqual(got, { range: 2, language: "zh-Hans", endpoint: "https://w.dev/api" });
  assert.deepEqual(JSON.parse(mergeConfig(undefined, "e")), { endpoint: "e" });
  assert.deepEqual(JSON.parse(mergeConfig("  \n", "e")), { endpoint: "e" });
  assert.throws(() => mergeConfig("{broken", "e"));
  assert.throws(() => mergeConfig("[1]", "e"));
  assert.throws(() => mergeConfig("null", "e"));
});

test("inactiveZones lists the zones not offered, and describeInactive says why", () => {
  const got = inactiveZones([
    { id: "a", name: "a.com", status: "active" },
    { id: "p", name: "New.com", status: "pending" },
    { id: "m", name: "moved.com", status: "moved" },
    null,
  ]);
  assert.deepEqual(got, [
    { name: "moved.com", status: "moved" },
    { name: "new.com", status: "pending" },
  ]);
  assert.match(describeInactive(got[1]), /new\.com is pending until its nameservers are switched/);
  assert.equal(describeInactive(got[0]), "moved.com is moved, not active");
});

test("parseSelection says a hostname of a pending zone can't be tracked yet", () => {
  const sites = listSites(zones, routesByZone, SCRIPT);
  const inactive = [{ name: "new.com", status: "pending" }];
  const r = parseSelection("blog.new.com", sites, zones, routesByZone, SCRIPT, { inactive });
  assert.match(r.error, /blog\.new\.com can't be tracked yet: new\.com is pending/);
  assert.match(parseSelection("elsewhere.com", sites, zones, routesByZone, SCRIPT, { inactive }).error, /none of this account's zones/);
});

test("permissionAdvice names the permissions for refusals only", () => {
  assert.match(permissionAdvice(403, []), /Zone Read and Workers Routes Edit/);
  assert.match(permissionAdvice(400, [{ code: 10000, message: "Authentication error" }]), /wrangler login/);
  assert.match(permissionAdvice(400, [{ code: 9109, message: "Unauthorized" }]), /wrangler login/);
  assert.equal(permissionAdvice(400, [{ code: 10020, message: "Bad pattern" }]), "");
  assert.equal(permissionAdvice(500, undefined), "");
});

test("serverHosts joins the configured hosts, custom-domain routes and the account's custom domains", () => {
  const domains = parseCustomDomains(
    [
      { hostname: "Stats.Example.com", service: SCRIPT },
      { hostname: "other.example.com", service: "other" },
      { service: SCRIPT },
    ],
    SCRIPT,
  );
  assert.deepEqual(domains, ["stats.example.com"]);
  const routes = [{ pattern: "api.shop.net", custom_domain: true }, { pattern: "x.shop.net/*", zone_name: "shop.net" }, "y.shop.net/*"];
  assert.equal(serverHosts(" A.org , ", routes, domains), "a.org,api.shop.net,stats.example.com");
  assert.equal(serverHosts(undefined, undefined, []), "");
});

test("a hostname the Worker answers Umapp at is no site", () => {
  const ownHosts = ["stats.example.com", "www.other.org"];
  const sites = listSites(zones, routesByZone, SCRIPT, ownHosts);
  assert.equal(sites.find((s) => s.domain === "other.org").unavailable, "it is an address the Worker answers Umapp at");
  assert.ok(!parseSelection("all", sites, zones, routesByZone, SCRIPT, { ownHosts }).sites.some((s) => s.domain === "other.org"));
  assert.match(parseSelection("stats.example.com", sites, zones, routesByZone, SCRIPT, { ownHosts }).error, /stats\.example\.com can't be tracked: it is an address the Worker answers Umapp at/);
});

test("a tracked site whose apex another Worker took keeps its www route", () => {
  const routes = new Map([
    [
      "z2",
      [
        { id: "a", pattern: "other.org/*", script: "other" },
        { id: "b", pattern: "www.other.org/*", script: SCRIPT },
      ],
    ],
  ]);
  const sites = listSites([zones[1]], routes, SCRIPT);
  assert.equal(sites[0].tracked, true);
  assert.equal(sites[0].unavailable, "");
  for (const input of ["", "all", "1", "other.org"]) {
    const chosen = parseSelection(input, sites, [zones[1]], routes, SCRIPT).sites;
    assert.deepEqual(chosen.map((s) => s.domain), ["other.org"], input);
    assert.deepEqual(planRoutes(sites, chosen), {
      add: [],
      remove: [],
      skip: [{ domain: "other.org", pattern: "other.org/*", reason: 'other.org/* goes to the Worker "other"' }],
    });
  }
  // A site the Worker has none of still can't be had once its own hostname is taken.
  const untracked = listSites([zones[1]], new Map([["z2", [{ id: "a", pattern: "other.org/*", script: "other" }]]]), SCRIPT);
  assert.match(untracked[0].unavailable, /goes to the Worker "other"/);
});

test("a routed site whose website was deleted isn't kept by default, so its routes go", () => {
  const websites = new Set(["blog.example.com"]);
  const sites = listSites(zones, routesByZone, SCRIPT, [], websites);
  const apex = sites.find((s) => s.domain === "example.com");
  assert.equal(apex.routed, true);
  assert.equal(apex.tracked, false);
  assert.equal(apex.orphaned, true);
  const kept = parseSelection("", sites, zones, routesByZone, SCRIPT, { websites });
  assert.deepEqual(kept.sites.map((s) => s.domain), ["blog.example.com"]);
  assert.deepEqual(planRoutes(sites, kept.sites).remove.map((r) => r.id).sort(), ["r1", "r2"]);
  const again = parseSelection("example.com, blog.example.com", sites, zones, routesByZone, SCRIPT, { websites });
  assert.deepEqual(planRoutes(sites, again.sites).remove, []);
  assert.equal(listSites(zones, routesByZone, SCRIPT, [], null)[0].tracked, true);
});

/** schema is a fresh database with the server's migrations, as D1 runs them. */
function schema() {
  const db = new DatabaseSync(":memory:");
  for (const m of ["0001_init.sql", "0002_auto_track.sql"]) db.exec(readFileSync(new URL(`../migrations/${m}`, import.meta.url), "utf8"));
  return db;
}

test("website statements run on the server's schema: inserts once, marks what the Worker tracks", () => {
  const db = schema();
  db.exec(insertWebsiteSql("a", "example.com", 1));
  db.exec(insertWebsiteSql("b", "example.com", 2));
  db.exec(insertWebsiteSql("c", "it's.example.org", 3));
  db.exec("INSERT INTO website (id, name, domain, created_at) VALUES ('d', 'Manual', 'WWW.Manual.example.', 4)");
  assert.deepEqual(db.prepare("SELECT id, domain FROM website ORDER BY id").all().map((r) => [r.id, r.domain]), [
    ["a", "example.com"],
    ["c", "it's.example.org"],
    ["d", "WWW.Manual.example."],
  ]);
  db.exec(autoTrackSql(["example.com", "manual.example"]));
  assert.deepEqual(db.prepare("SELECT id, auto_track FROM website ORDER BY id").all().map((r) => [r.id, r.auto_track]), [
    ["a", 1],
    ["c", 0],
    ["d", 1],
  ]);
  db.exec(autoTrackSql([]));
  assert.equal(db.prepare("SELECT sum(auto_track) AS n FROM website").get().n, 0);
  db.exec(updateWebsiteSql("d", "manual.example"));
  assert.equal(db.prepare("SELECT domain FROM website WHERE id = 'd'").get().domain, "manual.example");
});

test("connectLink carries the endpoint and key so the app reads them back", () => {
  const link = connectLink("https://umapp-server.example.workers.dev/api", "umapp_a+b/c=");
  const u = new URL(link);
  assert.equal(u.protocol, "umapp:");
  assert.equal(u.host, "connect");
  assert.equal(u.searchParams.get("endpoint"), "https://umapp-server.example.workers.dev/api");
  assert.equal(u.searchParams.get("key"), "umapp_a+b/c=");
});

test("tokenLink fills in the token's permissions on every account and zone", () => {
  const url = new URL(tokenLink("Umapp server"));
  assert.equal(url.origin + url.pathname, "https://dash.cloudflare.com/profile/api-tokens");
  assert.deepEqual(JSON.parse(url.searchParams.get("permissionGroupKeys")), [
    { key: "zone", type: "read" },
    { key: "workers_routes", type: "edit" },
    { key: "workers_scripts", type: "edit" },
    { key: "account_settings", type: "read" },
  ]);
  assert.equal(url.searchParams.get("accountId"), "*");
  assert.equal(url.searchParams.get("zoneId"), "all");
  assert.equal(url.searchParams.get("name"), "Umapp server");
});

test("trackedElsewhere keeps the websites Umapp tracks in another account", () => {
  const zones = [{ id: "z1", name: "example.com" }];
  const rows = [
    { id: "1", domain: "example.com", auto_track: 1 },
    { id: "2", domain: "www.Other.app", auto_track: 1 },
    { id: "3", domain: "manual.org", auto_track: 0 },
  ];
  assert.deepEqual(trackedElsewhere(rows, zones), ["other.app"]);
});
