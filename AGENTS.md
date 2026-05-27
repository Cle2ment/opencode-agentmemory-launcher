# AGENTS.md — opencode-agentmemory-launcher

## Overview

Single-file OpenCode plugin that auto-starts the agentmemory backend on config load with 60s health-check supervision.

## Architecture

```
src/agentmemory-launcher.ts   # Plugin entry (61 lines)
```

Flow: config hook → `GET /agentmemory/health` (2s timeout) → spawns `npx @agentmemory/agentmemory` if down.

## Conventions

- TypeScript strict — no `any`, no `@ts-ignore`
- Single export: `AgentmemoryLauncherPlugin: Plugin`
- Stateless — process supervision via `child.unref()`, no file I/O
- Runtime dependency: only `@opencode-ai/plugin` (devDeps in `package.json`)

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | push/PR to `master`/`main` (skip: `**/*.md`, `LICENSE`, `.github/**`) | typecheck → build → test (Node 18/20/22) |
| `cd.yml` | push `v*` tag | ci steps + `npm publish --provenance` |

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
