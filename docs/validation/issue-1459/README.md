# Issue #1459 verification

Base source: `8edc780e` (normal World; no `test` or quality override).

- Exact corner: **556 calls / 1,076,659 triangles → 514 / 967,709**.
- Entry:489/861165 →459/762795; garage:288/956094 →238/751132.
- Three matched desktop pairs:0changed decoded pixels; fresh per-source shadow triangle totals/masks equal.
- Actual source geometry/material/buffer/raycast/cast identities retained; four positive tree rays match.
- Same book takes/returns through existing methods; its canonical indexed faces remain complete.
- Native30checks pass; full21-view desktop/quality/texture profile ALL PASS at514/967709/~311MiB.
- Public neutral transfer: [kvarteret-lunden#139](https://github.com/solwation/kvarteret-lunden/issues/139).
- Visible844×390 lowmem/touch quality3 corner:493/961330 in both states,0changed pixels; no page errors.
- Independent phone corner report: [#1498](https://github.com/solwation/lunden-3d-apartment/issues/1498).

A/B/C/L: reviewed shared `CoreHouse`, Hus L's separate exterior and the environment/visibility
builders; no house dimensions, openings, glass, door geometry or terrain/query surface changes.
The private book is not present in A/B/C and is excluded from the public transfer.

Raw scripts, JSON, complete profile output, image pairs and rejected probes:
`/home/olw/.local/state/lunden-issue1459-20261022/` (working copy `/tmp/finish1459/`).
The matching source/current pair and current full profile use the source paths in
`tools/patiocorner1459test.cjs` and `tools/perfcount.html`; they can be rerun against the committed code.
The later desktop-only LOD ownership guard retains the same514/967709 full-profile result.

This is a renderer submission/resource check in Chromium/SwiftShader, not a physical-device
frame-time benchmark. No phone-wide acceptance is implied by the desktop result.

Final rebase review: `a6325985` adds report metadata/DOM administration and changes the
billiard board inside the normally hidden clubhouse. No outdoor draw source, car LOD,
selected instance buffer or renderer policy changes. The board texture grows from512×256
to768×384 (under0.84MiB with mipmaps); the measured~311MiB profile remains conservatively
below313MiB/320. Native30checks pass after rebase. The desktop514/967709 evidence and
pixel pairs are reused for unchanged outdoor rendering, rather than claiming a new
post-rebase browser run. The final count/color-cache fallback guards do not change the
measured sources' existing attribute counts or color presence.
