# Contributing to opencode-agentmemory-launcher

Thanks for your interest in contributing!

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior as described in [SECURITY.md](./SECURITY.md).

## Reporting Bugs

Found a bug? Please open an issue on GitHub using the [Bug Report template](https://github.com/Cle2ment/opencode-agentmemory-launcher/issues/new?template=bug_report.md).

Include:
- Your environment (OS, Node.js version, plugin version)
- Steps to reproduce
- Expected vs actual behavior
- Any relevant error logs

For security vulnerabilities, see [SECURITY.md](./SECURITY.md) — do **not** report them publicly.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/Cle2ment/opencode-agentmemory-launcher`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feat/my-feature`

## Development

```bash
# Type-check
npm run typecheck

# Build
npm run build

# Run tests
npm test
```

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Ensure `npm run typecheck` passes and `npm run build` succeeds
- Update documentation if applicable
- Follow the existing code style (strict TypeScript, no `any`)
- Use the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — build, deps, config
- `refactor:` — code restructure
- `ci:` — CI/CD workflows

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](./LICENSE) license.
