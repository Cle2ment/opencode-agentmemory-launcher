import type { Plugin } from "@opencode/plugin";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

let checking = false;
let lastLaunchAt = 0;
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
    // /livez is always public (no auth), unlike /health which requires
    // AGENTMEMORY_SECRET when set. See agentmemory src/triggers/api.ts.
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
 * Resolve the agentmemory CLI entry from the npx cache
 * (%LOCALAPPDATA%/npm-cache/_npx/<hash>/node_modules/@agentmemory/agentmemory).
 * Picks the highest cached version. Returns null when the package has never
 * been npx-cached (caller falls back to the legacy npx spawn, which then
 * populates the cache for the next launch).
 */
function resolveCliFromNpxCache(): string | null {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  const cacheRoot = join(local, "npm-cache", "_npx");
  let entries: string[];
  try {
    entries = readdirSync(cacheRoot);
  } catch {
    return null;
  }
  let best: { path: string; version: string } | null = null;
  for (const entry of entries) {
    const pkgDir = join(cacheRoot, entry, "node_modules", "@agentmemory", "agentmemory");
    const pkgJsonPath = join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
        version?: string;
        bin?: string | Record<string, string>;
      };
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["agentmemory"];
      if (!pkg.version || !bin) continue;
      const cliPath = join(pkgDir, bin);
      if (!existsSync(cliPath)) continue;
      if (!best || compareVersion(pkg.version, best.version) > 0) best = { path: cliPath, version: pkg.version };
    } catch {
      continue;
    }
  }
  return best?.path ?? null;
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

function watch(child: ChildProcess): void {
  child.on("exit", (code) => {
    if (DEBUG) console.error(`[agentmemory-launcher] launch process exited (code ${code})`);
  });
  child.unref();
}

function launch(): void {
  const now = Date.now();
  if (now - lastLaunchAt < LAUNCH_GRACE) return;
  if (!acquireLaunchLock()) {
    void log("info", "another instance is launching the backend; skipping");
    return;
  }
  lastLaunchAt = now;

  const env = { ...process.env, AGENTMEMORY_TOOLS: "all" };

  if (process.platform === "win32") {
    const cli = resolveCliFromNpxCache();
    if (cli) {
      // Console-free path: node → cli.mjs, no cmd.exe anywhere in the tree.
      const child = spawn("node", [cli], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env,
      });
      child.on("error", (err) => {
        void log("warn", `direct node spawn failed (${err.message}); falling back to npx`);
        watch(spawnDirect(env));
      });
      watch(child);
      void log("info", `launching backend via ${cli}`);
      return;
    }
    void log("info", "agentmemory not found in npx cache; falling back to npx spawn");
  }

  const child = spawnDirect(env);
  child.on("error", (err) => void log("warn", `spawn failed: ${err.message}`));
  watch(child);
}

async function checkAndRestart(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    if (!(await health())) launch();
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
    if (!(await health())) launch();
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
