# Biljardbordets sarger och filt, #1665

The six original pocket centres/radii, playing dimensions, collision boundary and
physics are unchanged. Walnut surrounds now support the outer sides of all six
mouths, with green cushions and ivory sights. A table-only shader adds polished
wood and filtered felt nap without changing the shared clubhouse material.

Checks on the implementation:

- `node --test tools/billiardtest.mjs tools/billiardcuestest.mjs tools/billiardfinishtest.mjs`: 21 passing checks. Actual top-down rays verify that every pocket centre stays open and the backing exists around it.
- Existing `tools/billiardtest.cjs`, with only its URL adapted to documented `test&quality=0&cloud=`: 18 passing real-app checks (entry, aiming from all four sides, held cue, charge/E/scoring, collision, rules, exit); no page/shader errors. Chromium 156 / SwiftShader, peak 1551 MiB. The initial normal-quality run was stopped after about five minutes in its first room render; it is not counted as passed.
- `tools/browsertest.sh node tools/billiardfinishtest.cjs http://localhost:8772 docs/verification/1665`: production `Playroom` component, ordinary non-disco ambient (`room.lit * GARAGE.lights.carLight`), native 1400×900, antialiasing; no extra fixture lights beyond the ordinary ambient. Images show the complete table and a corner mouth with its solid surround and felt.

The table remains one merged draw, and billiards retain four visible mesh batches.
The table geometry is 8708 triangles (5516 before, +3192). No lights or textures
are added. The final component capture reports 17 draws / 90006 triangles and a 521 MiB peak; this is not
a whole-world or native-hardware performance claim. No physical phone was tested.

Image review corrected overlapping wood/cushion faces and aligned the polished
highlight with the existing shared ceiling-lamp direction. Only the affected
component/ray check was repeated, not the green gameplay route.

A/B/C/L have no equivalent gameplay fixture. Public downstream `AGENTS.md` and
`docs/upstream.md` were read: toys/gameplay are excluded, so no transfer applies.

Published implementation/images: `1215d3c3ef17718496715302b2eb8ec15c8034a2`.
[Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/40687390844)
and [shared-world Worker](https://github.com/solwation/lunden-3d-apartment/actions/runs/40687390841)
both succeeded. Published `version.json` returned `1215d3c`.
The [issue image comment](https://github.com/solwation/lunden-3d-apartment/issues/1665#issuecomment-6468891426)
was posted and both pinned PNG URLs verified HTTP 200 before the closing push.

Coarse phase timing: planning/setup about 3 min, implementation about 5 min,
verification/review and browser-lock waits about 22 min, publication about 3 min.
One implementer plus conductor review; the second orchestra worker owned a separate issue.
