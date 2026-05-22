# Tasks: Unified AI Tool Command Palette

## Phase 1: Command Registry

- [x] Create `web/lib/commandRegistry.ts` — define `CommandDef` type and `COMMAND_REGISTRY` array with commands from Claude Code, Cursor, Aider, Windsurf, Codex
- [x] Create `filterCommands()` — fuzzy filter + active-tool-first sorting
- [x] Include colon-hierarchy support in filter (e.g. `/figma:` filters to figma group)

## Phase 2: Menu Enhancement

- [x] Extend `SlashCommandMenu.tsx` — accept `CommandDef[]` instead of `string[]`, render tool badge per row
- [x] Update `InputArea.tsx` — replace inline `filteredCmds` with `filterCommands(value, mergedRegistry, 'claude')`
- [x] Merge dynamic `slashCommands` from WebSocket with static registry via `mergeWithDynamicCommands()`
- [x] Verify existing behavior unchanged — Props interface (`slashCommands: string[]`) preserved

## Phase 3: Polish

- [x] Handle command conflicts — same-name commands from different tools show with distinct badges
- [x] Tool badge colors per tool (orange/blue/green/teal/purple)
- [x] TypeScript strict check passes with zero errors

## Dependencies

- Phase 2 depends on Phase 1 ✓
- Phase 3 is independent polish ✓
