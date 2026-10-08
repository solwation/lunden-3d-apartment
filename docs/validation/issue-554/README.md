# Table setting (#554)

Real Chromium/SwiftShader; three original kitchen plate/glass pairs placed through touch actions at six chair-aligned Items stores. The before/after camera is identical; developer-scenario food already on the table is retained.

TableSetting uses two typed slots per chair, no dish creation and no new saved counter. tests cover exact identities/counts, actual touch, full/wrong-item retention, non-overlapping circular footprints, food/liquid preservation, movable table anchors, restocking, real reload and reset.

perfcount matches #553 at every recorded spot (including kitchen 330 draws / 352278 triangles). The six added meshes are invisible pick surfaces, not rendered decorations. TABLE_SETTING spacing/pick dimensions are assumptions.
