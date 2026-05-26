# AGENTS.md — agentmemory-launcher

## Project Overview

`agentmemory-launcher` is an OpenCode plugin that auto-starts the agentmemory backend. It is a single-file TypeScript plugin with zero runtime dependencies beyond `@opencode-ai/plugin` and the agentmemory process itself.

## Architecture

```
src/
└── agentmemory-launcher.ts    # Single plugin entry point
```

The plugin exports an `AgentmemoryLauncherPlugin` object conforming to the `@opencode-ai/plugin` interface. On config load, it:
1. Starts a 60s health-check interval
2. Pings `GET /agentmemory/health` 
3. Spawns `npx @agentmemory/agentmemory` if the backend is down

## Conventions

- **TypeScript strict mode** — no `any`, no `@ts-ignore`
- **Single-file plugin** — the launcher is intentionally a single file for minimal overhead
- **No persistence** — the launcher is stateless; all state lives in the backend process
- **Process supervision** — uses detached child processes with `child.unref()` to avoid blocking OpenCode exit

## Development Workflow

1. Make changes to `src/agentmemory-launcher.ts`
2. Run `npm run typecheck` to verify
3. Run `npm run build` to compile
4. Test locally by loading as an OpenCode plugin

## Commit Convention

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — build, CI, dependencies
- `refactor:` — code change that neither fixes a bug nor adds a feature

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@opencode-ai/plugin` | `>=0.1.0` | Plugin interface types |
| `typescript` | `^5.7.0` | Build tooling |
| `@types/node` | `^22.0.0` | Node.js type definitions |

## License

AGPL-3.0-only — see [LICENSE](./LICENSE)
