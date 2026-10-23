# Issue workflow authority

For GitHub projects, follow **Issue workflow instructions** from
[solwation/github-dashboard/public/ISSUEFLOW.md](https://github.com/solwation/github-dashboard/blob/main/public/ISSUEFLOW.md).
This is the guide shown by that dashboard, and the source of truth for priority,
work labels, ownership metadata, reopening and closure semantics. Do not maintain a
competing interpretation in the orchestra or copy the dashboard's own deployment
workflow: its project's internal AI.md and orchestra skill are not this public guide.

At session start, fetch/read the current guide once and record its source revision.
Use a GitHub connector, an authenticated checkout or (with GitHub CLI):

```sh
gh api repos/solwation/github-dashboard/commits/main --jq .sha
# Substitute that returned SHA for <sha>; read this exact revision, not a moving URL.
gh api -H 'Accept: application/vnd.github.raw+json' \
  'repos/solwation/github-dashboard/contents/public/ISSUEFLOW.md?ref=<sha>'
```

The reviewed [bundled snapshot](issueflow/ISSUEFLOW.md) is byte-for-byte from revision
`fec18ccd69c2ea056101a6ed2bb60e08cf121aba`, with its [license](issueflow/LICENSE.md).
Use it if the source is temporarily unreachable, disclose the fallback and retry on
resume; do not interpret failure as a policy change. Keep one resolved guide per
session instead of fetching it per label operation. Re-read after an explicit user
policy update. Refresh the snapshot/provenance in a shared release when upstream
changes; consumers then receive the same reviewed offline fallback.

Use canonical labels, remove *all recognized active-work labels* when pausing or
closing (not just the spelling `in-progress`), and keep ownership separate from status.
A worker waiting for integration is paused; remove work labels, and reclaim only when
integration/review actually starts. Do not remove another active owner's labels.
The guide's issue state is authoritative; labels named done/closed do not close an issue.
Priority is assessed by impact and urgency, not automatically by issue type. Host/user
constraints such as a child-priority ceiling or a port priority remain applicable.
Local dashboard display settings are not remotely discoverable workflow permissions.

The cited guide currently documents **GitHub**, not GitLab. Other issue trackers need
an explicit host adapter for their API, states and label mapping; do not claim that
GitHub issue-event timing or endpoints work there. The conductor/worker method itself
is tracker-independent.
