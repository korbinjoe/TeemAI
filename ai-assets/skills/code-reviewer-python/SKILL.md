---
name: code-reviewer-python
description: >
  Python code review skill. Focused on systematic review of Python idioms and Web frameworks,
  covering Pythonic style, type annotations, async programming, error handling, Django/Flask frameworks,
  performance optimization, and security. Use this skill when reviewing .py files.
  Applicable to Django, Flask, FastAPI and other Python Web projects and data processing scripts.
allowed-tools: Read,Grep,Glob,Bash
---

## Positioning

Focused on **Python idioms and Web framework** review. Checks Pythonic coding, type safety, and async correctness.

Python philosophy (The Zen of Python) emphasizes readability and simplicity. Review focuses on whether code is "Pythonic."

**Execution timing**: When reviewing `.py` files
**Scan scope**: Specified files, or file list obtained via `git diff`

---

## Review Process

### Step 1: Determine Review Scope

1. Files or directories explicitly specified by user
2. User mentions PR or branch → run `git diff --name-only <base>..HEAD`
3. None of the above → ask user which files to review

Only review `.py` files. Skip test files (`test_*.py` / `*_test.py`),
migration files (`migrations/`), and auto-generated code.

### Step 2: Per-file Review

Read the complete file content first, understand context, then check each item.

### Step 3: Summary Report

Generate a structured report using the output template at the bottom.

---

## Review Checklist

### 1. Pythonic Style

Pythonic code is more concise, efficient, and aligned with community expectations.

**Check items**:
- List comprehensions vs explicit loops — prefer comprehensions for simple transformations, loops for complex logic
- Whether context managers (`with` statement) are used for files/connections/locks
- Whether `dataclass` or `NamedTuple` is used instead of plain class for data containers
- Whether f-strings are used for string formatting (rather than `%` or `.format()`)
- Whether `enumerate()` is used instead of manual counting
- Whether `pathlib.Path` is used instead of `os.path` string operations
- Whether `zip()` is used for parallel iteration over multiple sequences
- Whether conditional expressions use `x if cond else y` (suitable for simple cases)

### 2. Type Annotations

Python 3.5+ type annotations improve code readability and IDE support.

**Check items**:
- Whether public function parameters and return values have type annotations
- Whether `Optional[X]` is used when value can be `None`
- Whether `Union` or `X | Y` (Python 3.10+) handles multiple types
- Whether generic containers are annotated (`list[int]` rather than bare `list`)
- Whether `TypeVar` and `Generic` are used correctly
- Whether `TypedDict` is used to annotate dictionary structures
- Whether Callable types annotate parameters and return values
- Whether `# type: ignore` suppresses checks that shouldn't be suppressed

### 3. Async Programming

Python asyncio has unique pitfalls and best practices.

**Check items**:
- Whether blocking functions are called in `async def` (e.g., `time.sleep`, synchronous IO) → use `asyncio.sleep`, `aiofiles`
- Whether `await` is used correctly (forgetting await yields a coroutine object, not a result)
- Concurrency control — `asyncio.gather` vs `asyncio.TaskGroup` (Python 3.11+)
- Whether `asyncio.Semaphore` is used to limit concurrency
- Whether async context managers (`async with`) are used correctly
- Whether `requests` library is used in async functions → use `httpx` or `aiohttp`
- Whether event loop is managed correctly (don't `asyncio.run()` in library code)

### 4. Error Handling

Python's exception handling flexibility also brings abuse risk.

**Check items**:
- Whether bare `except:` is used → at least use `except Exception:` (don't catch KeyboardInterrupt etc.)
- Whether exceptions are swallowed (except block is empty or only has `pass`)
- Whether exception messages include useful context (`raise ValueError(f"Invalid user_id: {uid}")`)
- Whether `raise ... from ...` is used to preserve exception chains
- Whether custom exceptions inherit appropriate base classes (`ValueError`, `RuntimeError`, etc.)
- Whether the full `try/except/else/finally` structure is used
- Whether `except` catches overly broad exception types

### 5. Django/Flask Frameworks

Framework-specific patterns and anti-patterns. See [Django/Flask Patterns Reference](references/django-flask-patterns.md).

**Check items**:
- Django ORM — whether N+1 queries exist → use `select_related` / `prefetch_related`
- Django ORM — whether `.save()` is called in a loop → use `bulk_create` / `bulk_update`
- Django — whether view functions properly use `@login_required` and similar decorators
- Flask — whether route functions return correct response format (status code, content type)
- FastAPI — whether Pydantic models properly define request/response schemas
- FastAPI — whether dependency injection is used correctly (`Depends`)
- Middleware — whether it impacts request processing performance (e.g., heavy queries on every request)

### 6. Performance

The key to Python performance optimization is choosing appropriate data structures and avoiding unnecessary computation.

**Check items**:
- Whether generators (`yield`) are used instead of lists for processing large datasets
- Data structure choice — use `set`/`dict` for frequent lookups rather than `list`
- Whether unnecessary data copies exist (`deepcopy` on hot paths)
- GIL impact — whether CPU-intensive tasks consider multiprocessing rather than multithreading
- String concatenation — use `str.join()` rather than `+` for large concatenations
- Whether repeated imports or computations exist in loops
- Whether `lru_cache` / `functools.cache` is used for pure function caching
- Whether large file processing uses line-by-line reading rather than `read()`

### 7. Security

Python Web application security review dimensions.

**Check items**:
- SQL injection — whether SQL strings are concatenated → use parameterized queries or ORM
- Template injection — whether `|safe` filter is used on user input in Jinja2 templates
- Pickle deserialization — whether untrusted data is deserialized (`pickle.loads(user_data)` can execute arbitrary code)
- Path traversal — whether file paths contain user input → validate and normalize
- `eval()` / `exec()` — whether dynamic code execution is used → almost always a security risk
- YAML — whether `yaml.safe_load()` is used rather than `yaml.load()`
- Sensitive information — whether secrets are hardcoded → use environment variables or config files
- Django — whether `SECRET_KEY` is exposed in code, whether `DEBUG` is True in production

---

## Review Output Format

```markdown
## Code Review Report — Python

### Review Scope
- `app/views/user.py` (modified)
- `app/services/order.py` (new)

### Review Summary
> One or two sentences summarizing overall code quality and main issues

### Issues Found

#### [P0] Must Fix (affects correctness or security)
1. **[SQL injection]** `db/queries.py:34` — uses f-string to concatenate SQL query,
   should use parameterized query `cursor.execute("... WHERE id = %s", (id,))`
2. **[Pickle]** `cache/loader.py:12` — deserializes user-uploaded data,
   attacker can execute arbitrary code via crafted pickle

#### [P1] Suggested Improvements (affects maintainability or performance)
1. **[N+1 query]** `views/order.py:56` — queries related users one by one in a loop,
   should use `select_related('user')`
2. **[Type annotations]** `services/payment.py:23` — public function lacks type annotations,
   parameter and return types are unclear

#### [P2] Nice to Have (polish)
1. **[Style]** `utils/helper.py:45` — string formatting uses `.format()`,
   suggest unifying to f-strings

### Highlights
> List what's done well in the code (optional)
```
