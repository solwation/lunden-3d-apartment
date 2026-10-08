# #504 – cold storage drawers

Playwright Chromium 1208/SwiftShader, Three.js 0.170.0, local devserve.

- colddrawertest: 77 checks pass. Actual fronts draw out on touch and push in on mouse click. Each drawer loads food through its normal target, lets the actual food be selected through transparent walls, retains the extra item when both slots are full and carries the same contents by 30 cm. Closed drawer/door access and door-closing guards hold.
- A real reload to a normal visit retains all five drawers' exact instances/amounts, legacy freezer shelf contents and original pea home; fronts start closed. F closes drawers before their doors without replacing stored food. Inventory audit passes.
- opentest: all 89 original/new fronts pass action, contents and neighbour checks. Cold owners are opened/closed around each drawer case so they do not obscure the next corner cabinet.
- walktest: all existing movement/collision/stair routes pass.
- returnmarkerstest: all 15 contour/milk/cup return checks pass.
- perfcount: all checks pass. At the matched open-fridge screenshot, after renders 180 calls versus baseline 183; merged drawer walls replace separate panels. Standard kitchen/living/upstairs calls remain 330/312/296.
- before.png / after.png reviewed: five extended hollow drawers contain identifiable food; both old orange juice blocks and the four anonymous frozen blocks are removed. Baseline worktree 0fca798.

Pre-existing storetest failure is tracked separately as #560: first-free fridge slot is correctly on the upper shelf, while an older test demands lower-shelf height. Both baseline and current logs show the same failure and the remaining storage actions passing. It is outside this change.

New measures/slots are explicitly marked assumptions in COLD_DRAWERS. Existing shelf store ids/slot indices and saved home references are preserved; legacy freezer slots 0–2 move from anonymous bag blocks onto a real upper glass shelf.
