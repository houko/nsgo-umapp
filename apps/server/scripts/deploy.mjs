// Deploys the server to the Cloudflare account Wrangler is signed in to, signing in first if it is not and asking which account when there are several, unless CLOUDFLARE_ACCOUNT_ID says: creates the D1 database the first time, applies its migrations, and deploys the Worker, with a new API key when it has none and with SERVER_HOSTS naming the custom domains it answers Umapp at. It prints the endpoint and, when it made one, the key to connect Umapp with. It asks once for a Cloudflare token, made from a link with its permissions filled in, with which Umapp lists and adds the sites of every account the user manages. Then it offers the account's sites to track, whose traffic Worker routes bring through the Worker so it adds the tracker to their pages, or as UMAPP_SITES lists them, which a run without a terminal needs, and on a Mac offers to connect Umapp itself. Running it again deploys the current code and keeps the database, the key and the sites.

import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir, userInfo } from "node:os";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_readRawConfig } from "wrangler";
import {
  API_BASE,
  apiHeaders,
  autoTrackSql,
  connectLink,
  describeInactive,
  hasMorePages,
  inactiveZones,
  insertWebsiteSql,
  listSites,
  mergeConfig,
  normalizeDomain,
  parseCustomDomains,
  parseRoutes,
  parseSelection,
  parseZones,
  permissionAdvice,
  planRoutes,
  planWebsites,
  serverHosts,
  tokenLink,
  trackedElsewhere,
  updateWebsiteSql,
} from "./sites.mjs";

// DATABASE is wrangler.jsonc's database_name.
const DATABASE = "umapp";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPackage = createRequire(import.meta.url).resolve("wrangler/package.json");
const wrangler = join(dirname(wranglerPackage), JSON.parse(readFileSync(wranglerPackage, "utf8")).bin.wrangler);
const config = experimental_readRawConfig({ config: join(root, "wrangler.jsonc") }).rawConfig;
// SCRIPT is the Worker's name in wrangler.jsonc, which the sites' routes lead to.
const SCRIPT = config.name;
// The keychain item Umapp keeps its API key in, as apps/umapp/platform_native.go names it.
const KEYCHAIN_SERVICE = "umapp: Umami API key";
// The bundle id Umapp runs as, from apps/umapp/nsgo.yaml.
const BUNDLE_ID = "me.oneo.umapp";

/** run runs Wrangler with its output shown, stdin closed so it asks nothing, and returns its stdout when capture is set. */
function run(args, { capture = false, check = true, interactive = false } = {}) {
  const res = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: [interactive ? "inherit" : "ignore", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
  });
  if (check && res.status !== 0) {
    if (capture) process.stderr.write(res.stderr + res.stdout);
    console.error(`\nwrangler ${args.join(" ")} failed.`);
    process.exit(res.status ?? 1);
  }
  return res;
}

/** jsonArray reads the JSON array Wrangler printed, after any lines before it. */
function jsonArray(out) {
  const i = out.indexOf("[");
  return i < 0 ? [] : JSON.parse(out.slice(i));
}

function step(text) {
  console.log(`\n▸ ${text}`);
}

