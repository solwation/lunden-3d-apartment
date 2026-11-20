# #2254 olofcomputertest touch pass timed out (test-only)

Cause: `?shot` hides the start overlay at load (`src/main.js` line 1524) and `#hud` is `hidden` in `index.html`,
on purpose (clean screenshots, see local-development.md `&shot`). `showOverlay(false)` then returns early
(`overlay.hidden === !show`) and never reaches `hud.hidden = show`, so `#action` stays invisible and
`locator('#action').tap()` waits until timeout. Game behaviour is correct; no `src/` change.

Change: `tools/olofcomputertest.cjs` unhides `#hud` itself in the touch pass.

Command (local server 8730, local Worker 8731, Playwright via NODE_PATH):
`tools/browsertest.sh node tools/olofcomputertest.cjs http://localhost:8730 http://localhost:8731 OUT`

- Before (unchanged test): desktop PASS; touch pass fails, see `before.txt` (tail): `TimeoutError`, `<button id="action" ...>Sitt ner</button>` "element is not visible", 55 retries.
- After: `after.txt` - all desktop and touch PASS lines, `PASS no page errors`, peak 2448 MiB of 4G.
