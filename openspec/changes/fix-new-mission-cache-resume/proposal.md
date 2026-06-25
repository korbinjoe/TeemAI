# Fix New Mission Cache Resume

## Summary

Fix a workspace chat cache bug where a mission created via the new-mission flow can keep its `isNew` flag after later navigation, causing message history replay to be skipped.

## Root Cause

`ChatPane` caches `ChatInstance` entries so mission switches stay warm. New missions are inserted with `isNew: true` from `location.state`. When the user later navigates away and returns through normal mission navigation, the cached entry is reused without clearing `isNew`.

`ChatInstance` passes that flag into `useChatWebSocket`; while `isNewChat` remains true, the hook sends `mission:set-context` but does not send `mission:resume-agents`. The server still has the Codex session/JSONL history, but the message pane never receives the replay batch.

## Impact

Only cached workspace mission navigation is affected. Existing JSONL history and server replay remain intact.

## Fix

When `ChatPane` reuses a cached mission entry from a non-new navigation, clear the cached `isNew` marker before rendering `ChatInstance`.
