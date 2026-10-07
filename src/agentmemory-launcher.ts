import type { Plugin } from "@opencode/plugin";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

// ── agentmemory-launcher ──
// Auto-starts the full agentmemory backend (REST API + iii-engine).
// Uses /agentmemory/livez (always public, no auth) for health checks.
// Health-checks every 60s and restarts the backend if it is down.
//
// Windows: the launch must not create any console window. `windowsHide` alone
// is NOT enough — it only suppresses the console of the direct child, while
// every hop through cmd.exe (npx's shim, `shell: true`) lets a grandchild
// allocate a NEW console, which Windows Terminal surfaces as a focus-stealing
// tab. So on Windows we bypass npx/cmd entirely and spawn `node` directly on
// the agentmemory CLI entry resolved from the npx cache. The resulting tree
// (node → cli.mjs → iii.exe) never touches cmd.exe and never owns a console:
// the CLI spawns iii-engine with `windowsHide` itself, and console-less Node
// children do not allocate one.
//
// OpenCode V2 plugin: the host loads the default export `{ id, setup }`.
// Supervision starts in `setup()` (V2 has no `config` hook) and the returned
// cleanup function stops the loop on plugin unload (e.g. config hot-reload).

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
const HEALTH_INTERVAL = 60_000;
const HEALTH_TIMEOUT = 2000;
// Backend boot budget: CLI startup + engine start takes 15-30s. Don't
// relaunch within this window while waiting for /livez to come up.
const LAUNCH_GRACE = 90_000;

const NPM_PACKAGE = "@agentmemory/agentmemory";
// Cross-instance launch lock: multiple OpenCode servers each run this plugin,
// and concurrent launches race on the engine port and can keep killing each
// other's backend. The lock self-expires via staleness (no deletion needed).
const LOCK_PATH = join(tmpdir(), "agentmemory-launcher.lock");
// Transient /livez flaps (engine GC pause, brief load) must not trigger a
// launch: a spurious CLI attaches to the still-alive engine and stays as a
// permanent duplicate worker (~one extra node process per flap). Re-check
// once after this delay before launching.
const CONFIRM_RECHECK = 3_000;
// While the backend stays down, back off exponentially between launch
// attempts (hard failures like port theft otherwise churn npx/node processes
// every 90s). Multiplier cap on LAUNCH_GRACE; resets when healthy again.
const LAUNCH_BACKOFF_CAP = 8;

let checking = false;
let lastLaunchAt = 0;
let launchAttempts = 0;
let timer: ReturnType<typeof setInterval> | null = null;

type Level = "info" | "warn" | "error" | "debug";

// V2 has no `client.app.log` equivalent — warn/error go to stderr
// unconditionally, info/debug only in debug mode to keep normal startup quiet.
async function log(level: Level, message: string): Promise<void> {
  if ((level === "info" || level === "debug") && !DEBUG) return;
  console.error(`[agentmemory-launcher] ${level}: ${message}`);
}

