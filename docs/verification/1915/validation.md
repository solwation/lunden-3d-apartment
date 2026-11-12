# Verification — audit #1915

- Source model baseline: `4d017980e20777ae1ea194e32d5d2ae81e636f15`.
- Published evidence: `b1157f06ed164c98c85786ff3b84197197db7146`.
- Coverage: all 65 registered creature/figure recipes plus actual additional Avatar,
  driver, first-person hands, held/remote representations and figurine factories;
  all 12 earlier GLB assets accounted for. See the inventory and additional report.
- Visual review: all family sheets and six additional component images opened,
  alongside the source-bound actual-consumer evidence listed in the README and
  retained individual/product references. New images show unchanged production
  models; they are audit results, not proposed better models.
- Counter fixture: actual submitted render calls/triangles distinguished from raw
  alternate geometry. Figure counter corrected for Santa's empty leg geometry;
  the final capture completed without page errors. The defect is now #1930.
- Issue review: 16 new issues re-read from GitHub; all open with exactly
  one intended priority and a Lapp line, independent acceptance and scope. No model
  implementation was marked delivered. Issue URLs are in issues.json and README.
- Image accessibility: all 15 distinct embedded baseline image URLs
  returned HTTP 200 and an image content type at 2026-11-12T07:27:18Z. Both current audit
  images and reused earlier images use pinned commit URLs.
- Docs verification: all 83 relative links in graphics.md and the three audit
  narrative files resolve; final diff-whitespace and contradiction review passed.
- No product modules, asset binaries or changelog changed. No product test suite
  is needed for this inventory. GitHub Pages ignores docs/** and **.md pushes;
  an absent deployment for this docs-only delivery is not reported as passed.
- Public: read its AGENTS.md and applicable upstream scope at
  `11d67b945daccf36f90e27cd4420b19b2ec1903f`; no transferable code was changed.
  Each applicable future model issue requires its own low-priority port issue.

Limit: component Chromium/SwiftShader at DPR 1 is not physical-device timing,
full-world FPS, GPU memory or battery evidence. No present or future phone speedup
is established. Actual warm median/p95 comparisons belong to implementation issues.
