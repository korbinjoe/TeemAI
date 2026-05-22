---
name: dev-server
description: >
  Dev server management skill. Provides capabilities to check running status, start, and get URL.
  Triggers when confirming if dev server is running, starting dev server, or getting dev server URL.
allowed-tools: Bash
---

## Dev Server Management

Manage local dev servers via Bash commands.

### Check Dev Server Status

```bash
# Check if a service is running on a specific port
lsof -i :<port> -t 2>/dev/null
```

If there's output (PID), a service is running on that port. URL: `http://localhost:<port>`.

If unsure about the port, scan common ports:

```bash
for port in 5173 3000 3001 8080; do
  if lsof -i :$port -t 2>/dev/null > /dev/null; then
    echo "Dev server running on port $port → http://localhost:$port"
  fi
done
```

### Start Dev Server

```bash
# Start in background (default: npm run dev)
npm run dev &

# Wait for service to be ready (max 15 seconds)
for i in $(seq 1 30); do
  if lsof -i :5173 -t 2>/dev/null > /dev/null; then
    echo "Dev server ready → http://localhost:5173"
    break
  fi
  sleep 0.5
done
```

If the port is already occupied, no need to start again — use the existing service.

### Get Dev Server URL

Scan common ports and return the first running service URL:

```bash
for port in 5173 3000 3001 8080; do
  if lsof -i :$port -t 2>/dev/null > /dev/null; then
    echo "http://localhost:$port"
    break
  fi
done
```

### Best Practices for Determining the Port

1. Read `server.port` config from `vite.config.ts` or `vite.config.js`
2. If no explicit config, Vite defaults to port `5173`
3. If default port is occupied, Vite auto-increments (5174, 5175...)
