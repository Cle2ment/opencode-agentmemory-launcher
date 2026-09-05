# AGENTS.md — opencode-agentmemory-launcher

## Overview

OpenCode plugin that auto-starts the agentmemory backend on load with 60s health-check supervision, plus a small `agentmemory-logs` CLI. Dual-track: one package runs on both OpenCode V1 (`opencode`) and V2 (`opencode2`).

## Architecture

```
src/agentmemory-launcher.ts   # Plugin entry (combined V1 + V2 module)
src/logs.ts                   # `agentmemory-logs` bin: tail/follow the backend log
```

Flow (both hosts): on plugin load → `GET /agentmemory/livez` (2s timeout) → spawns `npx @agentmemory/agentmemory` if down → 60s supervision loop.
V1 enters via the `config` hook; V2 enters via `setup()`.
Backend output is captured to `~/.agentmemory/agentmemory.log` (truncated each start); view with `agentmemory-logs` (`--tab` for a new Windows Terminal tab).

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
- **Windows console pop-up**: never spawn the backend with `detached: true` — the console-less cmd makes Windows allocate a NEW VISIBLE console for the first console grandchild (npx/node), opening a foreground terminal tab. Use `windowsHide: true` WITHOUT `detached` so descendants attach to the hidden console.
- **StateKV timeout**: after 12-24h uptime, `state::set` may timeout → `/health` returns 503. `/livez` unaffected.
- **npx caching**: `npx @agentmemory/agentmemory` may serve stale cached version; clear with `npx clear-npx-cache`.
- **Engine version pin**: agentmemory pins iii-engine to v0.11.2 (v0.11.6+ has incompatible sandbox model).
- **Windows**: no binary auto-download; Docker fallback needed.

## Dual-Track Plugin API (V1 + V2)

The plugin API is the **only intentional breaking change** between OpenCode V1 and V2 ([migration guide](https://opencode.ai/v2/docs/migrate-v1)). This package solves it with a single combined default export `{ id, server, setup }`:

| | OpenCode V1 (`opencode`) | OpenCode V2 (`opencode2`) |
|---|---|---|
| Reads | `default.server(input, options)` → V1 `Hooks` | `default.setup(ctx)` → cleanup fn |
| Entrypoint resolution | prefers `exports["./server"]`, falls back to `main` | bare package name → `exports["."]` |
| Config key | `"plugin": [...]` (singular, V2 normalizes it in-memory) | `"plugins": [...]` (plural) |

Both loaders' validators tolerate the other track's extra key (verified against V1 `packages/opencode/src/plugin/shared.ts` `readV1Plugin` and V2 `packages/core/src/config/plugin/external.ts` schema union). Community precedent: `opencode-engram-learning`.

### V1 track (`@opencode-ai/plugin` >=1.17.10, `PluginModule`)

- **`config` hook**: called on every config load → `startSupervision()` (idempotent) + immediate health check.
- **`event` hook** (`server.instance.disposed`) and **`dispose` hook** (v1.17.10+): stop the timer for clean process exit.
- **`client.app.log()`**: structured logging; falls back to stderr when unavailable.
- **`timer.unref()`**: health-check interval never blocks Node exit.

### V2 track (local structural types — do NOT import `@opencode-ai/plugin/v2/*`)

- V2 plugin SDK is `0.0.0-beta-*` and cannot coexist with the `^1.x` dependency; V2 host decodes the shape at runtime anyway. Keep `V2Plugin`/`V2PluginContext` types local.
- **No `config` hook in V2** → supervision starts in `setup()`.
- **No `client.app.log` in V2** → stderr (`consoleLog`): warn/error always, info/debug only with `OPENCODE_AGENTMEMORY_DEBUG=1`.
- `dispose`/`server.instance.disposed` equivalent: **cleanup function returned from `setup()`**.
- V2 plugin API is beta and still moving; the `{ id, server, setup }` shape stays valid because the future external ABI converges on `{ id, setup }` (extra keys tolerated). Re-verify against both loaders when publishing after V2 GA.

## Conventions

- TypeScript strict — no `any`, no `@ts-ignore`
- Exports: combined default `{ id, server, setup }` (dual-track) + named `AgentmemoryLauncherPlugin: Plugin` (V1, back-compat)
- Stateless — process supervision via `child.unref()`; the only file I/O is child stdio redirection to `~/.agentmemory/agentmemory.log` (truncated on each backend start)
- Runtime dependency: only `@opencode-ai/plugin` (>=1.17.10)

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
