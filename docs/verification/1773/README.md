# #1773 footprints in the snow: result images

Three real clients (A "Alma", B "Bo", late C "Cleo") against the local Worker (`cloudflare/dev.mjs`), `tools/footprintstest.cjs`,
January noon with snow falling (`?month=1&weather=snow`), the courtyard. Pictures at 1280×800, quality 3 with shadows.

- `1-spelarspar-farska.png`: client B looking at the courtyard lawn A has just walked over: A's fresh shoe prints (left / right, made on
  B from A's synced positions), and in front the paw prints of Sotis's snow-day outing.
- `2-tassavtryck-farska.png`: Sotis out on a snow-day outing, with the paw prints of its loop behind it (rebuilt from the cat's
  clock-driven loop for the last 30 minutes, then made live).
- `3-spelarspar-halvt-blekta.png`: the same view from the late client C, a quarter of an hour on: A's prints (from the room's history in
  C's welcome) half faded (fade 0.47 in the test).
- `4-tassavtryck-halvt-blekta.png`: the paw prints a quarter of an hour on, half faded.

Checks in the same run (all PASS): A's prints on the lawn (20 of ~22 expected), B sees A's prints (21), none on the ploughed road crossed
north of the courtyard and none inside the flat walked through, the late C sees them (18, from the room), paw prints behind the cat
on an outing, half faded at 15 min, every print gone and nothing drawn at 30 min, no page errors.
