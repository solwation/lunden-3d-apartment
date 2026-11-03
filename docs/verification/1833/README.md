# East backdrop batch assertion (#1833)

Base: `16cd96b0`; source hashes in `sources.json`. Only the stale test assertion changes;
there is no production rendering or player-facing behaviour change and no changelog entry.

The intended source contract is now explicit by name:

- Shared: `east-facade`, `east-roof`, `east-glass`, `east-access`, `east-modern`,
  `east-schoolGlass`, `east-schoolBrick`, `east-schoolRoof`, `east-lawn`.
- Desktop additionally has `east-modern-2` and `east-modern-3`:11 meshes total.
- Low-memory uses the one modern master:9 meshes total.
- One existing working four-face tower-clock group remains required.

This is derived from `sitebackdrop.js`'s source batches and its explicit modern split. It is not
an expectation copied from runtime output, a permissive lower bound or a disabled budget test.
Exact sorted names reject a missing, duplicated, renamed or unintended additional mesh. The
other source, facade/window, roof, draw structure, geometry and mobile-detail assertions are untouched.

## Verification

One wrapped Chromium/SwiftShader job ran:

```
PLAYWRIGHT_MODULE=… tools/browsertest.sh node docs/verification/1833/check.cjs GAME OUTPUT
```

The actual `tools/eastbackdroptest.html` app fixture passes52/52 assertions and ends `ALL PASS`.
This includes all1,019 exposed windows, the explicit11-name desktop contract, the existing working
clock and87,714 east triangles below87,800. The retained low/full campus geometry comparison passes:
22,979 versus56,558 triangles with matching window/eave/ridge/tower data.

A separate small component page with actual `?lowmem` selection builds the real east backdrop and
matches all9 explicit phone names plus one clock. It uses real terrain sampling with placeholder
brick/reflection materials, without rendering another whole app. Thus it establishes the phone
batch contract, not physical-phone appearance, a whole-phone triangle total or performance.
`phone-batches.json` records lowMemory=true, actual names, independent expected names and success.
`page-errors.json` is empty; raw full-fixture output is `eastbackdroptest.txt`.

Diff/contract review confirms there are no relaxed window/mobile/budget checks and no production
module changes. The old failure is preserved truthfully in historical #1822–25 evidence; this later
record supplies the corrected green harness result.

No game screenshot is appropriate: this is a nonvisual developer-test correction and changes no
rendered result. The concrete source-bound assertion output supplies verification instead.
The public project's `tools/eastbackdroptest.html` Contents API returned404 (that exact file absent),
and no shared production behaviour changes here, so there is no applicable public-project port.
No public verification result is claimed.

One worker, about one minute implementation and two minutes verification. The conductor owns
publication, completion comment/nonvisual exception and closure; no unrelated suites were run.
