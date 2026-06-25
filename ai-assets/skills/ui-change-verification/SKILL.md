---
name: ui-change-verification
description: >
  Verify user-facing UI changes in a real browser after substantial frontend,
  interaction, or cross-mode architecture changes. Trigger when a task changes
  React UI, routing, WebSocket interaction, xterm/canvas rendering, layout, or
  any behavior the user can only trust through visible UI.
allowed-tools: Bash
---

# UI Change Verification

Use this skill after every substantial UI-impacting change before reporting the
work complete.

## When to use

- Frontend components, hooks, layout, routing, keyboard/focus behavior, or visual
  states changed.
- Backend changes alter WebSocket/API behavior consumed by the UI.
- Terminal, canvas, editor, file tree, chat, mission, or workspace surfaces are
  affected.
- A bug report describes behavior visible in the app.

## When not to use

- Pure documentation changes.
- Pure backend changes with no user-facing UI/API behavior.
- Fast syntax/test-only edits where the affected UI was already verified in the
  same task and no UI behavior changed afterward.

## Workflow

1. Identify the changed user workflow and write 2-5 concrete UI assertions.
2. Start or reuse the app dev server. Prefer the project’s configured ports.
3. Open the app in a browser with Playwright or `playwright-cli`.
4. Navigate to the affected surface using real app routes and existing data when
   possible.
5. Exercise the workflow directly: click, type, toggle, resize, or wait for
   WebSocket events as the user would.
6. Capture evidence using snapshot, screenshots, DOM assertions, console errors,
   and network/WebSocket observations as appropriate.
7. Fix issues found during verification and rerun the relevant UI checks.
8. Report the verification method, URL, assertions checked, and any limits.

## Minimum expectations

- Verify at least one desktop viewport for every substantial UI change.
- Verify mobile or narrow viewport when layout responsiveness was changed.
- Check browser console errors for the verified page.
- For terminal/canvas/editor surfaces, assert the rendered container is nonblank
  and has usable dimensions.
- For WebSocket-driven UI, verify both the event path and visible UI result when
  feasible.
- Do not mark UI-impacting work complete based only on unit tests.

## Output format

Include a short verification section in the final answer:

```text
UI verification:
- URL:
- Method:
- Checked:
- Limits:
```
