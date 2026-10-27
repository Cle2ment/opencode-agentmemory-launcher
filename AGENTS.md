# AGENTS.md — opencode-agentmemory-launcher

## Overview

Three-module OpenCode V2 (`opencode2`) plugin that auto-starts the agentmemory backend on load with 60s health-check supervision. V1 support was dropped in v4.0.0.

## Architecture

```
src/agentmemory-launcher.ts   # V2 entry: default { id, setup } and cleanup
src/launch.ts                 # Health checks, spawn, launch lock/backoff, supervision singleton
src/cli-resolution.ts         # npx/global CLI discovery, realpath handling, version selection
```

Dependency direction is strictly `agentmemory-launcher.ts → launch.ts → cli-resolution.ts`; there are no cycles. The entrypoint filename and default export are the public package contract. Internal named exports are not part of that contract.

Flow: on plugin load (`setup()`) → `GET /agentmemory/livez` (2s timeout, one 3s confirmation retry) → resolve and silently spawn the newest CLI if down → 60s supervision loop → cleanup stops the loop on unload.

Windows launch path (the launcher's own spawn is always silent): every launch bypasses npx/cmd and spawns `node` directly on `dist/cli.mjs` resolved from the **newest** agentmemory it can find. Candidates come from the npm/npx cache (`npm_config_cache` → `~/.npmrc` `cache=` → `%LOCALAPPDATA%/npm-cache`, plus portable cache probes beside PATH entries) and global installs on `PATH`. Both literal PATH entries and their `realpath` values are scanned, which is required for Scoop's `apps/nodejs/current/bin` → `persist/nodejs/bin` layout. Highest version wins. Fall back to the legacy npx spawn only when no candidate is found or the direct spawn errors. Plain `windowsHide` is insufficient for the npx path because every cmd.exe hop can allocate a new console.

Relaunches use a 450s boot budget plus a cross-instance self-expiring lock (`%TEMP%/agentmemory-launcher.lock`). The retry delay is `max(450s, 90s·2^attempts capped at 12min)`, so normal 0.9.31 startup is not interrupted by a duplicate launch. agentmemory 0.9.31+ Worker Compose may create cmd.exe/conhost inside its own worker tree; do not attribute every console flash to the launcher without a parent-process trace.

## Agentmemory Backend (Critical Knowledge)

Source: [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)

### 0.9.31+ Worker Compose Startup

```
node dist/cli.mjs             # short-lived launcher; exits after readiness
  └─ iii compose              # detached service owner
       ├─ iii-engine 0.25.0
       ├─ state / http workers
       └─ agentmemory worker (dist/index.mjs)
```

The CLI budgets up to 120s for engine readiness plus 300s for worker readiness. A healthy boot can therefore take about 7 minutes without `/livez`; the launcher must not use the old 90s grace window. `/livez`, not CLI process lifetime, remains the health signal.

Legacy 0.9.30 used the older CLI + engine + worker model with a 15s worker readiness error and iii-engine 0.22.1. Keep that version distinction when diagnosing old log messages.

### Health Endpoints (CRITICAL)

| Endpoint | Auth | Use |
|----------|------|-----|
| `GET /agentmemory/livez` | **public, no auth** | Use for liveness checks |
| `GET /agentmemory/health` | **requires auth** (always, since 0.9.30) | Full health snapshot, 200/503 |
| `GET /agentmemory/status` | **requires auth** (added 0.9.30) | Rich self-diagnosis; JSON or HTML |

> DO NOT switch back to `/health` — since agentmemory 0.9.30 a secret is always generated (`~/.agentmemory/secret`), so `/health` **always** returns 401 without a bearer, causing infinite restart loops.

### Known Pitfalls

- **StateKV timeout**: after 12-24h uptime, `state::set` may timeout → `/health` returns 503. `/livez` is unaffected.
- **npx cache vs global install**: these are separate copies. The launcher resolves the newest across both, including globals reachable only through a symlinked PATH entry's `realpath`; clear stale caches with `npx clear-npx-cache` when needed.
- **Engine version pin**: 0.9.30 pins iii-engine 0.22.1; 0.9.31 pins 0.25.0 and enforces the pin. Native Windows requires manually installing the pinned `iii.exe`; the CLI manages engine selection, not this launcher. Legacy custom iii configs and `AGENTMEMORY_USE_DOCKER` do not apply to 0.9.31 Worker Compose.
- **Auth on by default (0.9.30+)**: the daemon generates `~/.agentmemory/secret` (mode 0600) when `AGENTMEMORY_SECRET` is unset. Bundled clients read it automatically; hand-written REST calls need `Authorization: Bearer $(cat ~/.agentmemory/secret)`. The launcher only calls public `/livez`.
- **Silent launch failure**: backend stdio is ignored. Any non-zero CLI exit logs a `warn` covering port contention, engine-pin mismatch, and 0.9.31+ Worker Compose readiness failure; use `agentmemory doctor` for details.
- **Native Windows 0.9.31 startup regression**: [agentmemory#1618](https://github.com/rohitg00/agentmemory/issues/1618) documents Worker Compose shell quoting and environment/PATH problems that prevent workers from registering. Native Windows is unverified upstream. Do not hide this by patching third-party `dist` files in this repository.
- **Windows focus-stealing tabs**: cmd.exe hops in npx/OpenCode local-MCP spawn chains can allocate consoles. The launcher has no deliberate visible-startup mode. For 0.9.31+, distinguish the launcher's silent direct spawn from consoles created inside Worker Compose or by OpenCode MCP spawns using process-parent evidence.
- **winnat port theft (os error 10013)**: check `netsh interface ipv4 show excludedportrange protocol=tcp`. Durable fix (admin): `net stop winnat` → `netsh int ipv4 add excludedportrange protocol=tcp startport=3111 numberofports=3` → `net start winnat`.
- **Legacy 0.9.30 stale worker (`worker did not become ready within 15s`)**: restart the whole chain with `agentmemory stop` or stop the engine+worker pair together. Never kill a single worker in isolation; its engine may have bound routes to that process, causing `/livez` to return 404 while the port remains held.

## OpenCode V2 Plugin API

SDK: `@opencode/plugin` (stable, >=2.0.18). Types are imported type-only (`import type { Plugin } from "@opencode/plugin"`), so the SDK is a **devDependency** with zero runtime footprint; the V2 host decodes the shape at runtime.

| Aspect | V2 behavior |
|---|---|
| Module shape | default export `{ id: string, setup(ctx): Cleanup \| void }` (`id` required; extra keys stripped) |
| Entrypoint resolution | bare package name → `exports["."]`; Node path uses `require.resolve` → **`exports["."]` must carry a `default` condition**, not only `import` |
| Config key | `"plugins": [...]` (plural), `Array<string \| { package, options }>` |
| Cleanup | function returned from `setup()`, called on plugin unload (e.g. config hot-reload) |
| Logging | **no `client.app.log` in V2** → stderr: warn/error always, info/debug only with `OPENCODE_AGENTMEMORY_DEBUG=1` |

- **No `config` hook in V2** → supervision starts in `setup()` (runs once on load).
- **`timer.unref()`**: the health-check interval never blocks Node exit.
- The module-level `timer` singleton lives in `launch.ts`; the entry only calls its start/stop functions, and `startSupervision` remains idempotent.
- Docs: [build/plugins](https://opencode.ai/v2/docs/build/plugins) · loader source `packages/core/src/config/plugin/external.ts`.

## Conventions

- TypeScript strict — no `any`, no `@ts-ignore`.
- Public exports: default `{ id, setup }` only (V2); submodule named exports are internal.
- Process supervision uses `child.unref()`; the only persistent launcher file write is the cross-instance launch lock in `%TEMP%` on Windows.
- Runtime dependencies: none (`@opencode/plugin` is a type-only devDependency).

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | push/PR to `master`/`main` (skip: `**/*.md`, `LICENSE`, `.github/**`) | typecheck → build → test (Node 18/20/22) |
| `cd.yml` | push `v*` tag | typecheck → build → `npm publish --provenance` → GitHub Release notes |

The npm package distributes the compiled multi-file `dist/` output. GitHub Releases no longer attach a standalone raw `.ts` plugin for manual installation.

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
npm run build       # compile all three modules to dist/
npm test            # build + node:test regression suite
```

Test locally: point OpenCode plugin config at this package.

## License

AGPL-3.0-only — [LICENSE](./LICENSE)
