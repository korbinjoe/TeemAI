# Contributing to OpenTeam

Thank you for your interest in contributing to OpenTeam!

## Development Setup

1. **Fork** the repository and clone your fork
2. Install dependencies: `npm install`
3. Start development: `npm run dev`
4. Open `http://localhost:13000` in your browser

## Development Commands

```bash
npm run dev          # Start frontend + backend
npm run dev:ui       # Frontend only
npm run dev:server   # Backend only
npm test             # Run tests
npm run build:ui     # Build frontend
npm run build:cli    # Build CLI
```

## Making Changes

1. Create a branch from `main`: `git checkout -b feat/my-feature`
2. Make your changes with clear, focused commits
3. Ensure tests pass: `npm test`
4. Ensure TypeScript compiles: `npx tsc --noEmit`
5. Submit a pull request

## Code Style

- TypeScript strict mode
- Minimal comments — only when the *why* is non-obvious
- Prefer editing existing files over creating new ones
- No unnecessary abstractions — three similar lines beats a premature helper

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what changed and why
- Add tests for new functionality
- Update documentation if needed

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include your environment (OS, Node.js version, browser)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
