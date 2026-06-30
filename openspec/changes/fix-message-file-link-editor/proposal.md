# Fix Message File Link Editor Opening

## Root Cause
Message detail Markdown links are rendered by `TimelineView.ExternalLink`, which calls `window.open(href, '_blank')` for every link. Local file hrefs therefore go through the browser/Electron external-open path instead of the existing `ide:open-file` editor bridge.

## Follow-up Root Cause
Bare file-name Markdown hrefs such as `AGENTS.md` or `README.md` were still rejected by the local file parser because it only accepted paths containing `/` or starting with `.`. Those links then fell through to `window.open` and navigated the browser.

## Goal
Clicking local file addresses in the message area opens the in-app editor at the file and optional line number.

## Non-Goals
- Do not change external HTTP/HTTPS link behavior.
- Do not change file tree, search panel, or editor tab behavior.

## Approach
Centralize local file href parsing in `filePathLinks.tsx`, reuse the existing `ide:open-file` event, and update `TimelineView` links to dispatch the editor event for local file targets while preserving browser opening for external URLs.

## Risk
Low. Scope is limited to chat timeline Markdown link click handling and pure helper parsing.
