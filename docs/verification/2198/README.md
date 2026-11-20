# #2198 curtains billow in an open window's draught

Real app (tools/curtainwindbrowser.cjs, captured 1280x800, stored downscaled to 960x600, June, 13:00, `siteWind` pinned to power 1 / fixed clock). Window open in all views.

- `before/bedroom1-still.png`, `before/kitchen-still.png`: window open, no draught feeding the curtain (the old cloth, strength 0).
- `bedroom1-windy-a.png`, `bedroom1-windy-b.png`: Sovrum 1 curtain, windy at two moments (t 0.9 s / 3.4 s): the hem swings into the room (compare the bottom edge against the floor line and the chair).
- `kitchen-windy-a.png`: the kitchen valance in the same wind: the hem ripples and lifts (smaller drop = smaller swing).

Numbers (result.json, images are quantised copies): draw calls and triangles identical between still and windy; the window-closed frame in the same wind is the still cloth (strength 0). No shader errors.
