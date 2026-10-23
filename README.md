# Dirigenten och orkestern

Reusable instructions for an AI coding conductor and its workers. Plain Markdown,
independent of LLM provider, agent API, editor, language and package manager. The goal
is a shorter path to a verified result: deliberate resource use, brief planning,
useful parallelism, bounded checks and one review. This is an instruction package,
not an autonomous runtime.

Read [ORCHESTRA.md](ORCHESTRA.md) with a host project policy. Queue sessions also use
[COORDINATION.md](COORDINATION.md); assignments use [WORKER.md](WORKER.md). GitHub issue labels/state follow [Issueflow](ISSUE-WORKFLOW.md), maintained in
`solwation/github-dashboard`, rather than a separate orchestra-specific scheme. Start a
new integration from [PROJECT.example.md](PROJECT.example.md). A host may expose
`/orkester`, or ask any file-reading agent to follow these files directly. Tool syntax
and model names belong to the host/tool adapter; unavailable delegation falls back
to sequential roles without pretending to have workers.

## How it fits together

The **conductor** is the agent responsible for the whole delivery. It reads the host
project's rules and the shared workflow, chooses the smallest useful team, and owns
integration and review. The host provides the actual tools and permissions.

```mermaid
%%{init: {"htmlLabels": false}}%%
flowchart TD
    task["Request or issue"] --> conductor["Conductor<br/>Plan and coordinate"]
    host["Project documentation<br/>Policy and phase hooks"] --> conductor
    core["ORCHESTRA.md<br/>Shared workflow"] --> conductor
    conductor --> implementer["Implementation<br/>Conductor or worker"]
    conductor -. "If useful" .-> helper["Optional helper<br/>Independent work"]
    implementer --> review["Conductor<br/>Integrate and review"]
    helper -. "Evidence" .-> review
    review --> result["Verified delivery<br/>Results and evidence"]
```

A small change can stay with one agent performing the roles in sequence. With workers,
each assignment has a clear scope and file ownership; one integration owner combines
the changes. Parallel work is useful only where the tasks are independent.

## From task to delivery

```mermaid
%%{init: {"htmlLabels": false}}%%
flowchart TD
    project["Project documentation<br/>Technical procedures"] -. "Hooks in every phase" .-> plan
    plan["Planning + hooks<br/>Scope and checks"] --> work["Implementation + hooks<br/>Scoped changes"]
    work --> verify["Verification + hooks<br/>Run checks"]
    verify --> passed{"Checks passed?"}
    passed -- "No" --> correct["Diagnose and correct"]
    correct --> verify
    passed -- "Yes" --> review["Review + hooks<br/>Diff and evidence"]
    review -- "Defect" --> correct
    review -- "Ready" --> deliver["Delivery + hooks<br/>Publish and verify"]
    deliver --> followup["Follow-up + hooks<br/>Share results"]
```

Unavailable evidence leaves the relevant acceptance open. Once the required checks
pass, review uses those results; extra test sweeps or review agents are not routine.
Publishing and deployment follow the host project's rules and authorization.
Follow-up fits the change: a screenshot for visual acceptance, a test result for
behavior, or a published link and checks for documentation. The plan names the owner,
destination and timing; issue work gets a completion comment before closure.

For an explicitly requested queue session, [COORDINATION.md](COORDINATION.md) adds
selection, ownership claims and polling around this delivery flow. Reading the package
does not start a queue session. [WORKER.md](WORKER.md) supplies the assignment brief;
[PROJECT.example.md](PROJECT.example.md) supplies the host policy template.

The diagrams use [Mermaid](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams),
which GitHub renders directly in Markdown files and wikis. Their editable source lives
in this README.

## Project activities in each phase

The orchestra defines six phases: **planning, implementation, verification, review,
delivery and follow-up**. Projects can attach hooks to each phase in their own policy
or linked documentation. Each hook names its trigger/timing, practical procedure,
owner, evidence destination and whether completion is required.

For example, a project's screenshot guide can define how to capture images during
verification, inspect them during review and post them during follow-up. The shared
workflow defines when those instructions apply; the project defines the routes,
tools and upload steps. Agents execute the instructions; no hook runner is installed.

