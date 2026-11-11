# Santa startup fallback (#1914)

The #1903 migration (`7379659f`) removed `hatGeometry` and `cheek` while the
actual `figure()` asset fallback still called both. Pages currently omits model
assets (#1913), so every ordinary startup could hit this ReferenceError even
outside Christmas Eve. Restore those exact pre-migration helpers; no anatomy,
calendar, seating, animation or GLB changes.

Verification:

- `node --test tools/santatest.mjs`: 3/3 pass. Actual Santa construction before
  and after loading the GLB, complete hat bounds, changing cheek colours, actual
  floor soles, sitting/sleeping geometry, hidden sleeping glass and departure.
- `tools/santavisualtest.html`, captured with the private session capture script:
  four whole views of actual `Santa`, `furniture.sofa` and `restTarget`. Explicit
  404 fallback sitting/sleeping, then loaded-GLB sitting/sleeping with a moved and
  rotated sofa. Zero page errors; [measurements](browser.json). All four saved
  PNGs were opened and visually reviewed: whole recognisable Santa, hat/beard/
  arms/boots, complete sofa and sleep text visible. The component test does not
  establish full World startup, gifts, network or physical-phone performance.
- Combined full-app startup and actual Pages asset delivery are accepted with
  #1913 after all seven model corrections are integrated.

Personal character/gameplay: no public transfer applies. The public project has
no Santa consumer or GLB fallback. Source and test changes are original-only.
