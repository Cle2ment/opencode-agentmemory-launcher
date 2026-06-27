import type { Plugin, Hooks, PluginInput, Config } from "@opencode-ai/plugin";
import { spawn } from "node:child_process";

// ── agentmemory-launcher ──
// Auto-starts the full agentmemory backend (REST API + iii-engine).
// Uses /agentmemory/livez (always public, no auth) for health checks.
// Runs once on first config load; health-checks every 60s and restarts if dead.

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
const HEALTH_INTERVAL = 60_000;
const HEALTH_TIMEOUT = 2000;

let starting = false;
let checking = false;
let timer: ReturnType<typeof setInterval> | null = null;

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

export const AgentmemoryLauncherPlugin: Plugin = async (input: PluginInput) => {
  const { client } = input;

  const log = async (level: "info" | "warn" | "error" | "debug", message: string) => {
    try {
      await client.app.log({
        body: { service: "agentmemory-launcher", level, message },
      });
    } catch {
      if (DEBUG) console.error(`[agentmemory-launcher] ${level}: ${message}`);
    }
  };

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

  return {
    config: async (_config: Config) => {
      // first call only — start the health-check loop
      if (!timer) {
        timer = setInterval(checkAndRestart, HEALTH_INTERVAL);
        timer.unref();
        await log("info", "health-check loop started");
      }

      // immediate health check on config load
      try {
        if (!(await health())) launch();
      } catch (err) {
        await log("error", `config hook check failed: ${String(err)}`);
      }
    },
    event: async ({ event }: { event: { type: string } }) => {
      // Clear timer on server instance disposal to allow clean Node process exit
      if (event.type === "server.instance.disposed" && timer) {
        clearInterval(timer);
        timer = null;
        await log("info", "health-check loop stopped (server disposed)");
      }
    },
    dispose: async () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        await log("info", "health-check loop stopped (dispose)");
      }
    },
  } as Hooks;
};
