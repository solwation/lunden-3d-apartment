# #2285 verification: doors, windows, switches and taps

Source: export of 68becc86 + this issue's exporter change (98a0c0bf); Unreal 5.8.4 in the Windows worktree
`lunden-ue-wt/opus-2285`, headless (`-nullrhi` builder, PIE test without a window on the desktop).

- **Export:** all eight GLBs byte-identical with and without the #2285 exporter change; `check-export.mjs`: current,
  9 files, 4790 nodes.
- **Builder:** `build_interaction.py` → `LUNDEN_INTERACTION_LEVEL … {"swing": 10, "sliding": 2, "wardrobe": 6,
  "sash": 6, "switch": 13, "tap": 6}`, `LUNDEN_INTERACTION_OK`.
- **PIE test:** `test_interaction` → `LUNDEN_INTERACTION_TEST_OK 18 doors, 6 sashes, 13 switches, 6 taps`, Result
  Success. Every value: [interaction-result.json](interaction-result.json) (hinge/pivot, yaw, sash angle, slider box and
  sash check point per door and window, opened and closed, with `ChangeCount`; the wardrobe pairs; E on the front
  door; the Hall switch with both Hall lamps and the Badrum lamp; the kitchen tap's water).
- Not covered here: the level is not yet in `L_Lunden` (see docs/development/unreal.md, "Doors, windows, switches and
  taps"), so the lamps of the real lighting sub-level were stood in by `BP_LundenLamp` actors with the same tags.
