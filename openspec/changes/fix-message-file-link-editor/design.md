# Design

## Decisions

- Message Markdown links that resolve to local file paths or `file://` URLs dispatch the existing `ide:open-file` event.
- Non-file links keep the existing browser behavior through `window.open`.
