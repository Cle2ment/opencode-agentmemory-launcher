import type { Plugin, PluginModule, Hooks, PluginInput, Config } from "@opencode-ai/plugin";
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── agentmemory-launcher ──
// Auto-starts the full agentmemory backend (REST API + iii-engine).
// Uses /agentmemory/livez (always public, no auth) for health checks.
// Health-checks every 60s and restarts the backend if it is down.
// Backend output is captured to ~/.agentmemory/agentmemory.log
// (truncated on every start); view it with the `agentmemory-logs` CLI.
//
// Dual-track plugin: a single default export serves both OpenCode hosts.
//   OpenCode V1 (`opencode`):  reads `server` -> V1 Hooks (config/event/dispose)
//   OpenCode V2 (`opencode2`): reads `setup`  -> cleanup function
// Each host's loader decodes only its own key and tolerates the other,
// so `{ id, server, setup }` loads on both (see AGENTS.md "Dual-Track Plugin API").

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
const HEALTH_INTERVAL = 60_000;
const HEALTH_TIMEOUT = 2000;

const AGENTMEMORY_DIR = join(homedir(), ".agentmemory");
/** Backend stdout/stderr capture, truncated on every backend start. */
export const AGENTMEMORY_LOG_PATH = join(AGENTMEMORY_DIR, "agentmemory.log");

let starting = false;
let checking = false;
let timer: ReturnType<typeof setInterval> | null = null;

type Level = "info" | "warn" | "error" | "debug";
type LogFn = (level: Level, message: string) => Promise<void>;

// V2 has no `client.app.log` equivalent — warn/error go to stderr unconditionally,
// info/debug only in debug mode to keep normal startup quiet.
const consoleLog: LogFn = async (level, message) => {
  if ((level === "info" || level === "debug") && !DEBUG) return;
  console.error(`[agentmemory-launcher] ${level}: ${message}`);
};

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

  // Capture backend output to a log file (truncated on every start so the file
  // cannot grow unbounded). If the directory is unwritable, fall back to
  // `stdio: "ignore"` — supervision must keep working without the log.
  let logFd: number | null = null;
  try {
    mkdirSync(AGENTMEMORY_DIR, { recursive: true });
    logFd = openSync(AGENTMEMORY_LOG_PATH, "w");
  } catch {
    logFd = null;
  }

  try {
    const child = spawn("npx", ["-y", "@agentmemory/agentmemory"], {
      // Windows: do NOT use `detached: true` — a detached cmd.exe has no console,
      // so Windows allocates a NEW VISIBLE console window for the first console-app
      // grandchild (npx/node), popping a foreground terminal tab. With
      // windowsHide:true and detached:false, cmd gets a hidden console that all
      // descendants attach to: startup stays silent.
      stdio: logFd === null ? "ignore" : ["ignore", logFd, logFd],
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
  } catch (err) {
    starting = false;
    if (DEBUG) console.error("[agentmemory-launcher] launch failed:", String(err));
  } finally {
    // The child duplicated the handles at spawn time; close the parent copy.
    if (logFd !== null) closeSync(logFd);
  }
}

async function checkAndRestart(log: LogFn): Promise<void> {
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

function startSupervision(log: LogFn): void {
  if (timer) return;
  timer = setInterval(() => void checkAndRestart(log), HEALTH_INTERVAL);
  timer.unref();
  void log("info", "health-check loop started");
}

async function stopSupervision(log: LogFn): Promise<void> {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  await log("info", "health-check loop stopped");
}

/** Immediate health check on load; starts the backend if it is down. */
async function ensureRunning(log: LogFn): Promise<void> {
  try {
    if (!(await health())) launch();
  } catch (err) {
    await log("error", `initial check failed: ${String(err)}`);
  }
}

// ── OpenCode V1 plugin ──
// The V1 host imports the package entrypoint and calls `default.server(input)`.
export const AgentmemoryLauncherPlugin: Plugin = async (input: PluginInput) => {
  const { client } = input;

  const log: LogFn = async (level, message) => {
    try {
      await client.app.log({
        body: { service: "agentmemory-launcher", level, message },
      });
    } catch {
      if (DEBUG) console.error(`[agentmemory-launcher] ${level}: ${message}`);
    }
  };

  return {
    config: async (_config: Config) => {
      // first call only — start the health-check loop
      startSupervision(log);
      // immediate health check on config load
      await ensureRunning(log);
    },
    event: async ({ event }: { event: { type: string } }) => {
      // Clear timer on server instance disposal to allow clean Node process exit
      if (event.type === "server.instance.disposed") await stopSupervision(log);
    },
    dispose: async () => {
      await stopSupervision(log);
    },
  } as Hooks;
};

// ── OpenCode V2 plugin ──
// Structural types kept local: the V2 plugin SDK (0.0.0-beta-*) cannot coexist
// with this package's ^1.x `@opencode-ai/plugin` dependency, and the V2 host
// only decodes the shape at runtime anyway.
interface V2PluginContext {
  readonly options: Readonly<Record<string, unknown>>;
}
type V2Cleanup = () => void | Promise<void>;
interface V2Plugin {
  readonly id: string;
  readonly setup: (context: V2PluginContext) => V2Cleanup | Promise<V2Cleanup | void> | void;
}

const setupV2: V2Plugin["setup"] = async (_context: V2PluginContext) => {
  // V2 has no `config` hook; `setup` runs once when the plugin loads.
  startSupervision(consoleLog);
  await ensureRunning(consoleLog);
  // V2 replaces `dispose`/`server.instance.disposed` with a returned cleanup.
  return () => {
    void stopSupervision(consoleLog);
  };
};

// ── Combined dual-track default export ──
// V1 host: `default.server(input)` -> V1 Hooks; V2 host: `default.setup(ctx)` -> cleanup.
const pluginModule: PluginModule & V2Plugin = {
  id: "agentmemory-launcher",
  server: AgentmemoryLauncherPlugin,
  setup: setupV2,
};

export default pluginModule;
