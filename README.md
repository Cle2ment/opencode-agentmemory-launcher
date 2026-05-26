# agentmemory-launcher

> Auto-launcher plugin for [agentmemory](https://github.com/agentmemory/agentmemory) — starts the full backend on first OpenCode config load, with health-check supervision.

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

## Development

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Build
npm run build
```

## License

[GNU Affero General Public License v3.0](LICENSE)

© agentmemory contributors
