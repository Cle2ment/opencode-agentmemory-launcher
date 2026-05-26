# Changelog

All notable changes to agentmemory-launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - unreleased

### Added
- Initial release of agentmemory-launcher plugin
- Auto-start agentmemory backend on OpenCode config load
- Health-check supervision every 60 seconds
- Automatic restart on backend crash
- Debug logging via `OPENCODE_AGENTMEMORY_DEBUG` env var
- Configurable backend URL via `AGENTMEMORY_URL` env var
