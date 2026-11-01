# #1778 — fish room forgets caught fish on hibernation

Reproduced: yes. `cloudflare/riverfish-hibernation.test.mjs` (real Worker + PlayerRoom + `hibernate()`): client A catches fish 3 (life 0 -> 1, `ok`),
the room hibernates (sockets kept, `lives` lost), the fish is back, A (still holding life 1) catches it: before the fix the room answered `no`
(it was back at life 0, `born !== m.b`). A newcomer after waking got an empty gone list (fish 3 at life 0), so old and new clients disagreed.

Fix (`cloudflare/riverfish.js`): a catch of a later life (up to 50 beyond the room's record) is believed; reach is checked against that life's
position, the room advances to `b + 1` and broadcasts `g`. No storage or KV (#1689). After the fix the second catch is `ok` and a newcomer sees `[[3,2,u]]`.
Also tested: 51 lives ahead and out-of-reach catches are still `no`.

Checks: `node --test cloudflare/*.test.mjs src/*.test.mjs`. No visual result.
