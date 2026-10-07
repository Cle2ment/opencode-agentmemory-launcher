# Changelog

All notable changes to opencode-agentmemory-launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **npx cache location is no longer assumed to be `%LOCALAPPDATA%/npm-cache`.** npm's cache can be redirected via `npm_config_cache` or a `cache=` line in `~/.npmrc`, and portable installs (e.g. scoop) keep it beside the node bin dir on PATH (`<persist>/nodejs/cache`). On such setups the npx-cache scan silently found nothing and resolution fell back to the global-install scan. All candidate roots are now scanned; highest version still wins.
- **Windows launch now picks the newest agentmemory across the npx cache *and* global installs.** The direct-`node` fast path previously scanned only the npx cache, so a newer global install (`npm i -g @agentmemory/agentmemory@latest`) was ignored while a stale cached version kept running. Resolution now also scans `PATH` directories for `node_modules/@agentmemory/agentmemory` (and the `<prefix>/lib/node_modules` layout) and selects the highest version.

### Added
- **Visible diagnostics for a failed backend launch.** A launch process exiting with a non-zero code is now logged at `warn` (previously debug-only) with a pointer to `agentmemory doctor`, so agentmemory 0.9.30's enforced iii-engine pin mismatch (`exit(1)`) is no longer silent under `stdio: "ignore"`.

### Notes
- Verified against **agentmemory 0.9.30** (2026-10-06): auth-by-default does not affect the launcher (it uses the always-public `/agentmemory/livez`); the iii-engine `0.11.2` → `0.22.1` pin move is handled by the agentmemory CLI, not the launcher.

## [4.1.1] - 2026-10-01

### Changed
- **Transient `/livez` flaps no longer trigger a launch.** A single failed probe now requires a second confirmation 3s later before the backend is considered down. A spurious launch attaches a permanent duplicate worker (~one extra node process per flap) — this was the largest avoidable resource cost. Real-crash detection latency only grows from ≤60s to ≤63s.
- **Exponential backoff between launch attempts while the backend stays down** (90s → 180s → … → capped at 12min, reset when healthy). Hard failures (e.g. port theft) previously churned npx/node processes every 90s forever; retries still continue indefinitely.

## [4.1.0] - 2026-10-01

### Fixed
- **Windows: backend launch no longer opens a terminal window/tab or steals focus.** Plain `windowsHide` only hides the direct child; every cmd.exe hop in the npx chain (`shell: true`, npx's `.cmd` shim) lets a grandchild allocate a NEW console, which Windows Terminal surfaced as a focus-stealing tab on every (re)launch. On Windows the plugin now resolves the agentmemory CLI entry (`dist/cli.mjs`) from the npx cache and spawns `node` directly on it — the tree (node → cli.mjs → iii.exe) contains no cmd.exe and never allocates a console (the CLI already spawns iii-engine with `windowsHide` itself). Falls back to the legacy npx spawn when the npx cache is cold or the direct spawn fails.
- **Concurrent OpenCode servers could race-kill the backend.** Each server runs its own plugin instance; simultaneous relaunches raced on the engine port (one engine binds, the rest crash) and could keep the backend down. Launches are now gated by a cross-instance, self-expiring lock file (`%TEMP%/agentmemory-launcher.lock`) plus a 90s boot grace window.

### Operational note
- If `iii-engine` suddenly fails to start with `failed to bind ... os error 10013` while nothing listens on the port, the port has likely fallen into a winnat/Hyper-V dynamic excluded port range (`netsh interface ipv4 show excludedportrange protocol=tcp`). Fix (admin): `net stop winnat` → `netsh int ipv4 add excludedportrange protocol=tcp startport=3111 numberofports=3` → `net start winnat`.

## [4.0.0] - 2026-09-27

### Removed
- **BREAKING:** OpenCode V1 (`opencode` 1.x) support dropped — the package is now V2-only (`opencode2`). Pin `opencode-agentmemory-launcher@^3` if you still need V1
- Named export `AgentmemoryLauncherPlugin` (V1 entrypoint) and the `exports["./server"]` alias
- Runtime dependency on `@opencode-ai/plugin`

### Changed
- Default export is now plain `{ id, setup }` typed with the official stable V2 SDK (`import type { Plugin } from "@opencode/plugin"`, type-only — devDependency, zero runtime footprint)
- `exports["."]` now carries a `default` condition so the V2 host's Node-path `require.resolve` can resolve the entrypoint (previously `ERR_PACKAGE_PATH_NOT_EXPORTED` → plugin silently skipped on Node runtimes)

## [2.0.0] - 2026-09-02

### Added
- Dual-track support: one package now runs on both OpenCode V1 (`opencode`) and V2 (`opencode2`) via a combined default export `{ id, server, setup }` — V1 calls `server()` for the classic Hooks API, V2 calls `setup()` and receives a cleanup function
- `exports["./server"]` alias in package.json (the V1 host's preferred entrypoint)

### Changed
- Supervision logic (health loop / spawn / stop) extracted from the V1 `config` hook into shared internals reused by both tracks; V2 starts supervision in `setup()` because V2 has no `config` hook
- V2 track logs to stderr (warn/error always, info/debug only with `OPENCODE_AGENTMEMORY_DEBUG=1`) since `client.app.log()` has no V2 equivalent

## [1.0.2] - 2026-05-27

### Changed
- CD workflow now creates GitHub Release with `src/agentmemory-launcher.ts` for manual install
- Added manual install guide (from GitHub Releases)

## [1.0.1] - 2026-05-27

### Added
- npm provenance attestation in CD workflow

## [1.0.0] - 2026-05-27

### Fixed
- Health endpoint changed from `/health` to `/livez` to prevent 401 auth restart loops
- Added `dispose` hook to clean up interval timer on plugin unload
- Added concurrent health-check protection (`checking` flag)
- Structured logging via `client.app.log()` instead of `console.error`
- Error handling in `config` hook

### Changed
- CI workflow skips docs/`.github` changes
- `data/` directory added to `.gitignore`

### Added
- Agentmemory backend architecture and known pitfalls documented in AGENTS.md
- GitHub Release created on each tag push (CD)

## [0.1.0] - unreleased

### Added
- Initial release of agentmemory-launcher plugin
- Auto-start agentmemory backend on OpenCode config load
- Health-check supervision every 60 seconds
- Automatic restart on backend crash
- Debug logging via `OPENCODE_AGENTMEMORY_DEBUG` env var
- Configurable backend URL via `AGENTMEMORY_URL` env var

[4.0.0]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v3.0.0...v4.0.0
[2.0.0]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v1.0.2...v2.0.0
[1.0.2]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Cle2ment/opencode-agentmemory-launcher/releases/tag/v0.1.0