/** ask asks one question in the terminal and returns the answer. */
async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  // Without a listener, Control-C would only pause the prompt and leave the script waiting.
  rl.on("SIGINT", () => process.exit(130));
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/** confirm asks a yes-or-no question, def answering an empty reply. */
async function confirm(question, def) {
  for (;;) {
    const a = (await ask(`${question} ${def ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
    if (a === "") return def;
    if (a === "y" || a === "yes") return true;
    if (a === "n" || a === "no") return false;
  }
}

/** api makes a request of the Cloudflare API with Wrangler's login and returns the whole JSON answer, throwing what Cloudflare said when it failed, with what to do in its advice when the login lacks a permission. */
async function api(headers, method, path, { query, body } = {}) {
  const base = (process.env.CLOUDFLARE_API_BASE_URL || process.env.CF_API_BASE_URL || API_BASE).replace(/\/$/, "");
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const why = (json.errors ?? []).map((e) => (e.code ? `${e.message} (${e.code})` : e.message)).join("; ");
    const error = new Error(`${method} ${path}: ${why || `HTTP ${res.status}`}`);
    error.advice = permissionAdvice(res.status, json.errors);
    throw error;
  }
  return json;
}

/** d1 runs one SQL statement on the deployed database and returns its rows, throwing rather than exiting when it fails so the key is still shown. Wrangler takes the statement as an argument, with no shell to quote for, and sends it to D1's query API; --file would import it instead, which takes the database offline meanwhile. */
function d1(sql) {
  const res = run(["d1", "execute", DATABASE, "--remote", "--json", "--command", sql], { capture: true, check: false });
  if (res.status !== 0) throw new Error(`wrangler d1 execute failed:\n${res.stderr}${res.stdout}`);
  return jsonArray(res.stdout)[0]?.results ?? [];
}

step("Checking the Cloudflare account");
let who = run(["whoami", "--json"], { capture: true, check: false });
if (who.status !== 0) {
  run(["login"], { interactive: true });
  who = run(["whoami", "--json"], { capture: true });
}
// Wrangler asks nothing here, so with several accounts it would refuse to choose: choose first, unless CLOUDFLARE_ACCOUNT_ID did.
if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
  const accounts = JSON.parse(who.stdout.slice(who.stdout.indexOf("{"))).accounts ?? [];
  if (accounts.length === 1) {
    process.env.CLOUDFLARE_ACCOUNT_ID = accounts[0].id;
  } else if (accounts.length > 1) {
    if (!stdin.isTTY) {
      console.error("Several Cloudflare accounts are signed in: set CLOUDFLARE_ACCOUNT_ID to the one to deploy to.");
      process.exit(1);
    }
    accounts.forEach((a, i) => console.log(`  ${i + 1}. ${a.name}`));
    const rl = createInterface({ input: stdin, output: stdout });
    let pick = 0;
    while (!(pick >= 1 && pick <= accounts.length)) {
      pick = Number(await rl.question(`Deploy to which account? [1-${accounts.length}] `));
    }
    rl.close();
    process.env.CLOUDFLARE_ACCOUNT_ID = accounts[pick - 1].id;
  }
}

step(`Preparing the D1 database "${DATABASE}"`);
const databases = jsonArray(run(["d1", "list", "--json"], { capture: true }).stdout);
if (!databases.some((db) => db.name === DATABASE)) {
  run(["d1", "create", DATABASE]);
}
run(["d1", "migrations", "apply", DATABASE, "--remote"]);

/** login is Wrangler's login for the Cloudflare API: the headers that authorize a request, and its kind, "oauth", "api_token" or "api_key". */
function login() {
  const token = run(["auth", "token", "--json"], { capture: true, check: false });
  if (token.status !== 0) throw new Error(`Wrangler gave no token.\n${token.stderr}`);
  const auth = JSON.parse(token.stdout.slice(token.stdout.indexOf("{")));
  return { headers: apiHeaders(auth), type: auth.type };
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
let auth = null;
try {
  auth = login();
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}

// Any hostname the Worker isn't told is its own is taken for a site whose route leads there, so it must know each custom domain it answers Umapp at, or Umapp could no longer reach it there.
step("Reading the Worker's custom domains");
let customDomains = [];
if (accountId) {
  try {
    customDomains = parseCustomDomains((await api(auth.headers, "GET", `/accounts/${accountId}/workers/domains`)).result, SCRIPT);
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    console.error(e.advice ? `\n${e.advice}` : "\nThe Worker must know the custom domains it answers Umapp at, so it isn't deployed. Nothing has changed: run `npm run deploy` again once Cloudflare answers.");
    process.exit(1);
  }
}
const SERVER_HOSTS = serverHosts(config.vars?.SERVER_HOSTS, config.routes, customDomains);
console.log(SERVER_HOSTS ? `  ${SERVER_HOSTS.split(",").join(", ")}` : "  None: the Worker answers at its workers.dev address.");

const secrets = run(["secret", "list", "--format", "json"], { capture: true, check: false });
const secretNames = new Set(secrets.status === 0 ? jsonArray(secrets.stdout).map((s) => s.name) : []);
const hasKey = secretNames.has("API_KEY");

/** cloudflareToken is a new token for the server to list and add the sites of every Cloudflare account the user manages, from UMAPP_CF_TOKEN or pasted in the terminal, checked by listing zones with it; "" when the Worker keeps the one it has or goes without. Wrangler's own login can't make one, so the user creates it once from a link with its permissions filled in. */
async function cloudflareToken() {
  step("Giving the server a Cloudflare token");
  const fromEnv = process.env.UMAPP_CF_TOKEN?.trim();
  if (!fromEnv && secretNames.has("CF_API_TOKEN")) {
    console.log("  The one set before; set UMAPP_CF_TOKEN to replace it.");
    return "";
  }
  let token = fromEnv;
  if (!token) {
    if (!stdin.isTTY) {
      console.log("  None: Umapp adds sites only as UMAPP_SITES lists them here. To add them from Umapp, set UMAPP_CF_TOKEN to a token made at:");
      console.log(`  ${tokenLink("Umapp server")}`);
      return "";
    }
    console.log("  With a token, Umapp's + lists the sites of every Cloudflare account you manage and adds one with a tap. Create it once at this link, whose permissions are filled in, then paste it here:");
    console.log(`\n  ${tokenLink("Umapp server")}\n`);
  }
  for (;;) {
    token ||= (await ask("  Token (Enter to go without): ")).trim();
    if (!token) return "";
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const zones = await pages(headers, "/zones", { status: "active", per_page: 50 });
      const accounts = new Set(zones.map((z) => z.account?.name).filter(Boolean));
      if (zones.length) await api(headers, "GET", `/zones/${zones[0].id}/workers/routes`);
      console.log(`  ✓ It sees ${zones.length} site${zones.length === 1 ? "" : "s"} in ${accounts.size} account${accounts.size === 1 ? "" : "s"}${accounts.size ? `: ${[...accounts].join(", ")}` : ""}.`);
      return token;
    } catch (e) {
      console.error(`  ✗ Cloudflare refused it: ${e.message}`);
      if (fromEnv || !stdin.isTTY) process.exit(1);
      token = "";
    }
  }
}
const cfToken = await cloudflareToken();

step("Deploying the Worker");
let key = "";
const args = ["deploy"];
if (SERVER_HOSTS) args.push("--var", `SERVER_HOSTS:${SERVER_HOSTS}`);
// The server routes a site of its own account to itself by name, and one of another account to the relay it puts there.
if (accountId) args.push("--var", `CF_ACCOUNT_ID:${accountId}`, "--var", `SCRIPT_NAME:${SCRIPT}`);
let secretsDir = "";
const newSecrets = {};
if (!hasKey) {
  key = "umapp_" + randomBytes(24).toString("base64url");
  newSecrets.API_KEY = key;
}
if (cfToken) newSecrets.CF_API_TOKEN = cfToken;
if (Object.keys(newSecrets).length) {
  // Secrets left out of the file stay as they are.
  secretsDir = mkdtempSync(join(tmpdir(), "umapp-"));
  const file = join(secretsDir, "secrets.json");
  writeFileSync(file, JSON.stringify(newSecrets), { mode: 0o600 });
  args.push("--secrets-file", file);
}
let deployed;
try {
  deployed = run(args, { capture: true });
} finally {
  if (secretsDir) rmSync(secretsDir, { recursive: true, force: true });
}
process.stdout.write(deployed.stdout);

const url = deployed.stdout.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];

// The key is shown before the sites are asked about, so stopping there, with Control-C or otherwise, never loses it: Cloudflare shows it no one again.
console.log("\n✓ Deployed. Connect Umapp with:\n");
console.log(`  API endpoint  ${url ? url + "/api" : "your Worker's address, followed by /api"}`);
if (key) {
  console.log(`  API key       ${key}`);
  console.log("\n  Keep the key: Cloudflare stores it as a secret and shows it to no one, this script included. To replace it, run `npx wrangler secret put API_KEY` in apps/server.");
} else {
  console.log("  API key       the one set before; `npx wrangler secret put API_KEY` in apps/server replaces it.");
}

/** pages is every result of a paged list of the Cloudflare API. */
async function pages(headers, path, query) {
  const results = [];
  for (let page = 1; ; page++) {
    const json = await api(headers, "GET", path, { query: { ...query, page } });
    results.push(...(json.result ?? []));
    if (!json.result?.length || !hasMorePages(json.result_info)) break;
  }
  return results;
}

/** listZones is the account's active zones, and the others with their status. */
async function listZones(headers, accountId) {
  const results = await pages(headers, "/zones", { "account.id": accountId, per_page: 50 });
  return { zones: parseZones(results), inactive: inactiveZones(results) };
}

/** listRoutes maps each zone's id to its Worker routes, ten zones at a time. */
async function listRoutes(headers, zones) {
  const routes = new Map();
  for (let i = 0; i < zones.length; i += 10) {
    await Promise.all(
      zones.slice(i, i + 10).map(async (z) => {
        routes.set(z.id, parseRoutes((await api(headers, "GET", `/zones/${z.id}/workers/routes`)).result));
      }),
    );
  }
  return routes;
}

/** chooseSites is the sites to track, from UMAPP_SITES or the terminal, or null to leave them as they are. */
async function chooseSites(sites, zones, routesByZone, options) {
  const fromEnv = process.env.UMAPP_SITES?.trim();
  if (fromEnv) {
    const choice = parseSelection(fromEnv, sites, zones, routesByZone, SCRIPT, options);
    if (choice.error) {
      console.error(`  UMAPP_SITES: ${choice.error} Sites are left as they are.`);
      process.exitCode = 1;
      return null;
    }
    return choice.sites;
  }
  if (!stdin.isTTY) {
    console.log("  Sites are left as they are. To choose them without a terminal, set UMAPP_SITES to their hostnames separated by commas, or to all or none.");
    return null;
  }
  const tracked = sites.flatMap((s, i) => (s.tracked ? [i + 1] : []));
  const keeps = tracked.length ? `the tracked ones (${tracked.join(", ")})` : "none";
  for (;;) {
    const answer = await ask(`\n  Sites to track: numbers such as 1,3, hostnames inside these zones such as blog.${zones[0].name}, all, or none. Enter keeps ${keeps}: `);
    const choice = parseSelection(answer, sites, zones, routesByZone, SCRIPT, options);
    if (choice.error) {
      console.log(`  ${choice.error}`);
      continue;
    }
    const kept = new Set(choice.sites.map((s) => s.domain));
    const dropped = sites.filter((s) => s.tracked && !kept.has(s.domain)).map((s) => s.domain);
    if (dropped.length && !(await confirm(`  Stop tracking ${dropped.join(", ")}? Their websites and data stay.`, false))) continue;
    return choice.sites;
  }
}

/** trackSites offers the account's sites and brings the chosen ones' traffic through the Worker, returning each site with what it is now, or null when the sites could not be read. */
async function trackSites() {
  step("Tracking the account's sites");
  if (!accountId) {
    console.log("  This login sees no Cloudflare account, so sites are left as they are. Sign in with `npx wrangler login` as a user of the account the sites are in, or set CLOUDFLARE_ACCOUNT_ID to it.");
    return null;
  }
  const { headers } = auth;
  const { zones, inactive } = await listZones(headers, accountId);
  const waiting = inactive.map((z) => `  Not offered: ${describeInactive(z)}.`).join("\n");
  if (!zones.length) {
    // A token without Zone Read sees no zone at all, which looks just like an account without any.
    const why = auth.type === "oauth" ? "This account has no active zones to track." : "This API token sees no active zone of the account: it has none, or the token lacks Zone Read.";
    console.log(`  ${why}${waiting ? "\n" + waiting : ""}`);
    if (auth.type !== "oauth") console.log(`  ${permissionAdvice(403)}`);
    const wanted = process.env.UMAPP_SITES?.trim().toLowerCase();
    if (wanted && wanted !== "none") {
      console.error(`  ✗ UMAPP_SITES asks for sites, and none can be tracked.`);
      process.exitCode = 1;
    }
    return [];
  }
  const routesByZone = await listRoutes(headers, zones);
  const ownHosts = SERVER_HOSTS ? SERVER_HOSTS.split(",") : [];
  // A site counts as tracked only while its website is there: one deleted in Umapp isn't kept, so its routes go.
  const rows = d1("SELECT id, domain, auto_track FROM website");
  const websites = new Set(rows.filter((r) => typeof r.domain === "string").map((r) => normalizeDomain(r.domain)));
  const sites = listSites(zones, routesByZone, SCRIPT, ownHosts, websites);

  console.log(
    [
      "  Umapp can count the visitors of this account's sites with no code to add. For a tracked site:",
      "  - the Worker receives each of its requests, images and scripts included, passes it to the site unchanged, and adds the tracker to its pages;",
      "  - only hostnames Cloudflare proxies (the orange cloud) pass through the Worker;",
      "  - each request counts against the account's Workers requests, 100,000 a day on the free plan;",
      "  - should the Worker fail, the request goes on to the site as if it weren't there;",
      "  - on the free plan, once the day's requests are used up, tracked sites answer with Cloudflare's error 1027 until the next day. To let them through instead, set the request limit failure mode to Fail open on the zone's Workers Routes page in the dashboard.",
      "",
    ].join("\n"),
  );
  const width = Math.max(...sites.map((s) => s.domain.length));
  sites.forEach((s, i) => {
    const mark = s.unavailable ? `unavailable: ${s.unavailable}` : s.tracked ? "tracked" : s.orphaned ? "its website was deleted in Umapp: its routes go unless chosen again" : "";
    console.log(`  ${String(i + 1).padStart(String(sites.length).length)}. ${s.domain.padEnd(width)}  ${mark}`.trimEnd());
  });
  if (waiting) console.log(waiting);

  const chosen = await chooseSites(sites, zones, routesByZone, { inactive, ownHosts, websites });
  if (!chosen) return sites.map((s) => ({ site: s, state: s.unavailable ? `unavailable: ${s.unavailable}` : s.tracked ? "tracked" : "" }));
  const all = [...sites, ...chosen.filter((c) => !sites.some((s) => s.domain === c.domain))];
  const plan = planRoutes(sites, chosen);

  // The websites first, so a route that starts bringing traffic finds its site.
  const plannedWebsites = planWebsites(chosen.map((s) => s.domain), rows);
  for (const domain of plannedWebsites.insert) {
    d1(insertWebsiteSql(randomUUID(), domain, Date.now()));
    console.log(`  + website ${domain}`);
  }
  for (const w of plannedWebsites.update) {
    d1(updateWebsiteSql(w.id, w.domain));
    console.log(`  ~ website ${w.from} is now ${w.domain}, as the Worker looks it up`);
  }

  const failed = new Map();
  const added = new Set();
  const removed = new Set();
  for (const r of plan.add) {
    try {
      await api(headers, "POST", `/zones/${r.zoneId}/workers/routes`, { body: { pattern: r.pattern, script: SCRIPT } });
      added.add(r.pattern);
      console.log(`  + route ${r.pattern}`);
    } catch (e) {
      failed.set(r.pattern, e);
    }
  }
  for (const r of plan.remove) {
    try {
      await api(headers, "DELETE", `/zones/${r.zoneId}/workers/routes/${r.id}`);
      removed.add(r.pattern);
      console.log(`  - route ${r.pattern}`);
    } catch (e) {
      failed.set(r.pattern, e);
    }
  }
  for (const [pattern, e] of failed) console.error(`  ✗ route ${pattern}: ${e.message}`);
  const advice = [...failed.values()].find((e) => e.advice)?.advice;
  if (advice) console.error(`  ${advice}`);
  if (failed.size) process.exitCode = 1;

  const owned = all.map((s) => ({ site: s, patterns: s.patterns.filter((p) => (p.route && !removed.has(p.route.pattern)) || added.has(p.pattern)) }));
  // Umapp shows the tracker to embed only for websites the Worker doesn't track.
  d1(autoTrackSql([...owned.filter((o) => o.patterns.length).map((o) => o.site.domain), ...trackedElsewhere(rows, zones)]));
  return owned.map(({ site: s, patterns }) => {
    const skipped = plan.skip.filter((k) => k.domain === s.domain).map((k) => `without ${k.pattern}, as ${k.reason}`);
    const missing = s.patterns.filter((p) => failed.has(p.pattern)).map((p) => `${p.pattern} failed`);
    let state = "";
    if (patterns.length) state = s.tracked ? "tracked" : "tracked from now on";
    else if (s.tracked) state = "no longer tracked; its website and data stay";
    else if (s.orphaned) state = "no longer routed, as its website was deleted";
    else if (s.unavailable) state = `unavailable: ${s.unavailable}`;
    return { site: s, state: [state, ...skipped, ...missing].filter(Boolean).join("; ") };
  });
}

let siteStates = null;
try {
  siteStates = await trackSites();
} catch (e) {
  // The Worker is deployed whatever happens to its sites, and the endpoint and key above are already shown.
  console.error(`  ✗ Setting up the sites stopped partway: ${e.message}${e.advice ? "\n  " + e.advice : ""}`);
  console.error("  Some websites or routes may already be changed. Run `npm run deploy` again to finish: it starts from what is there now.");
  process.exitCode = 1;
}

if (siteStates?.length) {
  console.log("\n  Sites:");
  const width = Math.max(...siteStates.map((t) => t.site.domain.length));
  for (const t of siteStates) console.log(`  ${t.site.domain.padEnd(width)}  ${t.state || "not tracked"}`);
}

/** appRunning tells whether Umapp is open on this Mac, as its bundle or as a build run without one. */
function appRunning() {
  const bundle = spawnSync("osascript", ["-e", `application id "${BUNDLE_ID}" is running`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 });
  if (bundle.status === 0 && bundle.stdout.trim() === "true") return true;
  return spawnSync("pgrep", ["-ix", "umapp"], { stdio: "ignore", timeout: 10_000 }).status === 0;
}

/** connectApp puts the endpoint and the new key where Umapp on this Mac reads them: the key in the login keychain as the app keeps it, and the endpoint in its config.json, keeping its other settings. Umapp must be closed meanwhile: an open one keeps the settings it read and would write its old endpoint back over the new one the next time a setting changes. */
async function connectApp(endpoint) {
  if (process.platform !== "darwin") return;
  if (!key) {
    console.log("\n  Umapp on this Mac stays connected as it is.");
    return;
  }
  if (!endpoint || !stdin.isTTY) return;
  if (!(await confirm("\nConnect Umapp on this Mac?", true))) return;
  // Umapp fills in its settings from the link, launching first when needed, and connects once the user confirms.
  const opened = spawnSync("open", [connectLink(endpoint, key)], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", timeout: 20_000 });
  if (opened.status === 0) {
    console.log("  ✓ Umapp shows its settings with the endpoint and key filled in: check them and press Connect.");
    return;
  }
  console.log("  This Umapp doesn't take links yet, so its settings are written instead.");
  while (appRunning()) {
    await ask("  Umapp is open, and would put its old endpoint back: quit it, then press Enter. ");
  }
  const dir = join(homedir(), "Library", "Application Support", "umapp");
  const file = join(dir, "config.json");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  let merged;
  try {
    merged = mergeConfig(text, endpoint);
  } catch (e) {
    console.error(`  ✗ ${file} can't be read (${e.message}), so Umapp is left as it is; paste the endpoint and key in its settings.`);
    return;
  }
  // The key goes as an argument, with no shell, the way the app stores it.
  const account = process.env.USER || userInfo().username;
  const security = spawnSync("security", ["add-generic-password", "-U", "-a", account, "-s", KEYCHAIN_SERVICE, "-w", key], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (security.status !== 0) {
    console.error(`  ✗ The keychain refused the key, so Umapp is left as it is; paste the endpoint and key in its settings.\n${security.stderr ?? ""}`);
    return;
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, `config.json.${process.pid}.tmp`);
  writeFileSync(tmp, merged, { mode: 0o600, flag: "wx" });
  renameSync(tmp, file);
  console.log("  ✓ Umapp on this Mac is connected: open it.");
}

await connectApp(url ? url + "/api" : "");
