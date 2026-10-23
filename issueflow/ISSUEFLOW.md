# Issueflow-compatible issue workflow

Read and follow this guide when working with GitHub issues in a project displayed by Issueflow. It is public, requires no sign-in, and applies to any project or tool. Follow the project's own instructions and the user's explicit decisions when they take precedence over this suggested workflow.

## Track changes and choose a priority

- Create one issue per independently reviewable change before implementation. Reuse an existing issue if it already covers the work. Describe the problem, expected result and concrete acceptance criteria.
- Give each issue exactly one canonical priority label: `priority: high`, `priority: medium` or `priority: low`. Use medium as the default when no different priority has been established; assess impact and urgency rather than assigning a priority from the issue type alone. High suits blocking failures and urgent work; low suits optional polish. Record a short rationale, respect the user's chosen priority, and remove conflicting priority labels.
- Priority controls ordering, not work status. An open issue without a recognized priority is displayed as medium. Conflicting built-in priority labels resolve to high before medium before low; this is a display fallback, not a recommended workflow.

## Show actual work status

- Add `in-progress` immediately before actively working on an issue. An open issue with a recognized work label appears in **In progress**; another open issue appears in **Backlog**.
- Remove the work label when work pauses, waits in an integration queue, is handed back, or finishes. Do not leave a claim active while nobody is working. For a handoff, make ownership and the next step clear.
- Close the GitHub issue only when its acceptance criteria are satisfied and the project's required verification is complete. Remove all recognized work labels when closing. GitHub's issue `state` is authoritative: a closed issue appears in **Closed** even if a work label was accidentally left behind. A `closed`, `done`, or similar label alone does not close an issue.
- When reopening, remove stale work labels. Add a work label again only when active work resumes, so a new work interval can be recorded.
- Assignees and owner labels (for example `orkester: session-id`) describe ownership. They do not make an issue in progress and do not establish its priority.

## Parent issues and sub-issues

Issueflow places each issue by its own state and labels: a sub-issue in progress does not move its parent. Keep the parent's work label in step with its sub-issues so the parent shows real progress and timing.

- When work starts on the first sub-issue, also add the work label (`in-progress`) to the parent if it does not already have it. The parent's **In progress** start time is then recorded from that moment.
- Keep the parent's work label while any sub-issue is in progress or work continues on the parent itself. Pausing or finishing one sub-issue does not remove the parent's label while others are active.
- When no sub-issue is in progress and the parent is not being worked on, remove the parent's work label, even if sub-issues remain open; the parent returns to **Backlog** until work resumes.
- Close the parent only when all its sub-issues are closed or deliberately split out and the parent's own acceptance criteria are satisfied; remove its work labels when closing. Closing every sub-issue does not close the parent automatically.
- A parent's priority stays its own. Sub-issues normally follow the same priority rules as any other issue.

## Labels understood by the default detection

Matching is case-insensitive. Except for a custom work label described below, leading/trailing whitespace is ignored and runs of spaces, underscores, colons and hyphens are treated as spaces. For example, `in-progress`, `in_progress` and `IN PROGRESS` match the same built-in work label.

| Meaning | Recognized normalized labels |
| --- | --- |
| Active work | `in progress`, `status in progress`, `wip`, `working`, `doing`, `pågår` |
| High priority | `high`, `critical`, `urgent`; any of those with a `priority ` prefix or ` priority` suffix (or both); `p0`, `p1`, `priority p0`, `priority p1` |
| Medium priority | `medium`, `priority medium`, `medium priority`, `priority medium priority`, `p2`, `priority p2` |
| Low priority | `low`, `priority low`, `low priority`, `priority low priority`, `p3`, `p4`, `priority p3`, `priority p4`, `reviewer filed` |
| Coordination issue | `agent coordination`, `orkester` |

Coordination labels identify coordination issues that the dashboard can hide using its coordination filter. They do not set priority or work status. A label such as `orkester: session-id` is ownership metadata and does not match the coordination label `orkester`.

Repositories can override the work label and labels for high, medium and low in the dashboard's label settings. A custom work label **replaces** the default work labels and uses case-insensitive exact matching (the configured value is trimmed; the issue label itself is not normalized). A matching custom priority label is checked before built-in priorities, in high/medium/low order. Built-in priority detection still applies if no custom priority matches. Settings are local dashboard configuration, not GitHub-wide workflow rules; share them separately if others need the same view. Prefer the canonical labels above for a portable workflow.

## Timing, order and limitations

- Backlog sorts by priority and then creation time, oldest first within a priority. In progress sorts by the current start time, oldest first (falling back to creation time for ordering when no start time is known). Closed sorts by GitHub's closure timestamp, newest first.
- The active start time comes from GitHub's issue event history: the earliest still-active recognized work-label addition since the latest closure or reopening. Removing that label ends its interval; closing or reopening resets tracked intervals. This is the current interval, not accumulated working time or a timesheet. If several work labels are active, remove all of them on pause or completion.
- Closure time comes from GitHub's `closed_at` timestamp, not commit messages, label names, local clock estimates or the time the dashboard noticed a change. Closing commit or pull-request details are optional context and can be unavailable; they do not control the column or closure time.
- Issueflow reads GitHub issue state, labels and events; editing this file or attaching it to a repository does not change issues, create labels or grant a tool permission to write. Apply changes through an authorized GitHub interface.
- The dashboard excludes pull requests from issue columns and displays only issues closed in the last 30 days. Search and coordination filters can hide otherwise valid issues.
- GitHub requests are paginated, but missing permissions, rate limits, network failures or unavailable event history can prevent fresh data or a start time from loading. Cached content may be shown while revalidating; the view is not an instantaneous source of truth. Check the issue and its history directly on GitHub when uncertain.
- Access to private repositories and optional commit details depends on token permissions. Do not put tokens, secrets, private issue snapshots or account-specific instructions in this public guide or a shared copy.

This guide describes Issueflow's default detection and per-repository overrides. Keep a project copy synchronized when the dashboard's detection rules change.
