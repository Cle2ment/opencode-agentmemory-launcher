// ── agentmemory-launcher (entry) ──
// OpenCode V2 plugin entrypoint. The host loads the default export
// `{ id, setup }`; supervision starts in `setup()` (V2 has no `config` hook)
// and the returned cleanup function stops the loop on plugin unload (e.g.
// config hot-reload). All behavior lives in launch.ts (supervision and
// launching) and cli-resolution.ts (finding the newest CLI entry); this
// module only wires them together.

import type { Plugin } from "@opencode/plugin";

import { ensureRunning, startSupervision, stopSupervision } from "./launch.js";

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
