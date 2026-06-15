---
name: code-reviewer-typescript
description: >
  TypeScript code review skill. Focused on systematic review of TypeScript language-level type system,
  generics design, module organization, and error handling patterns. Covers type safety, generic constraints,
  interface design, module system, and runtime validation. Use this skill when reviewing .ts files (non-React components).
  Applicable to pure TypeScript projects, Node.js backend TS code, utility libraries, etc.
allowed-tools: Read,Grep,Glob,Bash
---

## Positioning

Focused on **TypeScript language-level** type system and code structure review. Checks whether types are rigorous, designs are sound, and modules are clear.

Difference from `code-reviewer-react`: React skill focuses on component design and Hooks; this skill focuses on TS type gymnastics and module design.
Difference from `code-reviewer-nodejs`: Node.js skill focuses on runtime behavior; this skill focuses on compile-time type safety.

**Execution timing**: When reviewing `.ts` files (non-React components)
**Scan scope**: Specified files, or file list obtained via `git diff`

---

## Review Process

### Step 1: Determine Review Scope

Determine files to review by priority:

1. Files or directories explicitly specified by user
2. User mentions PR or branch → run `git diff --name-only <base>..HEAD` to get changed files
3. User says "look at recent changes" → run `git diff --name-only HEAD~1`
4. None of the above → ask user which files to review

Only review `.ts` files. Skip test files (`*.test.*` / `*.spec.*`), type declaration files (`*.d.ts`), and config files.
For `.tsx` files, use the `code-reviewer-react` skill instead.

### Step 2: Per-file Review

Read the complete file content first, understand context, then check each item. Execute the following review items for each file.

### Step 3: Summary Report

Generate a structured report using the output template at the bottom.

---

## Review Checklist

### 1. Type Safety

The type system is TypeScript's core value — loose types mean giving up compile-time protection.

**Check items**:
- Using `any` type → replace with specific type or `unknown`
- Using non-null assertion `!` → use optional chaining `?.` or type guards instead
- Using type assertion `as` to bypass checks → check if there's a safer type narrowing approach
- Whether `unknown` is properly narrowed after use (typeof / instanceof / custom type guards)
- Function parameters and return values have explicit types (exported functions must have explicit annotations)
- Whether implicit `any` exists (e.g., unannotated callback parameters, destructured assignments)

### 2. Generics Design

Generics are a powerful tool for code reuse, but overuse increases comprehension cost.

**Check items**:
- Whether generic parameters have reasonable constraints (`extends` restrictions)
- Whether unnecessary generics exist (a generic parameter used only once can be replaced with a concrete type)
- Whether conditional types are overly complex (more than 3 levels of nesting should be simplified or split)
- Whether generic parameter naming is semantic (`T` is fine, but `T, U, V, W` — four of them — need meaningful names)
- Whether utility types (Partial/Pick/Omit/Record) are used appropriately
- Whether runtime type information is needed but generics can't provide it (type erasure issue)

### 3. Interface & Type Design

Good type definitions are the foundation of code maintainability.

**Check items**:
- Whether `interface` vs `type` usage is appropriate (interface for object shapes and inheritance, type for union/intersection/mapped types)
- Whether discriminated unions are used for polymorphic scenarios
- Whether enums are reasonable → prefer `const enum` or string union types
- Whether optional properties `?` are truly optional (or just avoiding handling undefined)
- Whether interfaces are too large → consider splitting into smaller composable interfaces
- Whether type naming is semantic (avoid meaningless names like `IData`, `DataType`)

### 4. Module System

Clear module boundaries are the lifeline of large TypeScript projects.

**Check items**:
- Whether barrel exports (`index.ts` unified exports) are reasonable → avoid exporting internal implementation details
- Whether circular dependencies exist → check import chains
- Whether re-export depth is too deep (more than 2 levels of re-export increases tracing difficulty)
- Whether side-effect imports exist (`import './setup'`) → confirm necessity and add comments
- Whether path alias configuration matches actual directory structure
- Whether unused imports exist

### 5. Error Handling

TypeScript's type system can help build more robust error handling.

**Check items**:
- Whether async functions have try-catch or `.catch()` handling
- Whether Result pattern (`{ ok: true, data } | { ok: false, error }`) is used for predictable failures
- Whether custom error classes extend Error and have meaningful messages
- Whether Promise chains have complete error handling (no dangling Promises)
- Whether type guard functions (`is` assertions) correctly cover all cases
- Whether `never` type is used for exhaustiveness checking (switch default branch)

### 6. Code Standards & Readability

Readable TypeScript code makes types serve as documentation rather than burden.

**Check items**:
- Whether functions use early return to avoid deep nesting
- Whether variable/function naming is semantically clear
- Whether `const` assertions are used in appropriate places (`as const`)
- Whether `satisfies` operator is used where needed (type checking while preserving type inference)
- Whether magic numbers/strings are extracted as named constants
- Whether in-file code organization is logical (type definitions → constants → functions → exports)
- Whether complex types have comments explaining their purpose

### 7. Security

When external data enters a TypeScript system, compile-time types don't equal runtime safety.

**Check items**:
- Whether API response data has runtime validation (zod/io-ts/ajv etc.) rather than just `as` assertions
- Whether user input is validated and sanitized at system boundaries
- Whether sensitive data (tokens, passwords) has branded type marking to prevent misuse
- Whether `eval()` or `new Function()` is used → almost always a security risk
- Whether `JSON.parse` results are type-validated
- Whether external library type declarations (`@types/*`) versions match the library versions

---

## Review Output Format

```markdown
## Code Review Report — TypeScript

### Review Scope
- `path/to/file1.ts` (new / modified)
- `path/to/file2.ts` (modified)

### Review Summary
> One or two sentences summarizing overall code quality and main issues

### Issues Found

#### [P0] Must Fix (affects correctness or security)
1. **[Type safety]** `api.ts:47` — response data uses `as any` to bypass type checks,
   should use zod schema for runtime validation
2. **[Error handling]** `service.ts:23` — async function has no try-catch,
   Promise rejection becomes unhandled rejection

#### [P1] Suggested Improvements (affects maintainability or performance)
1. **[Generics design]** `utils.ts:12` — generic parameter `T` has no constraints,
   callers can pass any type, suggest adding `extends Record<string, unknown>`
2. **[Module]** `index.ts:5` — barrel export exposes internal implementation functions,
   should only export public API

#### [P2] Nice to Have (polish)
1. **[Naming]** `types.ts:8` — `IUserData` uses I prefix,
   TypeScript community convention doesn't use Hungarian notation

### Highlights
> List what's done well in the code (optional)
- Discriminated unions used properly, state branch handling is complete
- Custom type guards are cleanly encapsulated
```
