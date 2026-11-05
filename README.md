# Agentmemory Launcher for OpenCode

> OpenCode plugin that auto-starts the [agentmemory](https://github.com/rohitg00/agentmemory) backend with health-check supervision.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Requirements

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0 for the plugin itself; agentmemory 0.9.30+ requires **Node.js ≥ 20.0.0**
- **agentmemory** backend (auto-installed via `npx @agentmemory/agentmemory` if not present)

> **V1 users:** OpenCode V1 (`opencode` 1.x) is no longer supported as of v4.0.0 — pin `opencode-agentmemory-launcher@^3` if you still need V1.

> **Note:** This plugin has only been tested on Windows 11. If you need support for other platforms, pull requests are welcome.

## What It Does

This plugin automatically starts the [agentmemory](https://github.com/rohitg00/agentmemory) backend (REST API + iii-engine) when OpenCode loads its configuration. It runs once per OpenCode process and health-checks the backend every 60 seconds, restarting it if the process dies.

## Compatibility

Built for **agentmemory 0.9.32** (iii-engine 0.25.0, Worker Compose) and backward compatible with earlier releases:

- **Auth is on by default.** agentmemory generates a secret into `~/.agentmemory/secret` on first start. The launcher only calls the always-public `/agentmemory/livez`, so it needs no secret and is unaffected. Hand-written REST calls to `:3111` now need `Authorization: Bearer $(cat ~/.agentmemory/secret)`.
- **Worker Compose readiness.** agentmemory 0.9.31+ budgets up to 120s for engine startup plus 300s for worker readiness. The launcher's 450s boot budget and cross-instance lock prevent duplicate launches during that window.
- **Windows startup is non-interactive.** agentmemory 0.9.32 skips interactive engine-setup prompts on Windows and when stdio is not a TTY, and can install its pinned Windows engine automatically. This makes it suitable for the launcher's ignored-stdio background spawn.
- **Empty console windows remain an upstream issue.** agentmemory 0.9.31 and 0.9.32 both pin iii 0.25.0, whose Windows Worker Compose can open an empty console for the engine and each worker ([iii#2430](https://github.com/iii-hq/iii/issues/2430)). The launcher cannot suppress those grandchild windows with `windowsHide`; the fix is in [iii#2437](https://github.com/iii-hq/iii/pull/2437), but it is not in the stable 0.25.0 engine used by agentmemory 0.9.32. The launcher does not pin an alpha engine or patch third-party files.
- **Engine pins are managed by agentmemory.** The launcher does not install, select, or override iii-engine. A mismatched pin exits the CLI with code 1 and is surfaced as a `warn`.
- **Newest version wins.** On Windows the launcher starts the newest agentmemory it can find in the npx cache **or a global install on `PATH`**, including global installs behind symlinked Scoop PATH entries, so `npm i -g @agentmemory/agentmemory@latest` takes effect without clearing the npx cache.

## Installation

### From npm (recommended)

Add to your OpenCode config (`plugins`, plural):

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode will automatically install the package at startup. See the [V2 plugins guide](https://opencode.ai/v2/docs/build/plugins) for more details.

## Usage

This launcher starts the agentmemory backend. To use agentmemory with OpenCode, also install the agentmemory plugin and refer to the [OpenCode agentmemory plugin usage guide](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) for setup instructions, available tools, and configuration options.

## Updating

To update agentmemory to the latest version:

```bash
npx @agentmemory/agentmemory upgrade
```

If you installed agentmemory globally, update that copy instead with `npm i -g @agentmemory/agentmemory@latest` — the launcher picks the newest version across the npx cache and global installs.

After updating, stop the running agentmemory process and clear the npx cache:

**Windows (PowerShell):**

```powershell
# Stop the agentmemory process
Get-Process -Name "node" | Where-Object {
    (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -match 'agentmemory'
} | Stop-Process -Force

# Clear the npx cache
Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory | Where-Object {
    Test-Path "$($_.FullName)\node_modules\@agentmemory"
} | Remove-Item -Recurse -Force
```

Restart OpenCode to relaunch agentmemory with the updated version.

## How It Works

1. **On load** (`setup()`): the plugin starts a health-check interval (60s)
2. **Health check**: Pings `GET /agentmemory/livez` on the backend (always public, no auth — even with agentmemory 0.9.30's auth-by-default)
3. **Auto-restart**: If the health check fails, the backend is launched.
   - **Always silent on the launcher's own spawn path** (startup and every later (re)launch from the 60s loop): on Windows the plugin resolves the **newest** `dist/cli.mjs` in the npm/npx cache or a global install on `PATH`, then executes it with the OpenCode host's own `process.execPath`. This avoids a `node` PATH lookup, shim hops, and an unnecessary npx/cmd fallback. agentmemory 0.9.31/0.9.32 can still open empty consoles inside iii 0.25.0's worker tree; that separate upstream limitation is described under **Compatibility**. Relaunches are throttled by a 450s boot budget plus a cross-instance launch lock (multiple OpenCode servers share one backend). The exponential retry backoff keeps its 90s base, producing 450s → 450s → 450s → 720s … up to 12min
4. **Debug mode**: Set `OPENCODE_AGENTMEMORY_DEBUG=1` for verbose logging
5. **Failure diagnostics**: A backend launch that exits with a non-zero code is logged at `warn` with the likely causes — a daemon already answering on the port, an enforced iii-engine pin mismatch, or a 0.9.31+ Worker Compose readiness failure. The backend runs with `stdio: "ignore"`, so for the actual error text run `npx @agentmemory/agentmemory doctor`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | Backend API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | unset | Set to `1` for debug logging |

## Troubleshooting

**The backend starts, but empty console windows appear on Windows.**
This is a known agentmemory 0.9.31/0.9.32 + iii 0.25.0 Worker Compose issue, not a launcher window. See [iii#2430](https://github.com/iii-hq/iii/issues/2430). Upgrade only when agentmemory pins a stable iii release containing [iii#2437](https://github.com/iii-hq/iii/pull/2437); forcing the alpha override is not a supported launcher configuration.

**The backend never comes up and the log shows a non-zero launch exit.**
Common causes are an enforced iii-engine pin mismatch, a stale instance still owning the port, or a 0.9.31+ Worker Compose worker failing to become ready. Run the doctor manually to see the actual error:

```bash
npx @agentmemory/agentmemory doctor
```

**On agentmemory 0.9.30, the launcher log shows `agentmemory worker did not become ready within 15s` and the launch exits with code 1.**
A stale instance from an earlier session is still holding the REST port, so the fresh CLI starts its engine but its worker registration never becomes ready — a healthy fresh start completes in ~2s. Diagnose and restart the whole chain (never kill a single worker process: it may be the active route handler, and killing it makes `/agentmemory/livez` return 404):

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**A newer agentmemory is installed but the launcher keeps running an older one.**
The launcher prefers the newest version across the npx cache and global installs; if a stale copy still wins, clear the cache:

```bash
npx clear-npx-cache
```

## API

The plugin targets the OpenCode V2 plugin API (`@opencode/plugin` >= 2.2.5). Supervision starts in `setup()` when the plugin loads, and the returned cleanup function stops the health-check loop on unload.

```typescript
import type { Plugin } from "@opencode/plugin";

const plugin: Plugin.Plugin = {
  id: "agentmemory-launcher",
  setup: async (ctx) => {
    // start supervision; return cleanup
  },
};

export default plugin;
```

## Development

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Build
npm run build

# Run tests
npm test
```

## Community

- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)

## License

[GNU Affero General Public License v3.0](./LICENSE)

## Copyright

Copyright (C) 2026 Cle2ment.
