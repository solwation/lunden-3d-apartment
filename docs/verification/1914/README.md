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

Combined source startup at `5afd028c80ba60c657d8bf1857460a4f3ea774ac`:
Chromium/SwiftShader, `/ ?test=lazy&cloud=&month=12&day=24&time=15&freeze`
(without the display space), 480×300. Actual `__app.renderer` becomes ready and
actual Santa is sitting; [captured console/result](full-startup.json). One unrelated
HTTP 404 is recorded, no JavaScript exception/startup rejection. Before #1910,
`OutdoorCats.bakePose` failed to merge mismatched attributes from the old imported
cat, then constructed Mesh(null); after #1910 integration that startup failure is
gone. Actual published GLB delivery and startup against it remain #1913 acceptance.

## Final production acceptance

The corrected assets are published by original commit
`f124511c18d707db9a087e721dfca01c502e70f8`, successful Pages run
[43033851235](https://github.com/solwation/lunden-3d-apartment/actions/runs/43033851235).
BUILD f124511 / CONTENT2d013f8cd9ae: all12 live versioned model responses are
HTTP200 with exact source byte/SHA-256 parity (see #1913 pages.json).
Actual Pages full World startup also passes: all12 requested versioned resources200,
zero page/console errors, two loaded rigged ponies, restored cat geometry and
the loaded sitting Santa. [Combined result](../1914/pages-startup.json).
Whole-model and consumer images above remain source-bound form evidence; no new
form, hardware-phone, global frame-rate or network-gameplay claim is added.
