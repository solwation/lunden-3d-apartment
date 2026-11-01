# #1782 — feeding the outdoor cats raw fish

Taken by `tools/outdoorcatfishtest.cjs` (real scene, the cats' own test clock, the ordinary cat busy indoors).

- `1-sotis-aeter-ra-fisk.png` — Sotis (social, black) has walked to a raw perch laid on the courtyard lawn and eats it: head down,
  the fish already shrunk to 58 %. She stays the roaming outdoor cat; the ordinary cat is elsewhere.
- `2-kanel-struntar-i-tillagad-fisk.png` — Kanel (lazy) sits on its loop beside a cooked fish (and a burnt one by the bench) and ignores both.

Checks (all PASS): the raw fish is eaten and gone, `catFishFeeds` +1 and +5 points once, `fishEaten` and the fishing quest unchanged;
cooked/burnt ignored; shy Smulan hesitates (14 s against her 4.5 s base wait while the visitor stands still) and then eats a raw fish held
out, the hand empty afterwards; no page errors.