async function health(): Promise<boolean> {
  try {
    // /livez is always public and unauthenticated. As of agentmemory 0.9.30 a
    // secret is ALWAYS generated into ~/.agentmemory/secret on first start when
    // AGENTMEMORY_SECRET is unset, so /agentmemory/health is now ALWAYS
    // authenticated. Keep using /livez; never switch to /health.
    const res = await fetch(`${API}/agentmemory/livez`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Legacy spawn via npx. On Windows every cmd.exe hop can allocate a console. */
function spawnDirect(env: NodeJS.ProcessEnv): ChildProcess {
  return spawn("npx", ["-y", NPM_PACKAGE], {
    detached: true,
    stdio: "ignore",
    shell: true,
    windowsHide: true,
    env,
  });
}

/**
 * Read a candidate agentmemory installation from a package directory:
 * parse `<pkgDir>/package.json`, resolve the `bin` entry (key `"agentmemory"`
 * when `bin` is an object), and return `{ path, version }` only when the CLI
 * file exists. Returns null on any missing file or parse/IO error.
 */
function readCliCandidate(pkgDir: string): { path: string; version: string } | null {
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
      version?: string;
      bin?: string | Record<string, string>;
    };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["agentmemory"];
    if (!pkg.version || !bin) return null;
    const cliPath = join(pkgDir, bin);
    if (!existsSync(cliPath)) return null;
    return { path: cliPath, version: pkg.version };
  } catch {
    return null;
  }
}

/**
 * Candidate npm cache directories (`<cache>/_npx` holds npx's installs).
 * The cache is not always `%LOCALAPPDATA%/npm-cache`: it can be redirected via
 * `npm_config_cache` or a `cache=` line in `~/.npmrc`, and portable installs
 * (e.g. scoop) keep it beside the node bin dir that is on PATH
 * (`<persist>/nodejs/bin` → `<persist>/nodejs/cache`).
 */
function npxCacheRoots(): string[] {
  const roots = new Set<string>();
  const add = (base: string | undefined): void => {
    if (!base) return;
    const clean = base.trim().replace(/^"(.*)"$/, "$1");
    if (!clean) return;
    const expanded = clean.startsWith("~") ? join(homedir(), clean.slice(1)) : clean;
    roots.add(join(expanded, "_npx"));
  };
  add(process.env.npm_config_cache);
  if (process.env.LOCALAPPDATA) add(join(process.env.LOCALAPPDATA, "npm-cache"));
  try {
    const match = readFileSync(join(homedir(), ".npmrc"), "utf-8").match(/^\s*cache\s*=\s*(.+?)\s*$/m);
    if (match) add(match[1]);
  } catch {
    // No user-level .npmrc.
  }
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    if (entry) add(join(entry, "..", "cache"));
  }
  return [...roots];
}

/**
 * Resolve the newest agentmemory CLI entry from the npm/npx cache across every
 * candidate cache root (see `npxCacheRoots`). Picks the highest cached
 * version. Returns null when the package has never been npx-cached.
 */
function resolveCliFromNpxCache(): { path: string; version: string } | null {
  let best: { path: string; version: string } | null = null;
  for (const cacheRoot of npxCacheRoots()) {
    let entries: string[];
    try {
      entries = readdirSync(cacheRoot);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgDir = join(cacheRoot, entry, "node_modules", "@agentmemory", "agentmemory");
      const cand = readCliCandidate(pkgDir);
      if (cand && (!best || compareVersion(cand.version, best.version) > 0)) best = cand;
    }
  }
  return best;
}

/**
 * Resolve the newest agentmemory CLI entry installed GLOBALLY (npm i -g,
 * scoop, …) by scanning PATH. For each PATH directory D we check the standard
 * npm global bin layout (`D/node_modules/...`) and the prefix layout
 * (`D/../lib/node_modules/...`). Returns the highest-version candidate.
 */
function resolveCliFromPath(): { path: string; version: string } | null {
  const pathEnv = process.env.PATH;
  if (!pathEnv) return null;
  let best: { path: string; version: string } | null = null;
  for (const entry of pathEnv.split(delimiter)) {
    if (!entry) continue;
    const pkgDirs = [
      join(entry, "node_modules", "@agentmemory", "agentmemory"),
      join(entry, "..", "lib", "node_modules", "@agentmemory", "agentmemory"),
    ];
    for (const pkgDir of pkgDirs) {
      try {
        const cand = readCliCandidate(pkgDir);
        if (cand && (!best || compareVersion(cand.version, best.version) > 0)) best = cand;
      } catch {
        continue;
      }
    }
  }
  return best;
}

/**
 * Resolve the newest agentmemory CLI across the npx cache and any global
 * install on PATH. Ties keep the first found (npx cache first).
 */
function resolveCli(): { path: string; version: string } | null {
  const candidates = [resolveCliFromNpxCache(), resolveCliFromPath()].filter(
    (c): c is { path: string; version: string } => c !== null,
  );
  let best: { path: string; version: string } | null = null;
  for (const cand of candidates) {
    if (!best || compareVersion(cand.version, best.version) > 0) best = cand;
  }
  return best;
}

