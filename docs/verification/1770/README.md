# #1770 — rainbow balloon, rarer, beer in the basket

Captured with `tools/balloontest.cjs` (Chromium/SwiftShader, `?shot&test&time=12&month=7&day=10&weather=clear`, 960×600).

| Image | Shows |
|---|---|
| `balloon-before.png` | Before (main c6add439): the old red / cream / blue gores above the cloud deck. |
| `balloon-rainbow.png` | After: the same view, the gores in rainbow order (red, orange, yellow, green, blue, indigo, violet, twice round). Still one draw call. |
| `beers-in-basket.png` | Standing in the basket: four bottles of "Ballonglager" on the basket floor by the wall. |
| `drinking.png` | One of them taken and lifted to drink (same gulps/points as a fridge-shelf beer). |

Checks (`tools/balloontest.cjs`, 13/13 PASS, no page errors): hidden/no draw call outside the window; one balloon draw call; landing,
standing and carrying; the rim; rainbow order of all 14 gores (sampled from the merged mesh's vertex colours); schedule 600 s of every
9000 s (visible ~6.7 % of the time); four beers on the basket floor; takeable only while the balloon is up; a beer rides with the basket
over 10 s / 35 m of drift (error 0); take + drink: 5 gulps counted as `beer`, its life portion claimed, the badge once; restocked full with
a new portion id at the next appearance; not in the saved world (keep.js); ≤ one draw call per bottle while up, none while hidden. Phone perfcount
(`tools/perfcount.html?cloud=&lowmem&w=844&h=390`): ALL PASS, start 370 calls (≤ 370), 843 502 triangles.
