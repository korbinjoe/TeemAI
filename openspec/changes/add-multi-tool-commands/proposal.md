# Proposal: Unified AI Tool Command Palette

## Summary

Extend the chat input area's `/` command system to include commands from all common AI Coding tools (Claude Code, Cursor, Windsurf, Aider, etc.), creating a **unified command palette** where users don't need to know which tool a command belongs to.

## Motivation

Power users work across multiple AI Coding tools. Each has its own slash commands (`/explain`, `/fix`, `/add`, `/compact`). OpenTeam as the "AI super-individual OS" should present a single, merged command surface — users type `/` and see ALL available commands regardless of origin tool.

Currently only Claude Code's commands are shown. Commands from Cursor (`/explain`, `/fix`), Aider (`/add`, `/drop`, `/run`), Windsurf (`/test`) etc. are invisible.

## Goals

1. **Single `/` trigger** shows a merged command list from all supported AI tools
2. **`:` for hierarchy only** — multi-level commands use colon (e.g., `/figma:generate-design`), NOT for tool namespacing
3. **Source badge** — each command shows a subtle origin badge so users know which tool provides it
4. **Conflict resolution** — when multiple tools share the same command name, show all with tool badge disambiguation
5. **Extensible** — easy to add new tool command sets via registry

## Non-Goals

- Implementing command logic (pass-through to CLI session)
- Tool namespacing syntax (`/cursor:xxx` is NOT the pattern)
- Supporting tools without CLI interface

## Approach

### Unified Flat Command List

```
/compact      [Claude Code]   Compress conversation
/explain      [Cursor]        Explain selected code  
/fix          [Cursor]        Fix selected code
/add          [Aider]         Add file to context
/drop         [Aider]         Remove file from context
/run          [Aider]         Run shell command
/test         [Windsurf]      Generate tests
/figma:use    [Figma]         Multi-level sub-command
```

### Hierarchy with `:`

Colon is reserved for grouping sub-commands under a parent category:

```
/figma:use
/figma:generate-design
/figma:create-new-file
```

This is NOT tool namespacing — it's command hierarchy. A tool that has many commands MAY group them under a prefix.

### Conflict Handling

When two tools share the same command name (e.g., both Cursor and Windsurf have `/explain`):
- Show both in the menu with tool badges
- User selects which one to execute
- Most recently used tool gets priority (sorted higher)

## Risks

| Risk | Mitigation |
|------|-----------|
| Command name collisions | Show both with tool badge; sort by recency |
| Menu gets too long | Group by category; show most relevant first based on active session |
| Stale command lists | Static registry updated with releases; dynamic discovery in v2 |
