# Christmas Eve guest (#1406–#1410)

Scope: Santa's local calendar/sofa lifecycle, E/touch greeting and gift, opening,
ordinary placement and reload. No broad apartment, architecture or performance
profile was run for this isolated gameplay addition.

- `node --test tools/santatest.mjs`: Christmas Eve intervals, other dates and backward changes pass.
- `tools/santagiftstest.cjs`: real-browser component checks pass for busy/stowed hands,
  all three existing trinkets, single opening, stable result through a real reload,
  placement and no paper.
- `tools/santaapptest.cjs`: actual apartment desktop pointer-lock E and landscape
  touch pass, including both greetings, busy hands, gifts while sleeping,
  `keepWorld`/`loadWorld`, sofa movement and 15/16/21 boundaries. No page errors.
  See [results](result.json), [sitting](sitting.png), [sleeping](sleeping.png).
- Actual embedded source `I0SW0f0ww84` played in Chromium, state PLAYING,
  16.65 seconds elapsed, duration 231.601 seconds. It is a looping published
  Toy Tinkers excerpt, not the full Swedish Christmas broadcast.
  Seven focused TV lifecycle checks also pass; see [source results](source-video.json).

The final actual-apartment media check also passed: the TV's real YouTube frames
advanced while visible, and 16:00 removed both the player and glögg glass.
See [media results](media.json), [TV](tv.png) and [sipping](sipping.png).
The glass was moved outside the fist after its first image showed it hidden;
only this affected visual check was repeated. The later config extraction keeps
those same pose values. Opening a present also invalidates its old wrapping
placement preview; the focused gift component still passes.

Images were opened and inspected. The initial picture exposed an oversized beard
hiding the eyes; the final model places the beard below the eyes. Earlier route
attempts had fixture setup mistakes (coarse-pointer mouse button and looking down
instead of up before E), corrected without changing the product's input rules.
The route uses test-mode simulation and full-quality local screenshots; it is not
a physical-phone or hardware-performance claim.

Characters, TV entertainment, gifts and gameplay belong only to the original
project. The public downstream receives none of these changes.