function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/** Cross-instance, self-expiring launch lock. */
function acquireLaunchLock(): boolean {
  try {
    if (Date.now() - statSync(LOCK_PATH).mtimeMs < LAUNCH_GRACE) return false;
    // Stale lock from a previous attempt — remove and re-acquire below.
    rmSync(LOCK_PATH, { force: true });
  } catch {
    // No lock file — free.
  }
  try {
    writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false; // Another instance beat us to it.
  }
}

function watch(child: ChildProcess, label: string): void {
  child.on("exit", (code) => {
    if (code !== 0) {
      void log(
        "warn",
        `launch process ${label} exited with code ${code} — the backend CLI exited before /agentmemory/livez came up. Run it manually (or \`npx @agentmemory/agentmemory doctor\`) to see the error; agentmemory 0.9.30 requires iii-engine 0.22.1 and rejects a mismatched pin with exit code 1.`,
      );
    } else if (DEBUG) {
      console.error(`[agentmemory-launcher] launch process ${label} exited (code ${code})`);
    }
  });
  child.unref();
}

function launch(): void {
  const now = Date.now();
  // Exponential backoff across consecutive failed attempts (90s, 180s, …,
  // capped at 12min). A real crash still retries immediately on first detection.
  const backoff = LAUNCH_GRACE * Math.min(2 ** launchAttempts, LAUNCH_BACKOFF_CAP);
  if (now - lastLaunchAt < backoff) return;
  if (!acquireLaunchLock()) {
    void log("info", "another instance is launching the backend; skipping");
    return;
  }
  lastLaunchAt = now;
  launchAttempts++;

  const env = { ...process.env, AGENTMEMORY_TOOLS: "all" };

  if (process.platform === "win32") {
    const resolved = resolveCli();
    if (resolved) {
      // Console-free path: node → cli.mjs, no cmd.exe anywhere in the tree.
      const child = spawn("node", [resolved.path], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env,
      });
      child.on("error", (err) => {
        void log("warn", `direct node spawn failed (${err.message}); falling back to npx`);
        watch(spawnDirect(env), "npx spawn (fallback)");
      });
      watch(child, `${resolved.version} (${resolved.path})`);
      void log("info", `launching backend via ${resolved.version} (${resolved.path})`);
      return;
    }
    void log("info", "agentmemory not found in npx cache or on PATH; falling back to npx spawn");
  }

  const child = spawnDirect(env);
  child.on("error", (err) => void log("warn", `spawn failed: ${err.message}`));
  watch(child, "npx spawn");
}

/** Two consecutive failed probes = backend down (filters transient flaps). */
async function isBackendDown(): Promise<boolean> {
  if (await health()) return false;
  await new Promise<void>((resolve) => setTimeout(resolve, CONFIRM_RECHECK));
  return !(await health());
}

async function checkAndRestart(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    if (await isBackendDown()) {
      launch();
    } else {
      launchAttempts = 0;
    }
  } catch (err) {
    await log("error", `health check failed: ${String(err)}`);
  } finally {
    checking = false;
  }
}

function startSupervision(): void {
  if (timer) return;
  timer = setInterval(() => void checkAndRestart(), HEALTH_INTERVAL);
  timer.unref();
  void log("info", "health-check loop started");
}

async function stopSupervision(): Promise<void> {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  await log("info", "health-check loop stopped");
}

/** Immediate health check on load; starts the backend if it is down. */
async function ensureRunning(): Promise<void> {
  try {
    if (await isBackendDown()) launch();
  } catch (err) {
    await log("error", `initial check failed: ${String(err)}`);
  }
}

// The SDK's root entry exposes `Plugin` as a namespace (`export * as Plugin`),
// so the module interface is referenced as `Plugin.Plugin`.
const plugin: Plugin.Plugin = {
  id: "agentmemory-launcher",
  setup: async () => {
    startSupervision();
    await ensureRunning();
    // V2 calls the returned cleanup on plugin unload.
    return () => {
      void stopSupervision();
    };
  },
};

export default plugin;
