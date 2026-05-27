# AGENTS.md — opencode-agentmemory-launcher

## Overview

Single-file OpenCode plugin that auto-starts the agentmemory backend on config load with 60s health-check supervision.

## Architecture

```
src/agentmemory-launcher.ts   # Plugin entry
```

Flow: config hook → `GET /agentmemory/livez` (2s timeout) → spawns `npx @agentmemory/agentmemory` if down.

## Agentmemory Backend (Critical Knowledge)

Source: [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)

### Two-Tier Startup
```
npx @agentmemory/agentmemory  (CLI + worker, ~15-30s startup)
  └─ iii-engine  (binary, detached, PID in ~/.agentmemory/iii.pid)
       └─ iii-exec → worker  (registers API routes, binds port)
```

### Health Endpoints (CRITICAL)
| Endpoint | Auth | Use |
|----------|------|-----|
| `GET /agentmemory/livez` | **public, no auth** | Use for liveness checks |
| `GET /agentmemory/health` | **requires auth when `AGENTMEMORY_SECRET` set** | Full health snapshot, 200/503 |

> DO NOT switch back to `/health` — it returns 401 when auth is enabled, causing infinite restart loops.

### Known Pitfalls
- **StateKV timeout**: after 12-24h uptime, `state::set` may timeout → `/health` returns 503. `/livez` unaffected.
- **npx caching**: `npx @agentmemory/agentmemory` may serve stale cached version; clear with `npx clear-npx-cache`.
- **Engine version pin**: agentmemory pins iii-engine to v0.11.2 (v0.11.6+ has incompatible sandbox model).
- **Windows**: no binary auto-download; Docker fallback needed.

## Plugin API Compliance

Per [OpenCode Plugin API](https://opencode.ai/docs/en/plugins/) — `@opencode-ai/plugin`:

- **`dispose` hook**: MANDATORY for plugins that start persistent resources (timers, processes). Must clear `setInterval`.
- **`client.app.log()`**: Use for structured logging, not `console.error`.
- **`config` hook**: called on every config load. Guard with `if (!timer)` for once-only init.

## Conventions

- TypeScript strict — no `any`, no `@ts-ignore`
- Single export: `AgentmemoryLauncherPlugin: Plugin`
- Stateless — process supervision via `child.unref()`, no file I/O
- Runtime dependency: only `@opencode-ai/plugin` (devDeps in `package.json`)

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | push/PR to `master`/`main` (skip: `**/*.md`, `LICENSE`, `.github/**`) | typecheck → build → test (Node 18/20/22) |
| `cd.yml` | push `v*` tag | typecheck → build → `npm publish --provenance` → GitHub Release (`src/agentmemory-launcher.ts`) |

Release: `npm version patch && git push --follow-tags`

## Commit Convention

| Prefix | Use |
|--------|-----|
| `feat:` / `fix:` | feature / bug fix |
| `docs:` | documentation only |
| `ci:` | CI/CD workflows |
| `chore:` | build, deps, config |
| `refactor:` | code restructure (no behavior change) |

## Development

```bash
npm install         # first time only
npm run typecheck   # verify types
npm run build       # compile to dist/
npm test            # (placeholder, exits 0)
```

Test locally: point OpenCode plugin config at this package.

## License

AGPL-3.0-only — [LICENSE](./LICENSE)
