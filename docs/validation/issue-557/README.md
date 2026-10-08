# #557 – toilet-roll replacement

Browser: Playwright Chromium 1208, SwiftShader; local devserve with Three.js 0.170.0.

- rollreplacetest: 22 checks pass. Actual touch pickup from HAVBÄCK and replacement downstairs/upstairs; full and hanging-sheet refusals, finite stock, double press, atomic one-hand/one-slot state and retained core. Real page reloads mid-pull and after fetching a spare; actual home reset.
- papertest: both existing pull/tear/wad/flush paths pass, with F preserving used roll quantities.
- itemtest: inventory checks including invalid/locked/reserved exchanges and atomic listener state.
- perfcount: normal scene draw counts match #556. Five reserve models are hidden behind the closed cabinet; each uses three draws while visible. Cardboard tubes on installed holders appear only when empty.

The images show the same existing downstairs holder before/after replacement. The after image includes the old empty cardboard tube in hand. The first screenshot angle was obscured by the basin and was discarded. Original furniture/collision footprints are unchanged, so no walktest is needed.
