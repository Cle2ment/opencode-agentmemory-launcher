import type { Plugin } from "@opencode/plugin";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

// ── agentmemory-launcher ──
// Auto-starts the full agentmemory backend (REST API + iii-engine).
// Uses /agentmemory/livez (always public, no auth) for health checks.
// Health-checks every 60s and restarts the backend if it is down.
//
// Windows launch is always silent — no window, no tab, no focus steal, at
// startup and on recovery alike. `windowsHide` alone is NOT enough: it only
// suppresses the direct child, and every hop through cmd.exe (npx's shim,
// `shell: true`) lets a grandchild allocate a NEW console, which Windows
// Terminal surfaces as a focus-stealing window. So every launch bypasses
// npx/cmd and spawns `node` directly on the resolved CLI entry. The launcher's
// own spawn path stays silent; agentmemory 0.9.31+ Worker Compose may create
// cmd.exe/conhost inside its worker tree (native Windows startup is currently
// affected by rohitg00/agentmemory#1618). OpenCode's local-MCP spawns can
// allocate consoles too, so process-tree attribution matters when diagnosing.
//
// OpenCode V2 plugin: the host loads the default export `{ id, setup }`.
// Supervision starts in `setup()` (V2 has no `config` hook) and the returned
// cleanup function stops the loop on plugin unload (e.g. config hot-reload).

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
const HEALTH_INTERVAL = 60_000;
const HEALTH_TIMEOUT = 2000;
// Backend boot budget: agentmemory 0.9.31 gives the CLI up to 120s for the
// engine plus 300s for worker readiness. Don't relaunch within this window
// while a normal startup is still in flight (420s + 30s margin), and don't
// treat a lock younger than this as stale.
const LAUNCH_BOOT_BUDGET = 450_000;
// Exponential backoff base across consecutive FAILED recovery attempts. The
// effective delay is max(LAUNCH_BOOT_BUDGET, LAUNCH_RETRY_BASE * 2^attempts
// capped at LAUNCH_BACKOFF_CAP): early retries are held at the boot budget
// instead of a 450s base immediately blowing up to 450/900/1800s.
const LAUNCH_RETRY_BASE = 90_000;

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
// every 90s). Multiplier cap on LAUNCH_RETRY_BASE; resets when healthy again.
const LAUNCH_BACKOFF_CAP = 8;

let checking = false;
let lastLaunchAt = 0;
let launchAttempts = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Why a launch is happening. Startup launches (backend down when the plugin
 * loads) do not count toward the failure backoff, so a failed startup is
 * first retried after the 450s boot budget. Both modes spawn identically silent.
 */
type LaunchReason = "startup" | "recovery";

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
    // Windows/Scoop: a PATH entry can be a symlinked shim dir (e.g. scoop's
    // `apps/nodejs/current/bin`) while the real global packages live at the
    // entry's realpath (`…/persist/nodejs/bin`). Scan both, deduped, so a
    // newer global install is not shadowed by a stale npx-cache copy.
    const dirs = new Set<string>([entry]);
    try {
      dirs.add(realpathSync(entry));
    } catch {
      // Unresolvable entry — the literal path is kept above.
    }
    for (const dir of dirs) {
      const pkgDirs = [
        join(dir, "node_modules", "@agentmemory", "agentmemory"),
        join(dir, "..", "lib", "node_modules", "@agentmemory", "agentmemory"),
      ];
      for (const pkgDir of pkgDirs) {
        const cand = readCliCandidate(pkgDir);
        if (cand && (!best || compareVersion(cand.version, best.version) > 0)) best = cand;
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
    if (Date.now() - statSync(LOCK_PATH).mtimeMs < LAUNCH_BOOT_BUDGET) return false;
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
        `launch process ${label} exited with code ${code} — the backend CLI exited before /agentmemory/livez came up. Likely causes: a daemon already answers on the port (agentmemory 0.9.30+ refuses to start a second instance), an enforced iii-engine version pin rejected a mismatch, or — on the 0.9.31+ Worker Compose runtime — the worker failed to become ready (native Windows is unverified upstream, see rohitg00/agentmemory#1618). A healthy 0.9.31 boot can take up to ~7 min (120s engine + 300s worker readiness) with no /livez yet; only a non-zero CLI exit like this is a failure. Run \`npx @agentmemory/agentmemory doctor\` for details.`,
      );
    } else if (DEBUG) {
      console.error(`[agentmemory-launcher] launch process ${label} exited (code ${code})`);
    }
  });
  child.unref();
}

/** Silent launch: node → cli.mjs, no console anywhere in the tree. */
function spawnSilent(cli: string, env: NodeJS.ProcessEnv, label: string): void {
  const child = spawn("node", [cli], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
  });
  child.on("error", (err) => {
    void log("warn", `direct node spawn failed (${err.message}); falling back to npx`);
    watch(spawnDirect(env), "npx spawn (fallback)");
  });
  watch(child, label);
  void log("info", `launching backend silently via ${label}`);
}

function launch(reason: LaunchReason): void {
  const now = Date.now();
  // Exponential backoff across consecutive FAILED recovery attempts: held at
  // LAUNCH_BOOT_BUDGET while 90s*2^attempts is smaller (450s, 450s, 450s),
  // then 180s-steps up to LAUNCH_RETRY_BASE*8 = 12min. The startup launch
  // does not count towards it, so the first recovery attempt is gated purely
  // by the boot budget.
  const backoff = Math.max(
    LAUNCH_BOOT_BUDGET,
    LAUNCH_RETRY_BASE * Math.min(2 ** launchAttempts, LAUNCH_BACKOFF_CAP),
  );
  if (now - lastLaunchAt < backoff) return;
  if (!acquireLaunchLock()) {
    void log("info", "another instance is launching the backend; skipping");
    return;
  }
  lastLaunchAt = now;
  if (reason === "recovery") launchAttempts++;

  const env = { ...process.env, AGENTMEMORY_TOOLS: "all" };
  // AGENTMEMORY_LAUNCHER_RESOLVE_CLI=1 forces CLI resolution on any platform
  // (test seam; production only resolves on win32).
  const resolved =
    process.platform === "win32" || process.env.AGENTMEMORY_LAUNCHER_RESOLVE_CLI === "1"
      ? resolveCli()
      : null;

  if (resolved) {
    spawnSilent(resolved.path, env, `${resolved.version} (${resolved.path})`);
    return;
  }

  if (process.platform === "win32") {
    void log("info", "agentmemory not found in the npm/npx cache or on PATH; falling back to npx spawn");
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
      launch("recovery");
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
    if (await isBackendDown()) launch("startup");
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
