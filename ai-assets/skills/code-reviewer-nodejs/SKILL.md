---
name: code-reviewer-nodejs
description: >
  Node.js backend code review skill. Focused on systematic review of Node.js runtime characteristics,
  covering async patterns, event loop, stream processing, middleware design, process management, error handling, and security.
  Use this skill when reviewing Node.js backend code (Express/Koa/Fastify routes, middleware, service layer,
  utility scripts in .ts/.js/.mjs/.cjs files).
  Applicable to Express, Koa, Fastify, NestJS and other Node.js backend frameworks.
allowed-tools: Read,Grep,Glob,Bash
---

## Positioning

Focused on **Node.js runtime and backend development patterns** review. Checks async correctness, resource management, and middleware design.

Difference from `code-reviewer-typescript`: TS skill focuses on compile-time type system; this skill focuses on runtime behavior.
Difference from `code-reviewer-react`: React skill focuses on frontend components; this skill focuses on backend services.

**Execution timing**: When reviewing Node.js backend code (routes, middleware, service layer, CLI tools, etc.)
**Scan scope**: Specified files, or file list obtained via `git diff`

---

## Review Process

### Step 1: Determine Review Scope

1. Files or directories explicitly specified by user
2. User mentions PR or branch → run `git diff --name-only <base>..HEAD`
3. None of the above → ask user which files to review

Only review backend-related `.ts` / `.js` / `.mjs` / `.cjs` files.
Skip test files, type declarations, config files, and frontend component files.

### Step 2: Per-file Review

Read the complete file content first, understand context, then check each item.

### Step 3: Summary Report

Generate a structured report using the output template at the bottom.

---

## Review Checklist

### 1. Async Patterns

Node.js's async model is its core characteristic — incorrect async handling is the primary source of backend bugs.

**Check items**:
- Whether async/await has complete try-catch error handling
- Whether unawaited Promises exist (fire-and-forget must explicitly state intent)
- Whether Promise concurrency is appropriate — `Promise.all` vs `Promise.allSettled` choice
- Whether callback hell exists (callbacks nested more than 3 levels deep) → refactor to async/await
- Whether errors in `Promise.all` would cause other task results to be lost → consider `allSettled`
- Concurrency control — whether concurrency limits are needed (e.g., batch API calls)

### 2. Event Loop

Blocking the event loop is a fatal issue for Node.js services.

**Check items**:
- Whether synchronous blocking operations (`fs.readFileSync`, `crypto.pbkdf2Sync`, etc.) exist in request handling paths
- Whether CPU-intensive tasks consider Worker Threads or process pools
- Whether `process.nextTick` vs `setImmediate` usage is correct
- Whether large loops or recursion could block the event loop
- Whether timers (`setInterval`/`setTimeout`) have cleanup mechanisms
- Whether event listener leaks exist (EventEmitter maxListeners warning)

### 3. Streams & Buffers

Stream processing is key to Node.js's efficient handling of large data.

**Check items**:
- Whether large files use stream processing rather than reading entirely into memory
- Whether readable and writable streams are properly piped (backpressure handling)
- Whether Buffer allocation uses `Buffer.alloc()` rather than unsafe `Buffer.allocUnsafe()`
- Whether stream error events are listened to (unhandled errors crash the process)
- Whether streams are properly destroyed after use (`stream.destroy()`)
- Whether encoding handling is consistent (UTF-8 vs Buffer)

### 4. Middleware & Routing

Middleware architecture is the core pattern of Express/Koa. See [Express Patterns Reference](references/express-patterns.md).

**Check items**:
- Whether middleware order is correct (e.g., body-parser before routes, error handling last)
- Whether error-handling middleware has 4 parameters (`err, req, res, next`)
- Whether any middleware forgets to call `next()` (request will hang)
- Whether route handlers return a response (avoiding response hanging)
- Whether async middleware errors are caught and passed to `next(err)`
- Whether routes have parameter validation (e.g., `req.params.id` format validation)

### 5. Process Management

Node.js application process management directly affects reliability.

**Check items**:
- Whether child process (`child_process`) stdin/stdout/stderr are properly handled
- Whether child processes have timeout mechanisms to prevent zombie processes
- Whether `SIGTERM`/`SIGINT` are listened for to implement graceful shutdown
- Whether graceful shutdown closes database connections, HTTP servers, file handles
- Whether `cluster` mode has worker crash restart mechanisms
- Whether `exec` vs `execFile` vs `spawn` choice is secure (`exec` has shell injection risk)

### 6. Error Handling

Backend error handling directly affects service availability and debugging efficiency.

**Check items**:
- Whether `process.on('unhandledRejection')` global handler is registered
- Whether `process.on('uncaughtException')` global handler is registered
- Whether HTTP error responses have a unified format (status code + error message + error code)
- Whether error logs include sufficient context (request ID, user ID, stack trace)
- Whether error-swallowing catch blocks exist (catch with only `console.log` or empty block)
- Whether third-party service calls have retry and fallback strategies

### 7. Security

Backend security is the bottom line — one vulnerability can compromise the entire system.

**Check items**:
- Command injection — whether `child_process.exec()` concatenates user input → use `execFile` + argument array
- Path traversal — whether file operation paths include user input → validate and normalize paths
- SQL/NoSQL injection — whether database queries use parameterized queries
- Dependency security — whether there are dependencies with known vulnerabilities (npm audit)
- Environment variables — whether sensitive config uses environment variables rather than hardcoding
- CORS — whether cross-origin configuration is too permissive (`Access-Control-Allow-Origin: *`)
- Request body size — whether request body size is limited to prevent DoS

---

## Review Output Format

```markdown
## Code Review Report — Node.js

### Review Scope
- `path/to/router.ts` (modified)
- `path/to/service.ts` (new)

### Review Summary
> One or two sentences summarizing overall code quality and main issues

### Issues Found

#### [P0] Must Fix (affects correctness or security)
1. **[Command injection]** `utils.ts:34` — `exec()` directly concatenates user-input filename,
   attacker can inject arbitrary commands. Should use `execFile()` + argument array
2. **[Async error]** `handler.ts:56` — async route handler has no try-catch,
   exception would crash the Express process

#### [P1] Suggested Improvements (affects maintainability or performance)
1. **[Blocking operation]** `config.ts:12` — `fs.readFileSync` called in request handling path,
   should use `fs.readFile` or preload at startup
2. **[Error handling]** `app.ts` — missing `unhandledRejection` global handler

#### [P2] Nice to Have (polish)
1. **[Middleware]** `routes/index.ts:8` — route parameters have no format validation,
   suggest adding express-validator or zod validation

### Highlights
> List what's done well in the code (optional)
```
