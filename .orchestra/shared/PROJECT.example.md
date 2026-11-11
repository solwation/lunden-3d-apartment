# Host orchestra policy — copy outside the imported subtree

Replace every placeholder before use. This is configuration for a human/LLM reader,
not executable code. Keep project details here, never in the shared instructions.

- Entry rules and relevant topic documents: <paths>.
  Optional context map: <document sections per label, path or topic; omit if unused>.
- User language: <language>. Explicit user scope: <argument or request>.
- Mode: <single task or unattended queue>; empty scope: <bounded pass (default) or
  queue session>.
- Repositories and coordination issues: <owner/repo, status issue per repository>.
- Issue workflow authority: shared ISSUE-WORKFLOW.md for GitHub; specify an adapter
  for other trackers. Local ancestor/port constraints: <policy>.
- Excluded coordination labels; active/session labels: <names>. Session ID project
  short name and label prefix: <name, default repository name; `orkester: `>.
- Claims, race handling, expiry and handover: <rules; retain documented integration
  ownership for finished handoffs, distinct from an active implementation claim>.
- Integration queue and recovery: <where owner, branch/checkout, commit, evidence and
  next action are recorded; how the owner resumes a waiting handoff or PR>.
- Capacity: <concurrent active issue workers, includes helpers; integration-ready
  waits and parent summary labels use no slot>; whether the conductor's own
  implementation counts as a slot; direct conductor implementation: <allowed?>.
  Expensive shared verification: <browser/e2e/device runs and how they are queued>.
- Per-worktree isolation: <port range or allocation, server/config overrides, no
  `reuseExistingServer` across checkouts, check that the server serves this revision>.
- Worktree root and cleanup: <directory holding session checkouts; by default the
  integration owner removes an issue's checkout at follow-up and the session review and
  startup prune the root with `scripts/prune-worktrees.sh`; archive directory for
  unproven work, protected clones, or cleanup disabled>.
- Runtime/model selection: <available economical/stronger capabilities, concrete model
  identifiers/effort controls in the adapter, or selection unavailable/locked>. Follow
  the core resource policy; document limits rather than assuming inherited effort is
  economical. No provider-specific identifier is required by the shared core.
- Poll interval, idle watch, heartbeat and stale-work limits: <durations or disabled>.
  Wait mechanism: <how the runtime waits between polls and while idle>; when the
  runtime cannot wait: <e.g. run a bounded pass and report it>.
- Questions/blocked work: <channel and label lifecycle, e.g. the `user question`
  label>. Release rule in a pass: <e.g. only once no open issues remain/never>.
- Intake hooks: <local procedure and triggers, or none>; they run while workers are
  busy, never delaying startable work. Credentials never go here.
- Session review on queue drain: <default, extra areas to inspect, or disabled>.
- Workspace, server and browser setup: <relevant local docs>.
- Required tests, release checks and evidence-before-close: <rules>.
- Phase hooks: <definitions below or a link to project documentation; none if unused>.
- Publishing: <branch/PR/direct policy and authorization>; no force push by default.
- Delivery mode: <direct to main | PR the user merges | PR with auto-merge>.
- Cross-project boundaries and attribution/licenses: <rules>.
- Installed shared version: <release and exact commit>; update using shared INSTALL.md.
- Upstream discovery: <official repository/release source>; check at conductor
  startup/resume, reuse successful results for 24 hours by default. Relevant bug fixes
  always get a proposal; other upgrades <optional/opt-in preference>. Proposal channel
  and import authorization: <existing issue/change workflow and permissions>.

The shared workflow supplies planning, delegation, scoped verification and stop rules.
Do not duplicate it here. Project constraints override shared defaults, not explicit
user instructions or platform restrictions.

## Project phase hooks

Define only activities this project needs, using the phase names from ORCHESTRA.md:
`planning`, `implementation`, `verification`, `review`, `delivery`, `follow-up`.
Omitted phases have no additional hooks; core checks still apply. Remove this template
and the illustrative example if unused. Multiple hooks in a phase run in listed order.

```text
Hook name:
Phase:
Trigger (which changes/tasks) and timing (entry, exit or a specific phase event):
Procedure (practical steps/commands or a project document path and section):
Owner (conductor or named worker/role):
Required or optional:
Expected evidence, destination and completion condition:
```

For example, a project with UI/UX or 2D/3D graphics could define this screenshot lifecycle.
This is an illustration, not a default screenshot requirement. The project must supply the
actual routes, scenes, camera angles, viewports, test data and artifact/upload procedure
in its own guide.

| Hook | Phase and trigger/timing | Project procedure | Owner | Requirement and completion evidence |
| --- | --- | --- | --- | --- |
| Capture UI | `verification`: UI/UX or graphics changes, after preview/rendering is ready | Follow the project's screenshot guide for affected states/scenes | Implementation worker, or conductor if working alone | Required when triggered: images plus revision/environment in the assigned artifact destination |
| Inspect UI | `review`: UI/UX or graphics changes, before approving delivery | Inspect captured images against acceptance and any reference images | Conductor | Required when triggered: review outcome recorded; defects corrected and affected images refreshed |
| Share UI result | `follow-up`: UI/UX or graphics changes, before issue closure | Follow the project's upload guide; attach or embed reviewed images with fully-qualified URLs in the completion comment | Conductor | Required when triggered: directly visible image evidence for the delivered revision, or report the capture limitation |

