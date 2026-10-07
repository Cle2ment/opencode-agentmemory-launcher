# AGENTS.md — opencode-agentmemory-launcher

## Overview

Single-file OpenCode V2 (`opencode2`) plugin that auto-starts the agentmemory backend on load with 60s health-check supervision. V1 support was dropped in v4.0.0.

## Architecture

```
src/agentmemory-launcher.ts   # Plugin entry (V2 module)
```

Flow: on plugin load (`setup()`) → `GET /agentmemory/livez` (2s timeout) → spawns `npx @agentmemory/agentmemory` if down → 60s supervision loop → cleanup function stops the loop on unload.

Windows launch path: plain `windowsHide` is not enough — it hides only the direct child, and every cmd.exe hop (`shell: true`, npx's `.cmd` shim) lets a grandchild allocate a NEW console, which Windows Terminal shows as a focus-stealing tab. So on Windows the plugin resolves `dist/cli.mjs` from the **newest** agentmemory it can find — the npx cache (`%LOCALAPPDATA%/npm-cache/_npx/*/node_modules/@agentmemory/agentmemory`) or a global install on `PATH` (`<dir>/node_modules/@agentmemory/agentmemory` and `<prefix>/lib/node_modules/@agentmemory/agentmemory`), highest version wins — and spawns `node` directly on it: the tree (node → cli.mjs → iii.exe) contains no cmd.exe and never allocates a console (the CLI spawns iii-engine with `windowsHide` itself). Falls back to the legacy npx spawn when the cache is cold or the direct spawn errors. Relaunches are gated by a 90s boot grace window plus a cross-instance self-expiring lock (`%TEMP%/agentmemory-launcher.lock`) because every OpenCode server runs its own plugin instance against the same backend.

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
| `GET /agentmemory/health` | **requires auth** (always, since 0.9.30) | Full health snapshot, 200/503 |
| `GET /agentmemory/status` | **requires auth** (added 0.9.30) | Rich self-diagnosis (providers, engine pin, ports, flags); JSON or HTML |

> DO NOT switch back to `/health` — since agentmemory 0.9.30 a secret is always generated (`~/.agentmemory/secret`), so `/health` **always** returns 401 without a bearer, causing infinite restart loops.

### Known Pitfalls
- **StateKV timeout**: after 12-24h uptime, `state::set` may timeout → `/health` returns 503. `/livez` unaffected.
- **npx cache vs global install**: `npx @agentmemory/agentmemory` may serve a stale cached version, and a newer `npm i -g` install is a separate copy. The launcher resolves the **newest** version across the npx cache and `PATH` globals (a newer global install now wins over a stale cache); clear the cache with `npx clear-npx-cache` when needed.
- **Engine version pin**: agentmemory **0.9.30** pins iii-engine to **v0.22.1** (0.11.2 through 0.9.29) and enforces the pin (`process.exit(1)` on mismatch). The pinned engine auto-installs into `~/.agentmemory/bin/` and is SHA-256 verified. Custom iii configs must keep the `iii-`-prefixed builtin worker names (`iii-http`, `iii-state`, `iii-queue`, `iii-pubsub`, `iii-cron`) — on 0.22.1 the bare names resolve to standalone registry workers.
- **Auth on by default (0.9.30)**: the daemon generates `~/.agentmemory/secret` (mode 0600) on first start when `AGENTMEMORY_SECRET` is unset. The bundled CLI/viewer/hooks/MCP read it automatically; only hand-written REST calls to `:3111` need `Authorization: Bearer $(cat ~/.agentmemory/secret)`. The launcher only calls the public `/agentmemory/livez`, so it needs no secret.
- **Silent launch failure on engine-pin mismatch**: the launcher spawns the backend with `stdio: "ignore"`; 0.9.30's enforced engine pin makes a mismatched engine `exit(1)` with no visible output. The plugin logs a `warn` on any non-zero launch exit pointing at the pin.
- **Windows**: no binary auto-download; Docker fallback needed.
- **Windows focus-stealing tabs**: any cmd.exe hop in the spawn chain (`shell: true`, npx `.cmd` shim) lets a grandchild allocate a new console → visible WT window/tab. `windowsHide`/`detached` do not propagate down the tree. The only clean fix without external helpers is removing cmd.exe from the chain entirely (spawn `node` directly on `cli.mjs`). The same mechanism applies to `@agentmemory/mcp` stdio servers spawned by OpenCode per session — those flashes come from OpenCode's MCP spawn, not this plugin.
- **winnat port theft (os error 10013)**: iii-engine can suddenly fail to bind its port with `failed to bind ... 10013` while nothing listens there — the port fell into a winnat/Hyper-V dynamic excluded range (check `netsh interface ipv4 show excludedportrange protocol=tcp`). Durable fix (admin): `net stop winnat` → `netsh int ipv4 add excludedportrange protocol=tcp startport=3111 numberofports=3` → `net start winnat`. Symptom cascade: every plugin instance relaunches every 60s, racer CLIs keep killing each other's engines, backend stays down.

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
- Stateless — process supervision via `child.unref()`; the only file I/O is the cross-instance launch lock in `%TEMP%` on Windows
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
