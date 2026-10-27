# Install and update

How to install [Dirigenten och orkestern](README.md) into a host project, keep it
pinned, discover upstream releases and adopt them deliberately.

## Install a pinned release

Recommended for this small documentation package: **Git subtree with squash**. Files
arrive in a normal clone, work offline, and updates are explicit reviewable commits.
Install into a clean working tree (requires Git's `subtree` command):

```sh
git subtree add --prefix=.orchestra/shared \
  https://github.com/solwation/dirigenten-och-orkestern.git v0.4.1 --squash
```

Copy the project example to `.orchestra/project.md`, fill it in, then link the host's
agent entry points to that policy and `.orchestra/shared/ORCHESTRA.md`. A slash command
is only a thin adapter: read host policy, read core, pass user scope (an empty scope
requests a bounded pass). Do not copy the
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

