# Stacked time/weather HUD (#970)

Runtime: `093e0aaaf8d8058bacc374a5466e160731e2ac70`. Clock occupies the upper
half-row; the unchanged weather icon and temperature share the lower half-row,
with one continuous divider. The column is 80 px normally and 66 px at <=600 px,
saving 40/31 px respectively. Existing type sizes, IDs and independent updates remain.

`tools/hudlayouttest.cjs` completed with actual exit 0: five viewports
(844×390, 667×375, 932×430, 568×320, 1280×720), each with zero, symmetric and
asymmetric safe insets. All 15 layouts passed, including seven weather kinds,
−123°/100°, independent updates through the actual main.js updater, real Presence
construction without networking, score feedback, controls and actual Combat life
visibility. Game bootstrap was suppressed and WebGL attempts stayed zero.
Phone-sized landscape and desktop PNGs were visually inspected; this is native
HUD evidence, not physical-phone or rendered-world verification.

Initial run 1 exited 1 because −123° overflowed the old temperature width.
Run 2 retains the font sizes and widens that part; no assertions were relaxed for
clipping. All nine measured runtime/fixture source hashes matched after final rebase.
Raw results, exits, screenshots and source hashes are retained in the orchestrator's
`worker-970-artifacts` directory (original `/tmp/lunden-priority-970`).

[Pages run 38535737351](https://github.com/solwation/lunden-3d-apartment/actions/runs/38535737351),
job 115758105836, completed the actual deploy-pages step successfully at
2026-10-14T08:32:53Z. The public CSS SHA-256 matched the tested source:
`38d2906202fcb58a72501b2fbfb4d5f89a7f2a94ee43e6b3dc89efe6fc8e403b`.
