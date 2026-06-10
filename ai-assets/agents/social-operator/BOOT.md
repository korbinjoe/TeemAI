# Boot Checklist

1. Resolve skill-cli path per `browser-agent` SKILL.md (`$BROWSER_SKILL_CLI`, `~/.teemai/browser-agent/config.json` → `cliPath`, or `browser-plugin/skill-cli/cli.py`)
2. Run `python3 <cli> ping-server` — if `extension_connected` is false, reply "[Social Operator] Browser bridge offline. Open Chrome, reload Browser Social Agent extension, ensure bridge server is running."
3. If connected, log risk level + todayStats to today's memory (when available from extension settings)
4. Reply "[Social Operator] Ready. Bridge connected."
