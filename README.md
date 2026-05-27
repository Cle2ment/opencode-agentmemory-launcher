# Agentmemory Launcher for OpenCode

> OpenCode plugin that auto-starts the [agentmemory](https://github.com/rohitg00/agentmemory) backend with health-check supervision.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

## Requirements

- **Node.js** ≥ 18.0.0
- **OpenCode** with plugin support
- **agentmemory** backend (auto-installed via `npx @agentmemory/agentmemory` if not present)

## What It Does

This plugin automatically starts the [agentmemory](https://github.com/rohitg00/agentmemory) backend (REST API + iii-engine) when OpenCode loads its configuration. It runs once per OpenCode process and health-checks the backend every 60 seconds, restarting it if the process dies.

## Installation

### From npm (recommended)

Add to your OpenCode config:

```jsonc
// opencode.json
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode will automatically install the package at startup. See the [OpenCode Plugins documentation](https://opencode.ai/docs/en/plugins/) for more details.

### From local file

Place the plugin file in `.opencode/plugins/`:

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

Files in this directory are automatically loaded at startup.

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

## How It Works

1. **On first config load**: The plugin starts a health-check interval (60s)
2. **Health check**: Pings `GET /agentmemory/livez` on the backend (public, no auth)
3. **Auto-restart**: If the health check fails, spawns `npx @agentmemory/agentmemory` in a detached process
4. **Debug mode**: Set `OPENCODE_AGENTMEMORY_DEBUG=1` for verbose logging

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | Backend API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | unset | Set to `1` for debug logging |

## API

The plugin exports a single object conforming to the `@opencode-ai/plugin` interface:

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const AgentmemoryLauncherPlugin: Plugin;
```

This plugin implements the `config` lifecycle hook, which is called each time OpenCode loads its configuration.

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
