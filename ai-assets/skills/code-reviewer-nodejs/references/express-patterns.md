# Express/Koa/Fastify Common Patterns and Anti-Patterns

## Middleware Anti-Patterns

### 1. Async middleware without error catching
```javascript
// ❌ Wrong: async errors won't automatically reach Express error handler
app.get('/users', async (req, res) => {
  const users = await db.getUsers() // If this throws, Express won't catch it
  res.json(users)
})

// ✅ Correct: wrap in try-catch or use express-async-errors
app.get('/users', async (req, res, next) => {
  try {
    const users = await db.getUsers()
    res.json(users)
  } catch (err) {
    next(err)
  }
})
```

### 2. Wrong error handler middleware signature
```javascript
// ❌ Wrong: only 3 parameters, Express won't treat it as error handler
app.use((err, req, res) => { ... })

// ✅ Correct: must have 4 parameters
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal Server Error' })
})
```

### 3. Forgetting to call next()
```javascript
// ❌ Wrong: forgot next() in a branch, request will hang
app.use((req, res, next) => {
  if (req.headers.authorization) {
    // Verify token...
    next()
  }
  // else branch has no next() and no res.send()
})
```

## Route Best Practices

### 1. Route parameter validation
```typescript
// ❌ Using unvalidated parameters directly
app.get('/users/:id', async (req, res) => {
  const user = await db.findById(req.params.id) // id might not be a valid format
})

// ✅ Validate parameters
app.get('/users/:id', async (req, res, next) => {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid user ID' })
  }
  // ...
})
```

### 2. Response consistency
```typescript
// ✅ Unified response format
const sendSuccess = (res, data, status = 200) => {
  res.status(status).json({ ok: true, data })
}

const sendError = (res, message, status = 500, code) => {
  res.status(status).json({ ok: false, error: { message, code } })
}
```

## Graceful Shutdown Template
```typescript
const server = app.listen(PORT)

const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, starting graceful shutdown`)
  
  server.close(() => {
    console.log('HTTP server closed')
  })
  
  await db.disconnect()
  await cache.quit()
  
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
```

## Koa-Specific Notes

- Koa natively supports async/await, errors automatically bubble to outermost middleware
- `ctx.throw(status, message)` is more standard than manually setting ctx.status + ctx.body
- Koa middleware onion model: ensure `await next()` is called

## Fastify-Specific Notes

- Fastify has built-in JSON Schema validation, prefer it over manual validation
- Plugin registration order affects decorator availability
- `reply.send()` is asynchronous, don't continue operating on reply after send
