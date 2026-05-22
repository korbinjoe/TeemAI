---
name: code-reviewer-java
description: >
  Java code review skill. Focused on systematic review of Java language and Spring ecosystem,
  covering OOP design, concurrency safety, Spring framework usage, exception handling, resource management,
  performance optimization, and security. Use this skill when reviewing .java files.
  Applicable to Spring Boot, MyBatis, JPA and other Java backend projects.
allowed-tools: Read,Grep,Glob,Bash
---

## Positioning

Focused on **Java language and Spring ecosystem** code review. Checks OOP design, concurrency correctness, and framework usage standards.

**Execution timing**: When reviewing `.java` files
**Scan scope**: Specified files, or file list obtained via `git diff`

---

## Review Process

### Step 1: Determine Review Scope

1. Files or directories explicitly specified by user
2. User mentions PR or branch → `git diff --name-only <base>..HEAD`
3. None of the above → ask user

Only review `.java` files. Skip test files (`*Test.java` / `*Spec.java`) and auto-generated code.

### Step 2: Per-file Review

Read the complete file content first, understand context, then check each item.

### Step 3: Summary Report

Generate a structured report using the output template at the bottom.

---

## Review Checklist

### 1. OOP Design

Java's core is object-oriented design. Good design makes code easy to extend and maintain.

**Check items**:
- Violates single responsibility principle (single class exceeds 500 lines → consider splitting)
- Overuse of inheritance → prefer composition (Composition over Inheritance)
- Interface follows interface segregation principle (don't have one interface with 10+ methods)
- God Class exists — taking on too many responsibilities
- Too many method parameters (over 5 → consider wrapping in parameter object)
- Design patterns used correctly (don't use patterns for patterns' sake)
- Overuse of static methods (may impact testability)

### 2. Concurrency Safety

Java multi-threading is a high-risk area. A concurrency bug may only surface in production.

**Check items**:
- Shared mutable state has synchronization protection (synchronized / Lock / Atomic)
- `synchronized` lock granularity is appropriate (too coarse impacts performance, too fine may miss coverage)
- `HashMap` in multi-threaded context → use `ConcurrentHashMap`
- `ArrayList` in multi-threaded context → use `CopyOnWriteArrayList` or synchronized wrapper
- `volatile` used correctly (only guarantees visibility, not atomicity)
- Thread pool configuration is reasonable (core threads, queue type, rejection policy)
- Deadlock risk exists (inconsistent lock acquisition order)
- `CompletableFuture` properly handles exceptions (`exceptionally` / `handle`)

### 3. Spring Framework

Spring is the de facto standard for Java backends. Framework misuse causes subtle bugs. See [Spring Patterns Reference](references/spring-patterns.md).

**Check items**:
- Bean scope is correct (injecting prototype Bean into singleton Bean causes issues)
- Circular dependencies exist (`@Lazy` annotation just bypasses the problem, doesn't solve it)
- `@Transactional` propagation level is correct (REQUIRED vs REQUIRES_NEW)
- `@Transactional` is not on private methods (won't take effect)
- `@Transactional` has rollbackFor config (default only rolls back RuntimeException)
- AOP is not overused (should aspect logic be explicit calls instead?)
- `@Autowired` vs constructor injection (recommend constructor injection)
- Config classes use `@ConfigurationProperties` instead of hardcoding

### 4. Exception Handling

Java's exception system is a double-edged sword — used well it's a safety net, used poorly it's noise.

**Check items**:
- Swallowing exceptions (catch block is empty or only has `e.printStackTrace()`)
- Checked exception usage is reasonable → don't `throws Exception` just to compile
- Custom exceptions have meaningful hierarchy (business exceptions vs system exceptions)
- Using `@ControllerAdvice` for global exception handling
- Catch block preserves original exception info (`throw new XxxException("msg", e)` preserves cause)
- Overly broad `catch(Exception e)` exists
- Finally block may throw exception that masks original exception

### 5. Resource Management

Java resource leaks are a common cause of memory issues and connection pool exhaustion.

**Check items**:
- IO operations use try-with-resources (InputStream, OutputStream, Connection, etc.)
- Database connections managed via connection pool (not manual `DriverManager.getConnection()`)
- JDBC ResultSet / Statement properly closed
- HttpClient is reused (not creating new instance per request)
- Thread pools shutdown on application close
- Temporary files are cleaned up
- Redis/MQ external connections have connection pool and timeout configuration

### 6. Performance

Java application performance issues are often in framework usage and IO, not algorithms.

**Check items**:
- N+1 queries — database queries in a loop → use batch queries or JOINs
- Serialization/deserialization cost — frequent JSON conversion on hot paths
- String concatenation — using `+` in loops → use `StringBuilder`
- Optional misuse — don't use Optional as method parameters or class fields
- Stream API — large collection operations consider `parallelStream` applicability
- Log levels — expensive string construction in debug logs (should use `log.debug("msg: {}", obj)` placeholders)
- Caching — repeated computations should be cached (`@Cacheable` or local cache)

### 7. Security

Java backend security is the baseline for enterprise applications.

**Check items**:
- SQL injection — MyBatis `${}` concatenation → use `#{}` parameterization; JPA raw SQL concatenation
- Deserialization vulnerabilities — directly deserializing untrusted data (ObjectInputStream)
- Sensitive information — passwords/keys hardcoded in code → use config center or Vault
- Log leakage — logs printing sensitive fields (passwords, tokens, ID numbers)
- SSRF — URL requests validate target address (prevent internal network probing)
- File upload — validates file type, size, path
- Authorization — API has `@PreAuthorize` or custom permission interceptors

---

## Review Output Format

```markdown
## Code Review Report — Java

### Review Scope
- `src/main/java/com/example/UserService.java` (modified)
- `src/main/java/com/example/OrderController.java` (new)

### Review Summary
> One or two sentences summarizing overall code quality and main issues

### Issues Found

#### [P0] Must Fix (affects correctness or security)
1. **[SQL Injection]** `UserMapper.xml:23` — using `${}` to concatenate orderBy field,
   should use whitelist validation or `#{}` parameterization
2. **[Concurrency]** `CacheManager.java:45` — HashMap multi-threaded read/write without sync,
   should replace with ConcurrentHashMap

#### [P1] Suggested Improvements (affects maintainability or performance)
1. **[N+1 Query]** `OrderService.java:67` — querying user info one by one in a loop,
   should use IN batch query
2. **[Transaction]** `PaymentService.java:34` — @Transactional without rollbackFor config,
   checked exceptions won't trigger rollback

#### [P2] Nice to Have (polish)
1. **[Injection style]** `UserController.java:12` — @Autowired field injection,
   suggest changing to constructor injection

### Highlights
> List what's done well in the code (optional)
```
