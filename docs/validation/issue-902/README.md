# Compact HUD data (#902)

The <=600px layout gave the centered temperature, clock and score less space than their actual
rendered text. Its original 568×320 columns reported client/scroll widths 36/37, 33/37 and 69/72
at all three safe-area settings. Centered overflow explains why these scrollWidth differences are
smaller than the measured intrinsic text widths; simply adding those differences was insufficient.

Only the compact CSS changes: data columns 18/39/40/72/26/44px, 18px noninteractive weather glyph,
12px clock, 15.4px score (still larger than temperature 14px), and unchanged 44px touch targets.
The actual Presence cell retains its online/FPS main rows and divider. Within its compact FPS row,
number and FPS label stack with a 1px gap so three-digit values fit without smaller type. Wider HUD,
safe-area edges, Compass, lives, gain/deduction timer and IDs/listeners are preserved.

## Actual native evidence

Linux Chrome for Testing 149.0.7827.55; original index DOM/CSS and real Combat, Presence, Compass,
statistics and icon modules. Bootstrap is suppressed; there is no apartment or WebGL rendering.
Both committed test drivers retain their assertions and values. Browser cases are not physical-phone
or hardware-FPS measurements.

- Before: revised published #896 fixture 0233b58, 15 cases, 9 geometry errors, actual CLI 1.
- Final HUD: 15 cases/five viewports/three insets, 60 actual life-state snapshots, zero errors, CLI 0.
- Original native FPS: 47 assertions PASS, CLI 0; actual Presence+stacked cells and timer/clearance.
- Additional actual Presence probe: 0/9/60/144/—, count 99 at 568×320/safe 44, all value/unit rectangles
  inside their logical lower row and mutually separate, CLI 0. This is a display-value probe, not
  measured machine FPS.

The CSS slice is `1b188d3`; final HUD reran after rebasing over #900's unrelated OLOF config removal.
Artifacts under `/tmp/lunden-priority-902/`: `before`, `ready-layout`, `ready-fps`, `published-layout`,
`fps-values.json`, per-value PNG, actual-exit files and ready/final source-proof snapshots.
The images were visually inspected; [compact original HUD](compact-hud.png) shows uncut text. [Actual Presence with a three-digit FPS display](compact-presence-fps.png)
shows the retained online/lower-FPS main cells and original divider; the display value is an input
for geometry checking, not measured hardware FPS.

## Separate existing overlap (#904)

The native marker/lives proof found an independent baseline overlap: lives x277.703..352.297,
y94..118; actual “Huvudträff!” marker x220.672..347.328,y111..140, overlap 69.625×7px. Routing
only original 0233b58 HUD CSS yields identical bounds to the candidate. Both diagnostic exits 0
mean the overlap was reproduced, not approved. [Baseline image](marker-overlap-before.png).

#904 tracks that geometry independently. #902 changes no marker/life positioning and weakens no
clearance assertion. The existing FPS driver checks marker against badges/crosshair, not lives.
