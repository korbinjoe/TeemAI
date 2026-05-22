---
name: code-reviewer-go
description: >
  Go code review skill. Focused on systematic review of Go idioms and concurrency patterns,
  covering error handling, goroutine safety, interface design, resource management, code style,
  performance optimization, and security. Use this skill when reviewing .go files.
  Applicable to Go Web services (Gin/Echo/Chi), CLI tools, microservices, etc.
allowed-tools: Read,Grep,Glob,Bash
---

## Positioning

Focused on **Go idioms and concurrency patterns** review. Checks error handling, goroutine safety, and interface design.

Go philosophy emphasizes simplicity and explicitness. Review focuses on whether code follows the "Go way."

**Execution timing**: When reviewing `.go` files
**Scan scope**: Specified files, or file list obtained via `git diff`

---

## Review Process

### Step 1: Determine Review Scope

1. Files or directories explicitly specified by user
2. User mentions PR or branch → run `git diff --name-only <base>..HEAD`
3. None of the above → ask user which files to review

Only review `.go` files. Skip test files (`*_test.go`) and auto-generated code (`*.pb.go`, `*_gen.go`).

### Step 2: Per-file Review

Read the complete file content first, understand context, then check each item.

### Step 3: Summary Report

Generate a structured report using the output template at the bottom.

---

## Review Checklist

### 1. Error Handling

Go's explicit error handling is a core language feature — error handling quality directly determines code reliability.

**Check items**:
- Whether function-returned errors are ignored (`val, _ := fn()` is usually a bug in production code)
- Whether errors are wrapped with `fmt.Errorf("context: %w", err)` to preserve the chain
- Whether sentinel errors are defined (`var ErrNotFound = errors.New("not found")`) for error type checking
- Whether `errors.Is()` / `errors.As()` is used for error checking rather than string comparison
- Whether panics are correctly handled in goroutines (`recover` in a defer)
- Whether error messages start with lowercase and don't end with punctuation (Go convention)
- Whether `log.Fatal` / `os.Exit` exists in library code (should only be in main or init)

### 2. Concurrency Safety

Go's goroutines and channels are its most powerful yet most dangerous features.

**Check items**:
- Whether goroutines have an exit mechanism → must have context cancellation or done channel
- Goroutine leaks — whether there's a guaranteed exit condition after launch (select + ctx.Done())
- Whether channels are correctly closed — only closed by sender, never by receiver
- Whether concurrent reads/writes to shared variables exist → use sync.Mutex or channel serialization
- Whether sync.WaitGroup is used correctly — `Add` called outside goroutine, `Done` in internal defer
- Whether sync.Once is used for one-time initialization
- Whether select has a default branch causing busy waiting (busy loop)
- Whether context is properly propagated (from main → handler → service → repo layer by layer)

### 3. Interface Design

Go's interfaces are implicitly implemented — small, precise interfaces are the essence of Go design.

**Check items**:
- Whether interfaces are small enough (interfaces with more than 5 methods → consider splitting)
- Whether "Accept interfaces, return structs" principle is followed
- Whether interface pollution exists (interfaces defined that nobody implements)
- Whether interfaces are defined at the consumer side (not the provider) → Go convention
- Whether empty interface `interface{}` / `any` is used → prefer generics or concrete types
- Whether interface naming follows the -er suffix convention (Reader, Writer, Closer)

### 4. Resource Management

Go has no destructors — resource management relies entirely on defer and explicit closing.

**Check items**:
- Whether opened files/connections/response bodies have `defer xxx.Close()`
- Whether defer close is after error checking (`f, err := os.Open(); if err != nil ... ; defer f.Close()`)
- Whether HTTP response `resp.Body` is closed (must close even if content isn't read)
- Whether context's cancel function is called (`ctx, cancel := context.WithTimeout(); defer cancel()`)
- Whether database connections/transactions are properly rolled back or committed
- Whether temporary files are cleaned up

### 5. Code Style

Go has strong community coding conventions — deviation reduces code readability.

**Check items**:
- Whether naming follows Go conventions — mixedCaps (not snake_case), acronyms all caps (`URL`, `HTTP`, `ID`)
- Whether exported functions/types have godoc comments (complete sentences starting with the name)
- Whether package names are short, all lowercase, single word
- Whether `init()` functions are necessary → prefer explicit initialization
- Whether excessive nesting exists → use early return to reduce indentation
- Whether error variables are named `err` (or with prefix like `decodeErr`)
- Whether method receiver names are the lowercase first letter of the type (e.g., `func (s *Server)` not `func (server *Server)`)

### 6. Performance

Go provides low-level control capability, but details can easily cause performance loss.

**Check items**:
- Whether slices pre-allocate capacity (`make([]T, 0, expectedLen)` to avoid repeated expansion)
- Whether `string` and `[]byte` convert frequently → consider unifying to one type on hot paths
- Whether memory is frequently allocated in loops → consider `sync.Pool`
- Whether JSON serialization/deserialization is on hot paths → consider `json-iterator` or code generation
- Whether maps pre-allocate (`make(map[K]V, expectedLen)`)
- Whether regular expressions are compiled once and reused (`regexp.MustCompile` in package-level variables)
- Whether `strings.Builder` is used rather than `+` for string concatenation

### 7. Security

Security review dimensions for Go backend services.

**Check items**:
- Race conditions — whether detected via `go vet -race` or `-race` flag
- SQL injection — whether database queries use parameterized queries (`db.Query("... WHERE id = ?", id)`)
- Command injection — whether `exec.Command` concatenates user input → use argument list
- Path traversal — whether `filepath.Clean` and `filepath.Join` are used correctly
- unsafe package — whether `unsafe.Pointer` is used → must have sufficient justification and comments
- HTTPS — whether HTTP client disables certificate verification (`InsecureSkipVerify: true`)
- Sensitive information — whether secrets or passwords are hardcoded

---

## Review Output Format

```markdown
## Code Review Report — Go

### Review Scope
- `internal/handler/user.go` (modified)
- `pkg/worker/pool.go` (new)

### Review Summary
> One or two sentences summarizing overall code quality and main issues

### Issues Found

#### [P0] Must Fix (affects correctness or security)
1. **[Goroutine leak]** `worker/pool.go:45` — goroutine launched with no exit condition,
   missing select + ctx.Done() exit mechanism
2. **[Error ignored]** `handler/user.go:23` — error returned by `json.Unmarshal` is ignored with `_`

#### [P1] Suggested Improvements (affects maintainability or performance)
1. **[Slice pre-allocation]** `service/order.go:67` — loop append without pre-allocated capacity,
   suggest `make([]Order, 0, len(ids))`
2. **[Interface too large]** `repo/interface.go:12` — Repository interface has 12 methods,
   suggest splitting into Reader and Writer by read/write

#### [P2] Nice to Have (polish)
1. **[Naming]** `utils/helper.go:8` — package name `utils` is too broad,
   suggest renaming by function (e.g., `timeutil`, `httputil`)

### Highlights
> List what's done well in the code (optional)
```
