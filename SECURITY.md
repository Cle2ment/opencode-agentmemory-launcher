# Security Policy

## Reporting a Vulnerability

The agentmemory project takes security seriously.

If you discover a security vulnerability, please **do not** open a public issue.
Instead, report it privately via email to the maintainers.

### Reporting Process

1. **Email**: Send a detailed report to `yikun.chen@163.com` (or open a private
   security advisory on GitHub if the repository has them enabled).
2. **Include**: A clear description of the vulnerability, steps to reproduce, and
   the affected version(s).
3. **Response**: We aim to acknowledge your report within **48 hours** and provide
   an initial assessment within **5 business days**.

### Scope

Security issues in scope include:

- Arbitrary code execution via the plugin's process supervision
- Network-level attacks on the health-check endpoint
- Dependency supply-chain vulnerabilities
- Information disclosure through debug logging

### Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

### Disclosure Policy

We follow a coordinated disclosure process:

1. The vulnerability is reported privately.
2. We investigate and develop a fix.
3. We release a patch version.
4. A public advisory is published 30 days after the patch release,
   or earlier by mutual agreement.

### Credits

We appreciate and will publicly credit security researchers who follow
responsible disclosure practices (unless they request anonymity).
