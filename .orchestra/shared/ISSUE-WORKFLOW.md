# Issue workflow authority

For GitHub projects, follow **Issue workflow instructions** from
[solwation/github-dashboard/public/ISSUEFLOW.md](https://github.com/solwation/github-dashboard/blob/main/public/ISSUEFLOW.md).
This is the guide shown by that dashboard, and the source of truth for priority,
work labels, ownership metadata, reopening and closure semantics. Do not maintain a
competing interpretation in the orchestra or copy the dashboard's own deployment
workflow: its project's internal AI.md and orchestra skill are not this public guide.

At session start, fetch/read the current guide once, compare it with the bundled
snapshot and record the result. Use a GitHub connector, an authenticated checkout or
(with GitHub CLI):

```sh
# 1. The file's latest change commit (not main's SHA, which moves on every commit)
gh api 'repos/solwation/github-dashboard/commits?path=public/ISSUEFLOW.md&per_page=1' --jq '.[0].sha'
# 2. The guide at that exact revision; compare with issueflow/ISSUEFLOW.md
gh api -H 'Accept: application/vnd.github.raw+json' \
  'repos/solwation/github-dashboard/contents/public/ISSUEFLOW.md?ref=<sha>'
```

Record "identical to snapshot `<snapshot rev>`" when the content equals the snapshot,
otherwise the file's change commit. On a difference, follow the fetched guide and
create (or reuse) an issue in `solwation/dirigenten-och-orkestern` (a consumer may use
its upstream proposal channel) to refresh the snapshot, instead of reinterpreting rules.

The reviewed [bundled snapshot](issueflow/ISSUEFLOW.md) is byte-for-byte from the file's
change commit `e22d6dc8ca542a5e76bcecff12532542558ebbb1`, with its
[license](issueflow/LICENSE.md).
Use it if the source is temporarily unreachable, disclose the fallback and retry on
resume; do not interpret failure as a policy change. Keep one resolved guide per
session instead of fetching it per label operation. Re-read after an explicit user
policy update. Refresh the snapshot/provenance in a shared release when upstream
changes; consumers then receive the same reviewed offline fallback.

The guide is the home of label, priority and state rules. Orchestra additions: a worker
waiting for integration is paused (work labels removed until integration/review starts);
host/user constraints such as a child-priority ceiling still apply; and local dashboard
settings are not remotely discoverable workflow permissions.

The cited guide currently documents **GitHub**, not GitLab. Other issue trackers need
an explicit host adapter for their API, states and label mapping; do not claim that
GitHub issue-event timing or endpoints work there. The conductor/worker method itself
is tracker-independent.
