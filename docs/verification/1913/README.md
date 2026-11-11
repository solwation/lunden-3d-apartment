# Production model packaging and versioning (#1913)

Base: `5afd028c80ba60c657d8bf1857460a4f3ea774ac`. The seven reviewed correction slices
#1906–#1912 and Santa fallback correction #1914 are already on that base. This change
adds the missing `models/` directory to `tools/stamp.sh` copying and `models/*.glb`
to CONTENT. Model attribution Markdown remains outside CONTENT, along with existing
non-runtime documentation. The copied bytes are unchanged.

All twelve loader URLs in eleven modules now use `src/modelurl.js`. For HTTP(S) it
explicitly copies `v` from the stamped importing module (`?v=BUILD`), because relative
`new URL` resolution drops that query. Project subpaths are preserved; unrelated retry
parameters are not copied. Development without a version stays unversioned. Node
`file:` URLs stay unversioned, and the existing fs branches/paths are untouched.
The helper has no storage, service, timer or network side effects. Existing loader
memoization, parsing, fallback and animation/material consumers are unchanged.

## Scoped verification

1. **Build/byte/content contract:** `python3 tools/modelpackagingtest.py OUT` runs the
   actual stamp pipeline in an isolated copy with real git changelog history. The
   optional fridge issue feed is replaced only in this fixture with `[]`; it is outside
   CONTENT. All **12** copied GLBs match source bytes/SHA-256. A GLB byte mutation changes
   CONTENT and packaged bytes; changed docs, README, model attribution and a different
   BUILD keep CONTENT stable. `tools/` remains absent. [Log](package-tests.txt),
   [all twelve hashes, byte counts and content values](package.json).
2. **URL/actual loader contract:** two Node tests cover HTTP/HTTPS under a project
   subpath, development without `v`, and `fileURLToPath` with an untouched file URL.
   [Log](url-tests.txt). `tools/browsertest.sh node tools/modelpackagingbrowser.cjs OUT
   RESULT.json` serves the stamped package and imports all **12 actual production
   loader exports**. Every loader parses a nonempty glTF scene, requests its model with
   `?v=1913-local`, and receives HTTP200 bytes matching the package SHA-256; zero page
   errors. [Browser log](browser-tests.txt), [per-loader URL/mesh/byte/hash results](browser.json).
   Three.js is the installed 0.170.0 dependency served locally; no full World or physical
   phone performance claim. The helper server/browser closes on success or failure.
3. Diff/syntax, changed documentation links, all loader sites and public applicability
   reviewed; [source hashes](source-manifest.json), [review](review.txt).

The final build follows the changelog's required committed git timestamp. An earlier
local attempt with the new uncommitted entry correctly failed the existing missing-`t`
guard; the entry was committed before repeating the affected build/loader checks.
No production guard was relaxed.

## Visual evidence and public assessment

This is a packaging/cache change with no new rendered form to judge. Numeric file/URL/
hash evidence is the useful result; a screenshot of a directory would add no acceptance
proof. Existing committed, visually reviewed whole-model and actual consumer images
under `docs/verification/1906/` through `1912/` remain the form evidence. They were not
routinely re-rendered here. Combined full-app startup is owned by the conductor in #1914.

Public `cd79c14d5e2f6eb3ddf4b8bcca376f0745ab1dcb`, its AGENTS.md, docs/upstream.md,
Pages workflow and `tools/build.mjs` were inspected. Public uses its separate esbuild/
`dist` pipeline and procedural generic scenery; no source GLB URLs or models directory
exist there. The original stamp/GLB delivery regression does not apply. No public
implementation issue or personal/gameplay/service transfer is needed.

## Integration and production acceptance

Integration owner delegated by conductor: `/root/public_core_update`, session
`olw-win10-codex-20261111`. Final full-Pages app acceptance remains with `/root`.
Integration rebase: `ab46c933` adds only #1914 startup evidence, so the source-bound
green component/package evidence above is reused. Worker checkout:
`/home/devcontainers/wt/lunden-1913-codex`, retained clean on main. The issue handoff
records the exact revision. The conductor authorized the integration Refs push;
this worker does not close the issue. Changelog1474 was checked against max1473
after the final rebase.

Production revision: **`f124511c18d707db9a087e721dfca01c502e70f8`**.
[Actual Pages run43033851235](https://github.com/solwation/lunden-3d-apartment/actions/runs/43033851235)
completed **success** for that exact head SHA; [run record](pages-run.json).
Live `version.json`: BUILD **`f124511`**, CONTENT **`2d013f8cd9ae`**, matching the
local content-contract result. All twelve `models/*.glb?v=f124511` resources returned
HTTPS **200**, with exact source byte counts and SHA-256. All twelve published loader
sites in eleven modules import `modelurl.js?v=f124511`; the published helper propagates
that query and `version.js` has matching BUILD/CONTENT. [Full live resource and JS evidence](pages.json).

These checks use actual Pages responses, not CI artifacts or a source-server substitute.
No new form/browser sweep was performed. The conductor owns final combined full-app
Pages startup acceptance in #1914 before closure of #1913 and the ready model siblings.
The finished delivery remains integration-ready with the same documented integration
owner until that acceptance; this worker does not close it.

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
