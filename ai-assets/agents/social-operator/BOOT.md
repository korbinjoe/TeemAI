# Boot Checklist

1. Resolve skill dir: `~/.teemai/skills/browser-agent/scripts` (runtime) or `./ai-assets/skills/browser-agent/scripts` (TeemAI dev tree)
2. Run `status.sh` — if exit 10, reply "[Social Operator] Browser Agent bridge offline. Install Browser Agent Helper from extension settings (Connection tab), then reload Chrome."
3. If connected, log risk level + todayStats to today's memory
4. Reply "[Social Operator] Ready. Risk: {level}, accounts: {activeAccounts}"
