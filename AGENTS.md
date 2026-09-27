# AGENTS.md — opencode-agentmemory-launcher

## Overview

Single-file OpenCode V2 (`opencode2`) plugin that auto-starts the agentmemory backend on load with 60s health-check supervision. V1 support was dropped in v4.0.0.

## Architecture

```
src/agentmemory-launcher.ts   # Plugin entry (V2 module)
```

Flow: on plugin load (`setup()`) → `GET /agentmemory/livez` (2s timeout) → spawns `npx @agentmemory/agentmemory` if down → 60s supervision loop → cleanup function stops the loop on unload.

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

## OpenCode V2 Plugin API

SDK: `@opencode/plugin` (stable, >=2.0.18 — GA, not beta). Types are imported type-only (`import type { Plugin } from "@opencode/plugin"`), so the SDK is a **devDependency** with zero runtime footprint; the V2 host decodes the shape at runtime.

| Aspect | V2 behavior |
|---|---|
| Module shape | default export `{ id: string, setup(ctx): Cleanup \| void }` (`id` required; extra keys stripped) |
| Entrypoint resolution | bare package name → `exports["."]`; Node path uses `require.resolve` → **`exports["."]` must carry a `default` condition**, not only `import` |
| Config key | `"plugins": [...]` (plural), `Array<string \| { package, options }>` |
| Cleanup | function returned from `setup()`, called on plugin unload (e.g. config hot-reload) |
| Logging | **no `client.app.log` in V2** (`ctx.app` is metadata only) → stderr (`consoleLog`): warn/error always, info/debug only with `OPENCODE_AGENTMEMORY_DEBUG=1` |

- **No `config` hook in V2** → supervision starts in `setup()` (runs once on load).
- **`timer.unref()`**: health-check interval never blocks Node exit.
- Module-level `timer` singleton makes repeated `setup()` (hot-reload) safe: `startSupervision` is idempotent.
- Docs: [build/plugins](https://opencode.ai/v2/docs/build/plugins) · loader source `packages/core/src/config/plugin/external.ts` (schema union `id+effect | id+setup`).

## Conventions

- TypeScript strict — no `any`, no `@ts-ignore`
- Exports: default `{ id, setup }` only (V2)
- Stateless — process supervision via `child.unref()`, no file I/O
- Runtime dependencies: none (`@opencode/plugin` is type-only devDependency)

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
