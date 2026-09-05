# Agentmemory Launcher for OpenCode

> OpenCode plugin that auto-starts the [agentmemory](https://github.com/rohitg00/agentmemory) backend with health-check supervision.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Requirements

- **Node.js** ≥ 18.0.0
- **OpenCode V1** (`opencode` ≥ 1.17.10) or **OpenCode V2** (`opencode2`) — the same package serves both hosts
- **agentmemory** backend (auto-installed via `npx @agentmemory/agentmemory` if not present)

> **Note:** This plugin has only been tested on Windows 11. If you need support for other platforms, pull requests are welcome.

## What It Does

This plugin automatically starts the [agentmemory](https://github.com/rohitg00/agentmemory) backend (REST API + iii-engine) when OpenCode loads its configuration. It runs once per OpenCode process and health-checks the backend every 60 seconds, restarting it if the process dies.

## Installation

### From npm (recommended)

**OpenCode V1** — add to your `opencode.json` (`plugin`, singular):

```jsonc
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

**OpenCode V2** — add to your config (`plugins`, plural):

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode will automatically install the package at startup. See the [V1 plugins documentation](https://opencode.ai/docs/en/plugins/) or the [V2 plugins guide](https://opencode.ai/v2/docs/build/plugins) for more details.

The same package runs on both hosts through a combined default export: V1 calls `server()`, V2 calls `setup()`.

### From local file

Place the plugin file in `.opencode/plugins/`:

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

Files in this directory are automatically loaded at startup by both V1 and V2.

### Manual Installation (from GitHub Releases)

1. Download `agentmemory-launcher.ts` from the latest [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Place it in `.opencode/plugins/`:

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode loads `.ts` files from `.opencode/plugins/` automatically at startup.

## Usage

This launcher starts the agentmemory backend. To use agentmemory with OpenCode, also install the agentmemory plugin and refer to the [OpenCode agentmemory plugin usage guide](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) for setup instructions, available tools, and configuration options.

## Logs

The backend starts silently in the background; its output is captured to `~/.agentmemory/agentmemory.log`. The file is truncated on every backend start, so it cannot grow unbounded.

View live logs — prints the last 200 lines and follows:

```bash
npx opencode-agentmemory-launcher
```

(or `agentmemory-logs` if the package is installed globally.)

- `agentmemory-logs --tab` — open the live view in a new Windows Terminal tab
- `agentmemory-logs --lines N` — change how many historical lines are printed
- `agentmemory-logs --no-follow` — print the tail and exit without following

The agentmemory web Viewer remains available at http://localhost:3113.

## Updating

To update agentmemory to the latest version:

```bash
npx @agentmemory/agentmemory upgrade
```

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

1. **On load** (V1: first `config` hook call · V2: `setup()`): the plugin starts a health-check interval (60s)
2. **Health check**: Pings `GET /agentmemory/livez` on the backend (public, no auth)
3. **Auto-restart**: If the health check fails, spawns `npx @agentmemory/agentmemory` as a hidden background process (output captured to `~/.agentmemory/agentmemory.log`)
4. **Debug mode**: Set `OPENCODE_AGENTMEMORY_DEBUG=1` for verbose logging

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | Backend API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | unset | Set to `1` for debug logging |

## API

The plugin ships a dual-track module: the default export carries both host entrypoints, and a named export preserves the classic V1 plugin for existing consumers.

```typescript
import type { Plugin } from "@opencode-ai/plugin";

// V1 entrypoint (named export, kept for back-compat)
export const AgentmemoryLauncherPlugin: Plugin;

// Combined dual-track default export
export default {
  id: "agentmemory-launcher",
  server: AgentmemoryLauncherPlugin, // called by OpenCode V1
  setup: async (context) => { /* start supervision; return cleanup */ }, // called by OpenCode V2
};
```

On V1, the plugin implements the `config` lifecycle hook (called each time OpenCode loads its configuration) plus `event`/`dispose` cleanup. On V2, supervision starts in `setup()` when the plugin loads, and the returned cleanup function stops the health-check loop.

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