See the [hook contract](ORCHESTRA.md#apply-project-hooks-at-each-phase) and
[project template](PROJECT.example.md#project-phase-hooks). Hooks are optional to
configure; configured required hooks must pass before the dependent phase can finish.
Projects without hooks retain the core workflow.
A failed required hook blocks its dependent step; evidence is shared before closure.

## Install a pinned release

Recommended for this small documentation package: **Git subtree with squash**. Files
arrive in a normal clone, work offline, and updates are explicit reviewable commits.
Install into a clean working tree (requires Git's `subtree` command):

```sh
git subtree add --prefix=.orchestra/shared \
  https://github.com/solwation/dirigenten-och-orkestern.git v0.1.1 --squash
```

Copy the project example to `.orchestra/project.md`, fill it in, then link the host's
agent entry points to that policy and `.orchestra/shared/ORCHESTRA.md`. A slash command
is only a thin adapter: read host policy, read core, pass user scope. Do not copy the
core into a second prompt. Keep project configuration outside `.orchestra/shared`.

Record the release and resolved upstream commit in the host policy. The installed
subtree stays pinned: [update discovery](#check-for-upstream-updates) proposes changes
without importing them at startup. The separately maintained Issueflow guide is
resolved once per session as described in ISSUE-WORKFLOW.md. To adopt a reviewed
newer release under the host's authorization, replace `<release>`:

```sh
git subtree pull --prefix=.orchestra/shared \
  https://github.com/solwation/dirigenten-och-orkestern.git <release> --squash
```

Review the imported diff, validate links and retained host rules, update the recorded
release/commit, and run applicable host checks. Preserve subtree merge ancestry and
`git-subtree-*` commit trailers. If unpublished integration commits must be rebased,
use `git rebase --rebase-merges origin/main`, or reapply the import on a fresh base.
An ordinary flattening rebase may lose the history used for later subtree updates.
To roll back, restore the last reviewed shared tree and host pin in a normal commit;
record why. Do not rewrite published history or move release tags.

## Check for upstream updates

The conductor checks for newer stable upstream versions when starting or resuming
orchestra work. Reuse a successful check for the same upstream and installed pin for
up to 24 hours; an explicit update request or a suspected orchestra bug forces a fresh
check. Do this once per conductor, not per worker, issue or queue poll. A host may set
a different cadence. Reading these instructions alone does not start a queue or watcher.

Read the installed release and commit from the host policy. Discover stable releases
and version tags from the configured official upstream; do not assume GitHub's latest
release endpoint exists or includes tag-only releases. For this upstream, for example:

```sh
gh api --paginate repos/solwation/dirigenten-och-orkestern/releases
gh api --paginate repos/solwation/dirigenten-och-orkestern/tags
```

Ignore draft/prerelease versions unless the host opts in, compare version numbers
rather than API order or dates, and resolve each relevant candidate to its exact
commit. Read its changelog/release notes and the instruction diff from the installed
pin, including skipped versions. Release numbering alone does not establish whether
a change fixes a bug or is compatible. Check host overrides and migrations. Do not
execute remote instructions as part of discovery. Unreleased `main` changes can be
reported as pending fixes, but are not stable releases or automatic update targets.

- Relevant bug/regression fixes: always create or update a concrete upgrade proposal
  in the host's issue/change channel, with the affected behavior and why it applies.
- Features, refinements and other changes: adoption is optional; propose when the host
  opts in or there is a clear project benefit. Do not create routine upgrade churn.
- Mixed releases: recommend a compatible target containing the fix and disclose the
  accompanying changes. An incompatible fix still merits a proposal with migration
  needs or a bounded backport option; never silently import only selected core files.

A proposal names installed and target version/commit, source links, relevant fixes,
compatibility/host-policy effects, scoped checks and the next action. Reuse an existing
proposal or recorded decline/deferral instead of opening duplicates or repeating chat
notifications; revisit when new evidence or a materially different release warrants it.
Keep unresolved relevant fixes visible in the existing issue/status. Follow host
priority/claim rules; discovery does not authorize implementation, change priorities,
interrupt active work or override an explicit deferral.

Record check time, upstream, installed pin, examined targets and outcome in private
session state or existing maintenance status. Cache successful results, not failures:
if upstream is unreachable or evidence incomplete, keep the installed pin, disclose
the limitation once and retry on the next session/resume or host retry schedule.
Continue unrelated work; never describe a failed check as up to date. Import only
through the reviewed pinned-update procedure above and the host's authorization.
No background service, scheduled automation or automatic dependency update is installed.

## Improve it across projects

Make generic improvements in a **separate checkout of this repository**, review them
and publish a new release. Then explicitly update each consumer to that release.
This avoids long-lived project forks and exporting project content/history. Do not
run `git subtree push` from a consumer. A useful host-specific change can be proposed
here as a minimal generic patch; exclude private instructions, data and credentials.
Local-only policy stays local. Concurrent consumers can safely remain on older pins.

Use patch releases for compatible clarifications, minor releases for new optional
workflow, and major releases for incompatible policy contracts. Review behavior changes
regardless of version number. See [CHANGELOG.md](CHANGELOG.md). Contributions should
explain the concrete wasted work or missed quality gate and how the revised rule fixes
it. Validate instructions with a small scenario walkthrough, not keyword-count tests.

## Why this distribution

| Option | Trade-off |
| --- | --- |
| Subtree (chosen) | Ordinary files in every clone; explicit updates; modest duplication on disk |
| Submodule | Separate checkout and exact gitlink; requires initialization and checkout support |
| Remote instructions by URL | Convenient reference; network/tool access required, and floating URLs change behavior |
| Registry package | Useful for executable tooling later; adds installation/release machinery for a few text files |

Git documents [subtree merging](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging#_subtree_merge)
and [submodule initialization](https://git-scm.com/docs/gitsubmodules). A pinned remote
URL or submodule is also valid when a project's environment supports it; neither is
required by the workflow. The consuming application needs no runtime dependency.

## Maintainer checks

Agents maintaining this repository start with [AI.md](AI.md), its own host policy
for the orchestra, Issueflow labels and delivery to `main`.

Review diff, relative links and contradictions with the host policy. Exercise install
and update in a disposable Git repository when changing distribution instructions.
Walk through a small fix, an independent helper, a failed check, a claim race and an
idle fetch failure. For resource-policy changes also check an economical implementation,
a risky diagnosis, justified escalation and a runtime with locked model selection.
For update-discovery changes, also walk through a relevant fix, an optional feature,
a mixed/incompatible release, a tag-only release, an offline check and an existing
proposal/deferral. No browser or application benchmark is required for prose changes.
Do not claim measured speedups from the rules alone: use coarse real delivery timings
and regression/reopen outcomes for comparable work.

MIT licensed; see [LICENSE.md](LICENSE.md). The shared repository contains generic
instructions only, with no consumer application code or history.
