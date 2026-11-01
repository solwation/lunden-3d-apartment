# #1753 fishing rod under the road bridge: result images

Two real clients (A "Alma", B "Bo") against the local Worker (`cloudflare/dev.mjs`), `tools/fishingtest.cjs`, summer noon, touch controls on.
The bite waits are shortened in the test (FISHING.wait.min 1.5 s, rate 3) so it does not wait minutes for a fish.

1. `1-spo-under-bron.png`: the rod lies on the north shore flat under the road bridge deck, beside the north pier pair.
2. `2-kast-flote-med-ring.png`: A has cast; the red-and-white float has landed with a ring, the line runs to the rod tip. A fish swims nearby.
3. `3-napp.png`: a bite: the float dips with a new ring (touch button "Haka!"). Missing it gave no fish and left the fish in the river for both clients.
4. `4-fangad-fisk-i-handen.png`: after answering a bite with the touch button: the caught fish ("en mört, 14 cm" in this run) in the hand; the rod was laid on the bank.
5. `5-annan-spelare-ser-flotet.png`: B on the other bank sees A's float and line (from A's player state `fb`).
6. `6-annan-spelare-ser-fangsten.png`: B sees A holding the fish (held category `fish`); the fish is gone from the river for both.
7. `7-alla-handkategorier.png`: `tools/ghostitemtest.cjs`, every held-item proxy; the new `rod` (46 triangles) and `fish` (42) are 16th and 17th.

Images 3 and 5 are from an earlier run of the same test (the same remote-float and bite code; later runs changed only the held
rod's pose and its draw distance); the others are from the final run (all 16 checks passed).
