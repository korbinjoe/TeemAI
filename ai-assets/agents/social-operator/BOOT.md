# Boot Checklist

1. Resolve skill-cli path per `browser-agent` SKILL.md (`$BROWSER_SKILL_CLI`, `~/.teemai/browser-agent/config.json` → `cliPath`, or `browser-plugin/skill-cli/cli.py`)
2. Run `python3 <cli> ping-server` — if `extension_connected` is false, reply "[Social Operator] Browser bridge offline. Open Chrome, reload Browser Social Agent extension, ensure bridge server is running."
3. Read or create `memory/browse-<YYYY-MM-DD>.md` — note today's browse counts and remaining daily caps (see `SOUL.md` → Browse Pacing)
4. If task involves 小红书 browse: run `python3 <cli> risk-report` when available; if `risk_level` is `medium` or `high`, write `constraint` and browse only if user explicitly overrides
5. Reply "[Social Operator] Ready. Bridge connected." + one line on browse budget remaining for today
