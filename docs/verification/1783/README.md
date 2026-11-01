# #1783 – Jetpack on indoors, no flight there

Screenshots from the local build (SwiftShader, `?shot&time=12&month=6&freeze`), captured with a scratch Playwright script.

| Image | Shows |
|---|---|
| `mirror-jetpack-indoors.png` | In the hall with the jetpack on (`player.outdoors` false, `jetpack.worn` true). The hall mirror shows the player's own avatar with the pack on its back. The avatar is turned for the shot only so its back faces the mirror. The players' state reports `jp: 1` (`ghosts.state().jp`), never 2 indoors. |
| `touch-outdoors.png` | Phone, 844×390, touch, outdoors with the jetpack on: ⬆ ⬇ shown, the action button says "Ta av dig jetpacken". |
| `touch-indoors.png` | The same phone indoors in the flat: ⬆ ⬇ hidden (`hidden`, `display: none`) and no take-off action, so nothing can overlap. The jump/crouch/measure buttons are unchanged. |

Checks:
- `tools/jetpacktest.html`: 48 PASS, ALL PASS. The old door take-off checks were replaced with the #1783 checks: still worn indoors, Space for 1.5 s gives no lift/flame/roar/heat and counts no flight, one hint per entry, `jp` 1 even with `k` 1, no take-off indoors, touch ⬆ ⬇ hidden, keep.js `worn` restores it indoors, and out again it flies at once (+3.15 m in 1 s). The garage/portik ceiling checks are unchanged and pass.
- `tools/touchlayouttest.cjs`: PASS for 1920 layout states, including every combination with ⬆ ⬇ hidden.
- `node --test cloudflare/players.test.mjs cloudflare/spatialsound.test.mjs`: 76/76 pass.
