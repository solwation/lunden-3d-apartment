# #503 – continuous dishwasher rack picking

Playwright Chromium 1208/SwiftShader, Three.js 0.170.0, local devserve.

- dishrackpicktest: 30 checks. Both original rack pivots contain a hidden volume inside their existing bounds. The closed door excludes it. Actual rays through empty wire gaps select each basket; the touch action draws it out and the mouse left-click pushes it in after reacquiring the moved surface. Plates, glasses, butter knives and parked coffee cups remain selectable and takeable. Held items disable the new helper while loading an open rack; returns preserve the inventory audit.
- life2test?only=384,385: all 46 rack, typed/full/dirty loading, carried poses, cup handling and dishwasher programme pause/save/resume/clean/reset checks pass.
- opentest: all 84 fronts still open/close through their own action buttons, contents and overlap checks pass.
- perfcount: all checks pass; draw calls at every original spot match issue #557. The helpers are not rendered.

No visible rack geometry, slots, collision bounds or furniture footprints changed. Contents pass-through is tested against real item meshes before the helper supplies a hit.
