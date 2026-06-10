#!/usr/bin/env node
/**
 * browser-agent daemon — HTTP bridge between skill scripts and extension native messaging.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT_FILE_DIR = path.join(os.homedir(), '.teemai', 'browser-agent');
const PORT_FILE = path.join(PORT_FILE_DIR, 'daemon.port');
const VERSION = '0.1.0';
const COMMAND_TIMEOUT_MS = 30_000;

/** @type {Map<string, { status: string, result?: unknown, error?: string }>} */
const tasks = new Map();

/** @type {Array<Record<string, unknown>>} */
const outboundQueue = [];

/** @type {Map<string, { resolve: (v: unknown) => void, reject: (e: Error) => void, timer: NodeJS.Timeout }>} */
const pendingResults = new Map();

/** @type {Array<{ resolve: (cmd: Record<string, unknown> | null) => void, timer: NodeJS.Timeout }>} */
const pollWaiters = [];

let extensionConnected = false;
let cachedStatus = {
  connected: false,
  riskLevel: 'safe',
  activeAccounts: [],
  todayStats: { posts: 0, comments: 0, upvotes: 0 },
  paused: false,
};
let startTime = Date.now();

function writePortFile(port) {
  fs.mkdirSync(PORT_FILE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    PORT_FILE,
    JSON.stringify({ port, pid: process.pid, startedAt: Date.now() }),
    { mode: 0o600 },
  );
}

function removePortFile() {
  try {
    fs.unlinkSync(PORT_FILE);
  } catch {
    /* ignore */
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function enqueueOutbound(command) {
  outboundQueue.push(command);
  while (pollWaiters.length > 0 && outboundQueue.length > 0) {
    const waiter = pollWaiters.shift();
    if (!waiter) break;
    clearTimeout(waiter.timer);
    waiter.resolve(outboundQueue.shift() ?? null);
  }
}

function waitForCommand(timeoutMs) {
  if (outboundQueue.length > 0) {
    return Promise.resolve(outboundQueue.shift() ?? null);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const idx = pollWaiters.findIndex((w) => w.resolve === resolve);
      if (idx >= 0) pollWaiters.splice(idx, 1);
      resolve(null);
    }, timeoutMs);
    pollWaiters.push({ resolve, timer });
  });
}

function waitForResult(id, timeoutMs = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResults.delete(id);
      reject(new Error('Command timeout'));
    }, timeoutMs);
    pendingResults.set(id, { resolve, reject, timer });
  });
}

function resolvePendingResult(message) {
  const pending = pendingResults.get(message.id);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingResults.delete(message.id);
  if (message.status === 'failed') {
    pending.reject(new Error(message.error ?? 'Command failed'));
    return true;
  }
  pending.resolve(message);
  return true;
}

function dispatchCommand(body) {
  const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const command = {
    type: 'command',
    id,
    action: body.type ?? body.action,
    payload: body.payload ?? {},
    confirm: body.confirm ?? false,
  };

  const resultPromise = waitForResult(id);
  enqueueOutbound(command);
  return resultPromise;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, uptime: Date.now() - startTime, version: VERSION });
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    return json(res, 200, {
      ...cachedStatus,
      connected: extensionConnected,
      daemonUptime: Date.now() - startTime,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/extension/register') {
    extensionConnected = true;
    cachedStatus.connected = true;
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/extension/disconnect') {
    extensionConnected = false;
    cachedStatus.connected = false;
    for (const [, pending] of pendingResults) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Extension disconnected'));
    }
    pendingResults.clear();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/extension/poll') {
    const timeout = Math.min(Number(url.searchParams.get('timeout') ?? 5000), 30_000);
    const command = await waitForCommand(timeout);
    if (!command) return json(res, 204, {});
    return json(res, 200, command);
  }

  if (req.method === 'POST' && url.pathname === '/api/extension/inbound') {
    const message = JSON.parse(await readBody(req));

    if (message.type === 'result' && message.id) {
      resolvePendingResult(message);
      tasks.set(message.id, {
        status: message.status,
        result: message.result,
        error: message.error,
      });
    }

    if (message.type === 'status' && message.data) {
      if (message.data.event === 'extension_ready') {
        extensionConnected = true;
        cachedStatus.connected = true;
      }
      if (message.data.status) {
        cachedStatus = { ...cachedStatus, ...message.data.status, connected: extensionConnected };
      }
    }

    if (message.type === 'pong') {
      extensionConnected = true;
    }

    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/result/')) {
    const taskId = url.pathname.split('/').pop();
    const task = tasks.get(taskId);
    if (!task) return json(res, 404, { error: 'Task not found' });
    if (task.status === 'pending') return json(res, 202, { status: 'pending' });
    return json(res, 200, task);
  }

  if (req.method === 'POST' && url.pathname === '/api/command') {
    if (!extensionConnected) return json(res, 503, { error: 'extension disconnected' });

    const body = JSON.parse(await readBody(req));
    const taskId = `task-${Date.now()}`;
    tasks.set(taskId, { status: 'pending' });

    try {
      const message = await dispatchCommand(body);
      const task = {
        status: message.status ?? 'success',
        result: message.result,
        error: message.error,
      };
      tasks.set(taskId, task);
      return json(res, 200, {
        taskId,
        id: message.id,
        status: message.status ?? 'success',
        result: message.result,
        error: message.error,
      });
    } catch (err) {
      const task = { status: 'failed', error: String(err) };
      tasks.set(taskId, task);
      return json(res, 504, { taskId, ...task });
    }
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/confirm/')) {
    const taskId = url.pathname.split('/').pop();
    const body = JSON.parse(await readBody(req));
    try {
      const message = await dispatchCommand({
        type: body.action ?? 'reply',
        payload: body.payload ?? {},
        confirm: true,
      });
      tasks.set(taskId, { status: 'success', result: message.result });
      return json(res, 200, { status: 'confirmed', result: message.result });
    } catch (err) {
      return json(res, 504, { status: 'failed', error: String(err) });
    }
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  writePortFile(port);
  startTime = Date.now();
  console.error(`browser-agent daemon listening on 127.0.0.1:${port}`);
});

process.on('SIGINT', () => {
  removePortFile();
  process.exit(0);
});

process.on('exit', removePortFile);
