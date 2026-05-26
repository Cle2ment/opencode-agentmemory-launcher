import type { Plugin } from "@opencode-ai/plugin";
import { spawn } from "node:child_process";

// ── agentmemory-launcher ──
// Auto-starts the full agentmemory backend (REST API + iii-engine)
// so that the MCP shim and capture plugin can proxy to it.
// Runs once on first config load; health-checks every 60s and restarts if dead.

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";

let starting = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/agentmemory/health`, {
      signal: AbortSignal.timeout(2000),
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

export const AgentmemoryLauncherPlugin: Plugin = async () => ({
  config: async () => {
    // first call only — start the health-check loop (runs once per OpenCode process)
    if (!timer) {
      timer = setInterval(async () => {
        if (!(await health())) launch();
      }, 60_000);
    }

    if (!(await health())) launch();
  },
});
