import type { Plugin } from "@opencode/plugin";
import { spawn } from "node:child_process";

// ── agentmemory-launcher ──
// Auto-starts the full agentmemory backend (REST API + iii-engine).
// Uses /agentmemory/livez (always public, no auth) for health checks.
// Health-checks every 60s and restarts the backend if it is down.
//
// OpenCode V2 plugin: the host loads the default export `{ id, setup }`.
// Supervision starts in `setup()` (V2 has no `config` hook) and the returned
// cleanup function stops the loop on plugin unload (e.g. config hot-reload).

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
const HEALTH_INTERVAL = 60_000;
const HEALTH_TIMEOUT = 2000;

let starting = false;
let checking = false;
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

function launch(): void {
  if (starting) return;
  starting = true;

  const child = spawn("npx", ["-y", "@agentmemory/agentmemory"], {
    detached: true,
    stdio: "ignore",
    shell: true,
    windowsHide: true,
    env: { ...process.env, AGENTMEMORY_TOOLS: "all" },
  });

  child.on("error", (err: NodeJS.ErrnoException) => {
    if (DEBUG) console.error("[agentmemory-launcher] spawn failed:", err.message);
    starting = false;
  });

  child.on("exit", (code) => {
    if (DEBUG) console.error(`[agentmemory-launcher] engine exited (code ${code}), will restart on next check`);
    starting = false;
  });

  child.unref();
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
