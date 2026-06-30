# Fix IDE File Auto Refresh

## Summary
Fix stale IDE content display when a locally changed file is already open in the IDE and rendered through the inline diff view.

## Root Cause Analysis
Open file tabs are refreshed from disk after git or file-operation WebSocket events. For changed files, `EditorTabs` renders `InlineDiffViewer` instead of the plain Monaco editor. The diff viewer owns its own `original` and `modified` state and only reloads when `filePath`, `worktreePath`, `baseBranch`, or `refreshKey` changes.

`EditorTabs` currently passes `activeTab.originalContent.length` as `refreshKey`. If an external edit changes file content without changing content length, the tab state refreshes but the diff viewer refresh key stays unchanged, so the user continues seeing stale changed content.

## Goals
- Refresh the inline diff view for every accepted open-tab content refresh, including same-length edits.
- Preserve the existing guard that does not overwrite dirty tabs.
- Keep the change scoped to the IDE tab state and diff viewer refresh trigger.

## Non-Goals
- Replacing git watcher infrastructure.
- Changing file content API contracts.
- Adding conflict resolution for dirty editor tabs.

## Approach
Track a monotonic content revision on each editor tab and bump it when file content is loaded, saved, or refreshed from disk. Pass that revision to `InlineDiffViewer` as `refreshKey` instead of content length.

## Risks
- Revision bumps must not cause unnecessary reload loops. The revision is only updated from explicit tab state transitions, not by the diff viewer load effect.
