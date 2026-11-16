// Deploys the server to the Cloudflare account Wrangler is signed in to, signing in first if it is not and asking which account when there are several, unless CLOUDFLARE_ACCOUNT_ID says: creates the D1 database the first time, applies its migrations, and deploys the Worker, with a new API key when it has none. It prints the endpoint and, when it made one, the key to connect Umapp with. Running it again deploys the current code and keeps the database and the key.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// DATABASE is wrangler.jsonc's database_name.
const DATABASE = "umapp";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPackage = createRequire(import.meta.url).resolve("wrangler/package.json");
const wrangler = join(dirname(wranglerPackage), JSON.parse(readFileSync(wranglerPackage, "utf8")).bin.wrangler);

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

step("Deploying the Worker");
const secrets = run(["secret", "list", "--format", "json"], { capture: true, check: false });
const hasKey = secrets.status === 0 && jsonArray(secrets.stdout).some((s) => s.name === "API_KEY");
let key = "";
const args = ["deploy"];
let secretsDir = "";
if (!hasKey) {
  key = "umapp_" + randomBytes(24).toString("base64url");
  secretsDir = mkdtempSync(join(tmpdir(), "umapp-"));
  const file = join(secretsDir, "secrets.json");
  writeFileSync(file, JSON.stringify({ API_KEY: key }), { mode: 0o600 });
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
console.log("\n✓ Deployed. Connect Umapp with:\n");
console.log(`  API endpoint  ${url ? url + "/api" : "your Worker's address, followed by /api"}`);
if (key) {
  console.log(`  API key       ${key}`);
  console.log("\n  Keep the key: Cloudflare stores it as a secret and shows it to no one, this script included. To replace it, run `npx wrangler secret put API_KEY` in apps/server.");
} else {
  console.log("  API key       the one set before; `npx wrangler secret put API_KEY` in apps/server replaces it.");
}
