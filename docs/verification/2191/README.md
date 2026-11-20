# #2191 Shaded lamps throw light up and down

Real game, evening (21.5, 15 Nov, clear), `tools/lampshade2191browser.cjs` (quality 3, 800 x 560). Before = parent commit f58e50a0, after = this branch.
"solo" = every other lamp in the room off, so only the pendant lights.

| Image | Shows |
|---|---|
| `before/solo-living-up.png` / `solo-living-up.png` | Living room, looking up at the Silvia: before an even dim ceiling, after a soft pool on the ceiling over the open top |
| `before/solo-living.png` / `solo-living.png` | Living room from the doorway: after, the ceiling pool above the lamp and a darker band beside it |
| `before/sovrum2-paper.png` / `sovrum2-paper.png` | Sovrum 2's folded paper lamp with the room lit: after, a clear ceiling pool round the cord and a cone down |

Draw calls +1 (one merged additive `shadePools` mesh); no new lights.
