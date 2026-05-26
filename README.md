[![npm version](https://img.shields.io/npm/v/@agentmemory/launcher)](https://www.npmjs.com/package/@agentmemory/launcher)
[![License](https://img.shields.io/npm/l/@agentmemory/launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/@agentmemory/launcher)](https://nodejs.org/)
[![CI](https://github.com/agentmemory/agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/agentmemory/agentmemory-launcher/actions/workflows/ci.yml)

# agentmemory-launcher

> Auto-launcher plugin for [agentmemory](https://github.com/agentmemory/agentmemory) — starts the full backend on first OpenCode config load, with health-check supervision.

## Requirements

- **Node.js** ≥ 18.0.0
- **OpenCode** with plugin support
- **agentmemory** backend (auto-installed via `npx @agentmemory/agentmemory` if not present)

## What It Does

The `agentmemory-launcher` is an [OpenCode](https://github.com/oh-my-opencode/opencode) plugin that automatically starts the agentmemory backend (REST API + iii-engine) when OpenCode loads its configuration. It runs once per OpenCode process and health-checks the backend every 60 seconds, restarting it if the process dies.

## Installation

```bash
npm install @agentmemory/launcher
```

Or add to your OpenCode plugin config:

```jsonc
// opencode.jsonc
{
  "plugins": ["@agentmemory/launcher"]
}
```

## How It Works

1. **On first config load**: The plugin starts a health-check interval (60s)
2. **Health check**: Pings `GET /agentmemory/health` on the backend
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

[GNU Affero General Public License v3.0](LICENSE)

© agentmemory contributors
