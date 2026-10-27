// ── launch ──
// Backend health-check supervision and silent (re)launching.
//
// Auto-starts the full agentmemory backend (REST API + iii-engine) and
// health-checks it every 60s via /agentmemory/livez (always public, no auth),
// relaunching when it is down. Transient /livez flaps are confirmed by a
// second probe before counting as down, launches are gated by a cross-instance
// lock plus a boot budget with exponential backoff, and every launch is
// silent on Windows — no window, no tab, no focus steal, at startup and on
// recovery alike.
//
// `windowsHide` alone is NOT enough: it only suppresses the direct child, and
// every hop through cmd.exe (npx's shim, `shell: true`) lets a grandchild
// allocate a NEW console, which Windows Terminal surfaces as a focus-stealing
// window. So every launch bypasses npx/cmd and spawns `node` directly on the
// resolved CLI entry (see cli-resolution.ts). The launcher's own spawn path
// stays silent; agentmemory 0.9.31+ Worker Compose may create cmd.exe/conhost
// inside its worker tree (native Windows startup is currently affected by
// rohitg00/agentmemory#1618). OpenCode's local-MCP spawns can allocate
// consoles too, so process-tree attribution matters when diagnosing.
//
// Environment variables are read at IMPORT time (matching the original
// single-file module), so they must be set before the module is loaded.

import { spawn, type ChildProcess } from "node:child_process";
import { rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveCli } from "./cli-resolution.js";

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

/** Silent launcher spawn: node → cli.mjs without an npx/cmd hop. */
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
  // then exponential steps up to LAUNCH_RETRY_BASE*8 = 12min. The startup launch
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

export function startSupervision(): void {
  if (timer) return;
  timer = setInterval(() => void checkAndRestart(), HEALTH_INTERVAL);
  timer.unref();
  void log("info", "health-check loop started");
}

export async function stopSupervision(): Promise<void> {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  await log("info", "health-check loop stopped");
}

/** Immediate health check on load; starts the backend if it is down. */
export async function ensureRunning(): Promise<void> {
  try {
    if (await isBackendDown()) launch("startup");
  } catch (err) {
    await log("error", `initial check failed: ${String(err)}`);
  }
}
