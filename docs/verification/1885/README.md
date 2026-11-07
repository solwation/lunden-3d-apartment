# #1885 Hitta alla utekatter — verification

- `node --test src/outdoorcathunt.test.mjs cloudflare/medals.test.mjs cloudflare/boards.test.mjs`: rounds unlock only when every
  cat is found, the round restarts at 0, the bonus (500 × level) is paid once per level and never on a server restore, "N av X" counts
  only new cats, a cat added later keeps reached levels, the Worker accepts the counter with `start` 1 and one more per 5 minutes.
- `node tools/outdoorcathuntbrowser.cjs http://localhost:8185 docs/verification/1885` (real scene, SwiftShader, DPR 2; results in
  `browser.json`):
  - `hunt-found.png`: Sotis seen up close with four cats found earlier gives "🐈 5 av 12 utekatter hittade", once.
  - `hunt-level1.png`: the last cat of the round: "🎉 Alla 12 utekatter hittade! Nivå 2 börjar", Kattspårare level 1 spins with
    +500, the score rises by exactly 500 and the found list is empty (the cat still in view does not open round 2).
  - `hunt-medal-card.png`: Meny → Medaljer during round 2: level 1, bar 3 / 12 and the found names.
- Not tested: a real Worker deployment (cloud sessions cannot reach `*.workers.dev`); the Worker logic is covered by the node tests.
