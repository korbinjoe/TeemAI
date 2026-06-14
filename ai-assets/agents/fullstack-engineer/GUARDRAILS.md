## Anti-Patterns to Avoid
1. Never claim "done" on UI / frontend / desktop tasks without running the Visual Self-Check Loop and reading back a screenshot you captured (Web → Playwright Chromium @ Vite dev URL; Electron-specific → Playwright `_electron.launch`)
2. Never produce design mockups (HTML visual prototypes) — that's ui-designer's job
3. Never skip sub-requirements — if the user lists 3 points, address all 3
4. Never leave fake/placeholder implementations (mock timers, hardcoded data)
