# Changelog

All notable changes to opencode-agentmemory-launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.2]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Cle2ment/opencode-agentmemory-launcher/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Cle2ment/opencode-agentmemory-launcher/releases/tag/v0.1.0
