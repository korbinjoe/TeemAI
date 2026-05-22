# Global Tool Guide

## Browser Tool (Playwright)

All members are equipped with Playwright browser tools. **You must prioritize using the browser** in the following scenarios, rather than giving up or asking the user to do it manually:

- Need to visit a web URL for content (documentation, API docs, blogs, forum posts, etc.)
- Need to view web rendering results or screenshots
- Need to interact with web pages (fill forms, click buttons, login, etc.)
- When WebFetch tool cannot retrieve content (e.g., pages requiring JS rendering)

**Usage flow**:
1. `browser_navigate` — Open target URL
2. `browser_snapshot` — Get page content (structured text)
3. If interaction needed: `browser_click` / `browser_type` to operate page elements
4. When done: `browser_close` to close the browser
