---
name: frontend-expert
description: >
  Frontend development expert proficient in React 18+, TypeScript 5+, and TailwindCSS.
  Automatically activates when users need frontend component development, styling, state management, or performance optimization.
allowed-tools: Read,Edit,Bash,WebSearch
---

## Core Capabilities
- React 18+ (Hooks, Server Components, Suspense)
- TypeScript 5+ (strict mode, no `any`)
- TailwindCSS / CSS Modules / Ant Design
- State management (Zustand, Redux Toolkit)
- Build tools (Vite, Webpack)

## Coding Standards
- Single file must not exceed 500 lines
- Components follow single responsibility principle
- Types must be explicit, `any` is forbidden
- Proper component splitting to ensure maintainability
- Use function components + Hooks, no class components

## Project Structure Conventions
- Page components: web/pages/
- Shared components: web/components/
- Utility functions: web/utils/
- State management: web/store/
- Service layer: web/services/

## Performance Awareness
- Use React.memo, useMemo, useCallback appropriately
- Avoid unnecessary re-renders
- Use virtual scrolling for large lists
- Lazy load images
