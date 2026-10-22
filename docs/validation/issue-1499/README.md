# Santa seating report (#1499)

The original [report image](../../ingame-reports/1246fa25-9325-4541-920b-0295ee7ba36f.jpg)
shows the calves disappearing into the sofa because the knees were behind its front.

The replacement leg pose derives its front from LANDSKRONA's actual depth and the
selected seat anchor. The calf/boot vertices below the seat are all at least 35mm
in front of the cushion; the lowest sole is within 0.001mm of the sofa-local floor.
Sleeping selects a cached folded-leg geometry rather than rotating the long seated
legs across the cushions. Face, beard, cap and clothing details are also improved.

Verification: `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/santaseatingtest.cjs BASE OUT`.
The actual apartment check passed leg clearance, sole contact, the existing greeting/
gift callback, sleep-pose switching and hidden sleep glass, without page errors.
See [results](result.json), [sitting](sitting.png) and [sleeping](sleeping.png).
The first camera was obstructed by a wall; only that framing was corrected and the
same focused check repeated. Final images were opened and inspected. The coffee
table partly occludes the boots in the image, so floor contact is established by
the actual mesh coordinates, not claimed from the picture. No broad regression,
media, device or performance sweep was run; those systems were not changed.

Original-only character/gameplay, no applicable public downstream change.
