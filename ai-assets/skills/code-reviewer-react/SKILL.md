---
name: code-reviewer-react
description: >
  React frontend code review skill. Systematically reviews React + JSX/TSX component code,
  covering component design, Hook usage, render performance, Props typing, error boundaries, and frontend security.
  Use this skill when reviewing .tsx/.jsx files or .ts/.js files containing React component code.
  Applicable to React 18+, function components + Hooks pattern projects.
allowed-tools: Read,Grep,Glob,Bash
---
## Positioning

Focused on **logic and structure review** of React + TypeScript frontend code. Checks whether code is correct, robust, and maintainable.

Difference from `code-audit`: `code-audit` focuses on CSS/styling/visual aspects (spacing, colors, responsiveness);
this skill focuses on JS/TS logic (component design, types, Hooks, performance, error handling).

**Execution timing**: After code submission, before merge; or when user explicitly requests review
**Scan scope**: Specified files, or file list obtained via `git diff`

---

## Review Process

### Step 1: Determine Review Scope

Determine files to review by priority:

1. Files or directories explicitly specified by user
2. User mentions PR or branch → run `git diff --name-only <base>..HEAD` to get changed files
3. User says "look at recent changes" → run `git diff --name-only HEAD~1` to get last commit changes
4. None of the above → ask user which files to review

Only review `.ts` / `.tsx` / `.js` / `.jsx` files. Skip test files (`*.test.*` / `*.spec.*`),
type declaration files (`*.d.ts`), and config files.

### Step 2: Per-file Review

Read the complete file content first, understand context, then check each item. Don't just look at the diff —
local changes may introduce problems in the global context. Execute the following review items for each file.

### Step 3: Summary Report

Generate a structured report using the output template at the bottom.

---

## Review Checklist

### 1. Component Design

Good components are highly cohesive and loosely coupled. Check whether components have single responsibility and clear interfaces.

**Check items**:
- Single component exceeds 300 lines → suggest splitting into sub-components
- More than 8 Props → may need consolidation into an object or component splitting
- Components defined inside other components (nested definitions) → recreated every render, causing state loss
- Prop drilling (props passed through 2+ layers) → consider Context or composition patterns
- Component handles both data fetching and UI rendering → suggest separating into container + presentational
- Unused props or imports

### 2. TypeScript Type Safety

The type system is a critical safeguard for frontend code reliability. Loose types let bugs slip through at compile time.

**Check items**:
- Using `any` type → replace with specific type or `unknown`
- Using non-null assertion `!` → use optional chaining `?.` or type guards instead
- Function parameters and return values have explicit types (arrow functions can rely on inference, but exports should be annotated)
- Interface/type naming is semantic (avoid meaningless names like `IData`, `DataType`)
- Event handler `event` parameters have correct types (`React.MouseEvent<HTMLButtonElement>` not `any`)
- API response data has defined types (not `as any`)

### 3. React Hook Usage

Hook misuse is a high-frequency bug zone, especially dependency arrays and closure traps.

**Check items**:
- `useEffect` dependency array is complete — missing deps cause closures to capture stale values
- `useEffect` has cleanup function — subscriptions, timers, event listeners must be removed in cleanup
- `useMemo` / `useCallback` has real value — using on primitives or simple computations is redundant
- `useState` initial values are reasonable — arrays use `[]`, objects use `null` (not `{}`), booleans use `false`
- Hooks are not called inside conditionals or loops (violates Rules of Hooks)
- Custom Hooks start with `use`

### 4. Performance Issues

No need for extreme optimization, but avoid obvious performance problems.

**Check items**:
- Object/array literals created in render function as props (new reference every render)
  ```tsx
  // Problem: new array created every render
  <Select options={['a', 'b', 'c']} />

  // Fix: extract as constant
  const OPTIONS = ['a', 'b', 'c'] as const
  ```
- Using index as key in `map` (causes state confusion when list items are added/removed/reordered)
- Large lists consider virtual scrolling (100+ items)
- Unnecessary re-renders — e.g., parent state change causing unrelated child re-renders
- Expensive computations on render path (should use `useMemo`)

### 5. Error Handling & Edge Cases

Robust code handles exceptions gracefully instead of failing silently or showing blank screens.

**Check items**:
- Async operations (fetch/API calls) have try-catch or `.catch()`
- Non-2xx API response status codes are handled
- Optional chaining to deep properties has reasonable fallback values at the end
- Array operations (`.find()` / `.filter()` / `[0]`) consider empty array cases
- User input has basic validation (non-empty, format, length limits)
- Possible race conditions (rapid clicks, out-of-order responses)

### 6. Code Standards & Readability

Readable code reduces comprehension and maintenance costs.

**Check items**:
- Functions use early return to avoid deep nesting
- Variable/function naming is semantically clear (avoid `data1`, `temp`, `handleClick2`)
- Event handlers use `handle` prefix
- Duplicated code can be extracted into utility functions or custom Hooks
- Magic numbers/strings are extracted as named constants
- Complex logic has necessary comments explaining **why** (not **what**)
- In-file code organization is logical (type definitions → constants → Hooks → components → exports)

### 7. Security

Frontend security cannot be ignored, especially with user input and sensitive data.

**Check items**:
- Using `dangerouslySetInnerHTML` → must ensure content is sanitized
- URL concatenation prevents XSS (check protocol when user input is used as `href`)
- Sensitive info stored in frontend (token in localStorage — confirm if there's a more secure approach)
- Third-party data display has proper escaping
- Form submissions have CSRF protection

---

## Review Output Format

```markdown
## Code Review Report

### Review Scope
- `path/to/file1.tsx` (new / modified)
- `path/to/file2.tsx` (modified)

### Review Summary
> One or two sentences summarizing overall code quality and main issues

### Issues Found

#### [P0] Must Fix (affects correctness or security)
1. **[Missing Hook dep]** `useChat.ts:47` — `useEffect` missing `userId` dependency,
   closure captures initial value, still uses old ID for requests after user switch
2. **[Security]** `UserProfile.tsx:23` — `dangerouslySetInnerHTML` without content sanitization

#### [P1] Suggested Improvements (affects maintainability or performance)
1. **[Oversized component]** `Dashboard.tsx` is 450 lines, suggest splitting chart area and filters
   into independent sub-components
2. **[Loose types]** `api.ts:12` — response data uses `any`, suggest defining interface types

#### [P2] Nice to Have (polish)
1. **[Naming]** `utils.ts:8` — `processData` is too generic, suggest `formatChartSeries`

### Highlights
> List what's done well in the code (optional, but helps positive feedback)
- `useDebounce` Hook is cleanly encapsulated with good reusability
- Error boundary handling is thorough, user experience friendly
```

---

## Collaboration with Other Skills

```
Code implementation → [code-reviewer] → fix logic issues
                   → [code-audit]   → fix styling issues
                   → screenshot → [ui-review] → visual verification
```

`code-reviewer` focuses on code logic, `code-audit` on style standards, `ui-review` on visual fidelity.
The three are complementary — recommended to execute sequentially after code completion.

---

## OpenSpec Collaboration

Write review reports to the OpenSpec change's review.md:
- Path: `openspec/changes/<current change>/review.md` "Code Review" section
- Format: Use this Skill's standard output format ([P0]/[P1]/[P2] three levels)
- Timing: After review completion
