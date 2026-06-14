# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

Use [GitHub Security Advisories](https://github.com/korbinjoe/TeemAI/security/advisories/new) (preferred) or DM [@korbinjoe](https://twitter.com/korbinjoe) with:

- Description of the issue and potential impact
- Steps to reproduce
- Affected version / commit

We aim to acknowledge within 72 hours and provide a fix timeline when confirmed.

## Security Notes for Users

- **API keys**: TeemAI reads `ANTHROPIC_API_KEY`, Codex credentials from `~/.codex/config.toml`, and similar provider keys from your local environment. Keys stay on your machine under `~/.teemai/` — they are not sent to TeemAI servers (there are none; TeemAI is local-first).
- **Browser extension**: The Social Operator agent drives your logged-in Chrome session via the Browser Social Agent extension. Review drafts before approving posts.
- **Network exposure**: `npm run dev` binds to `0.0.0.0` by default for LAN/mobile PWA access. Do not expose port 13000/13001 to the public internet without authentication.
