# Outdoor gym repetitions and rewards (#1828)

Source baseline `46f7be89` in the isolated `gymreps` checkout. Completed pull-up, press and step-up animation cycles call `onRep(n)`; entry glides, ordinary seats, pauses and aborted partial cycles grant nothing. Full repetitions persist as `gymReps`. Awarded exercise points persist separately as `gymScore` with only the current local `gymRewardDay`, preventing the generic per-event score loop from bypassing the daily ceiling.

Gameplay guesses: one point per repetition, at most30 exercise points per local calendar day, first Utegymmare level at100 repetitions. All repetitions still advance the medal after the point ceiling; ordinary medal bonuses retain their existing rules. No new storage key/service. This gameplay does not apply to the public downstream.

## Checks

- Eight `tools/gymrepstest.mjs` Node tests pass (`node-reps.txt`): all three exercise boundaries and multi-cycle updates; entry/partial-cycle/pause/leave/switch exclusions; cap, JSON round trip and new day; actual `stats.bump`/`rawScore` capped path; Worker counter and the100-repetition medal boundary.
- Existing `cloudflare/boards.test.mjs` and `cloudflare/medals.test.mjs`:22 tests passed on the same production source (before adding the eighth test-only stats assertion). Catalogue counters and existing score/medal contracts remain intact.
- `tools/gymrewardsbrowser.cjs`: all eight actual-app checks pass (`result.json`, `state.json`). Native E enters a pull-up station; one completed production cycle yields exactly one count/point, no `sat`/`lay`; releasing pointer lock pauses exercise; the real medal card reports1/100; native E exits and subsequent time adds no repetition. No page errors.
- Syntax checks for changed source and the browser driver, plus `git diff --check`, pass.

Node command: `THREE_DIR=/path/to/three node --test tools/gymrepstest.mjs cloudflare/boards.test.mjs cloudflare/medals.test.mjs`.
Browser command: `PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/gymrewardsbrowser.cjs GAME OUT`.

## Images and scope

`station-before-exercise.png` shows the actual station before training. `exercise-points.png` shows its bar, “Räckhäv ·1repetitioner”, the ordinary+1 score and repetition badge. `gym-medal-progress.png` shows the actual Utegymmare card with1/100repetitioner. The images were inspected and are saved at1280×800, Chromium1248/SwiftShader, June12:00clear/frozen, full-quality screenshot pass. Some emoji glyphs are unavailable in this headless font setup; labels/counts/progress were verified.

For readable static result pictures the fixture briefly holds only exercise time after the first real cycle; it restores the production update before checking the actual pause menu. The first route captured all required images and passed the six reward/pause/progress checks, but its optional post-menu Space-exit check timed out. A logic-only rerun used native E after blurring the menu button. A separate fixture retry also corrected synchronous card reading because the existing medal grid re-renders periodically. The final logic-only route passes all eight checks and reuses the valid images; no production changes were made to fix these fixture issues. No physical-phone, hardware-performance or production-visitor claim.

Final source hashes and test/environment scope are recorded in `source.json`. The conductor owns main publication, embedded permanent result images before closure, shared-file integration with duck rewards and final changelog numbering.

Integration with #1827: the shared stats merge retains both counters, both capped award ledgers and both generic-score exclusions. The actual bump/rawScore test now exhausts both daily caps in one profile and verifies their saved ledgers. The merged duck/gym suites pass 11/11; see integration-rewards.txt. The accepted gym browser captures precede the independent duck-catalogue merge (which adds its own medal card); gym progress, station controls and graphics are unchanged. No duplicate browser run was needed.


Levererat i `33116bd51a35e951532f6e05c53bb11fd741963d`. [Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/41608249108) och [Worker](https://github.com/solwation/lunden-3d-apartment/actions/runs/41608249057) lyckades; Worker-loggen bekräftar faktisk Wrangler-deploy och den publika sidans version.json visar `33116bd`. Dirigentens kombinerade diff-/bildgranskning är klar. Bild-URL:erna ovan är åtkomliga och bytekontrollerade. Ingen rutinmässig omkörning av gröna kontroller efter orelaterad integration. Ärendet stängs genom efterföljande verifieringscommit och aktiva etiketter tas bort.
