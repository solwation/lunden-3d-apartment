# Contributing and maintenance

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

## Field reports

A consumer's experience is the best input for rule changes. The way in is **an issue in
this repository** using the template `.github/ISSUE_TEMPLATE/field-report.md`, not a
pull request or a file in the package, so no project content lands in the subtree. A
consumer's conductor may write the report when the maintainer asks for one. The template
asks for project and runtime, installed version, what worked, where work was lost and
suggestions per rule with file and section; give a revision or commit for each
observation, and keep private project content, data and credentials out. Consumers do
not need to read the template in normal operation.

## Maintainer checks

Agents maintaining this repository start with [AI.md](AI.md), its own host policy
for the orchestra, Issueflow labels and delivery to `main`.

Review diff, relative links and contradictions with the host policy; `python3
scripts/check-links.py` checks relative links and heading anchors (also run by CI). Exercise install
and update in a disposable Git repository when changing distribution instructions.
Walk through a small fix, an independent helper, a failed check, a claim race and an
idle fetch failure. For resource-policy changes also check an economical implementation,
a risky diagnosis, justified escalation and a runtime with locked model selection.
For update-discovery changes, also walk through a relevant fix, an optional feature,
a mixed/incompatible release, a tag-only release, an offline check and an existing
proposal/deferral. No browser or application benchmark is required for prose changes.
Do not claim measured speedups from the rules alone: use coarse real delivery timings
and regression/reopen outcomes for comparable work. Verification evidence (screenshots,
logs) goes in the issue or the release, not in the repository, because `git subtree`
copies every file to each consumer.

## Release checklist

Choose the version under the [versioning rules](#improve-it-across-projects), then:

1. In [CHANGELOG.md](CHANGELOG.md), add `## X.Y.Z — YYYY-MM-DD` directly under
   *Unreleased*, so the bullets become that version's section.
2. Set the pin `git subtree add ... vX.Y.Z --squash` in [README.md](README.md) and
   [INSTALL.md](INSTALL.md); both change in every release.
3. Commit as `Release vX.Y.Z` and tag that commit `vX.Y.Z` (the latest tags are
   lightweight, earlier ones annotated; either works). Push the commit and the tag.
4. Create the GitHub release `vX.Y.Z — <short Swedish subtitle>` (see `gh release list`
   for the style) with the CHANGELOG section as notes.
5. Run `scripts/check-release.sh`: pins, a release for every tag and a CHANGELOG
   heading for the latest tag must all match.
6. Never move or delete a tag. If tag or release creation is denied by permissions,
   leave the issue's release criterion open, report the blocker and do not close an
   issue whose only remaining criterion is the release.