### Expert panel review hook

A project may configure a recommended, optional review hook triggered when "work is complete" (for example, upon queue drain in an unattended session, or when a scoped epic is delivered). Instead of a single superficial pass or uncoordinated ad-hoc edits, the conductor convenes a structured multi-perspective review panel:

| Hook | Phase and trigger/timing | Project procedure | Owner | Requirement and completion evidence |
| --- | --- | --- | --- | --- |
| Expert review | `review`: when work completes (queue drained or scoped epic delivered) | Multi-perspective expert panel (see procedure below) | Conductor | Optional: independent analyses, synthesized discussion, and triaged improvement issues |

#### Procedure for multi-perspective review

1. **Identify expert roles:**
   Based on the changes delivered, the conductor identifies 2–3 distinct review lenses relevant to actual risks, for example:
   - *Security & robustness:* Permissions, untrusted inputs, boundary leaks, failure modes.
   - *Architecture & maintainability:* Cohesion, coupling, complexity, alignment with project idioms.
   - *UX, API ergonomics & accessibility:* Ease of use, naming, clear contracts, documentation completeness.
   - *Performance & resource efficiency:* Bottlenecks, caching, query load, memory footprint.

2. **Independent analysis (prevent groupthink):**
   The conductor assigns read-only review briefs to workers (or performs distinct focused passes within capacity). Each expert examines the combined diff independently against its assigned lens, noting concrete gaps, risks, and potential improvements before comparing notes with other perspectives.

3. **Discussion and synthesis:**
   The perspectives are weighed together (either through agent discussion where supported, or synthesized by the conductor). The conductor filters false positives, resolves trade-offs between competing concerns (such as strict security versus ergonomics), and consolidates findings.

4. **Actionable issues instead of immediate edits:**
   In accordance with the orchestra's review principles, review workers never make direct uncoordinated code edits during the review. Valid findings are converted into separately scoped, prioritized issues in the project tracker with clear acceptance criteria for future queue cycles.

### Image hosting and embedding patterns

Visual evidence in completion comments and issues should be directly visible via Markdown image syntax (`![description](url)`), but should avoid bloating the main branch git history or consumers importing the project via `git subtree`. Recommended patterns for project upload guides:

1. **Dedicated assets or orphan branch**:
   Maintain an independent branch (e.g. `assets` or `screenshots`) created without parent history (`git checkout --orphan assets`). Push images there and link via raw URLs:
   `https://raw.githubusercontent.com/<owner>/<repo>/assets/<path>/<image>.png`
   This keeps binary files out of `main` and consumer subtree clones.

2. **GitHub Release or tag assets**:
   Attach visual artifacts to a dedicated release or tag (e.g. `verification-assets`) using the GitHub CLI:
   `gh release upload <tag> <path>/<image>.png`
   Embed using the release asset URL:
   `https://github.com/<owner>/<repo>/releases/download/<tag>/<image>.png`

3. **GitHub Pages or static doc sites**:
   If the repository publishes GitHub Pages (e.g. from `docs/` or a `gh-pages` branch), store verification images in the published documentation assets directory and reference the public URL (`https://<owner>.github.io/<repo>/...`).

4. **Project upload script**:
   Provide a helper script (e.g. `scripts/upload-asset.sh`) that uploads an image to the project's chosen bucket/storage (S3, R2, or a dedicated storage service) and outputs the formatted `![alt](url)` markdown snippet directly to standard output for the agent or conductor to paste into the comment.

#### Dashboard compatibility (`solwation/github-dashboard`)

When visual evidence is reviewed in [solwation/github-dashboard](https://github.com/solwation/github-dashboard), adhere to these formatting rules:

- **Markdown image syntax only:** Use `![alt](url)` or `[![alt](img-url)](link-url)`. Never use raw HTML `<img>` tags: `github-dashboard` disables HTML parsing (`html: false`) to safeguard against XSS, rendering raw tags as escaped text.
- **HTTPS required:** Always use `https://` URLs. The dashboard enforces a strict Content Security Policy (`img-src 'self' https: data: blob:`) that blocks unencrypted `http://` resources.
- **Standalone paragraph for responsive layout:** Place the image embed in its own paragraph (separated by blank lines above and below). `github-dashboard` detects standalone image blocks (`.markdown-image-block`) and formats them responsively beside the text on wider screens instead of breaking the reading line.
- **GitHub blob URLs:** GitHub blob URLs (`https://github.com/<owner>/<repo>/blob/...`) are automatically rewritten to raw URLs (`?raw=true`) by `github-dashboard`, but using `https://raw.githubusercontent.com/...` or an explicit `?raw=true` parameter ensures compatibility with all Markdown readers.

For optional activities, mark them optional explicitly and report a failure or skip.
An unavailable required tool does not silently make an activity optional. Existing
queue intake hooks keep their own triggers and schedule under COORDINATION.md.
