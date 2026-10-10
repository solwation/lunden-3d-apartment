# CLAUDE.md — lunden-3d-apartment

Browser-based first-person 3D walkthrough of apartment **L1007, Kv. Lunden** (Peab), built from
the dimensioned floor plan `L1007_mattsatt_planritning.pdf`. The user writes in Swedish — reply
in Swedish. Code, comments and this file are in English; UI text is Swedish.

## Workflow rules

- **No branches, no PRs.** Commit and push directly to `main`.
- **Basic function first.** Work that isn't needed right now goes into a GitHub issue
  (`gh issue create`) instead of being done on the side. Keep issues small and concrete;
  reference the issue number in the commit that resolves it (`Fixes #N`).
- **Problems found along the way become bug issues, not fixes on the fly** (the user): a failing test or bug outside
  your issue's scope (pre-existing, or caused by someone else's change) gets its own issue titled `Bugg: …` with a
  `Lapp:` line, what fails, how to reproduce and the suspected cause/commit — then carry on and finish your own issue.
  Only fix it in your change if your change caused it.
- **Several agents work in parallel (other computers push to `main` too).** Never take an issue that
  is labelled `in-progress` (`gh issue list --state open --json number,title,labels`). Before starting
  **each** new issue: `git pull --rebase origin main`, then inspect `git status`. Preserve any uncommitted changes; use an isolated checkout when another agent
  shares the directory, and never discard their work.
  Re-check the issue's label right before labelling it. Work on one issue at a time until done.
- **Label issues `in-progress` when you start on them** (`gh issue edit N --add-label
  in-progress`). The label must never outlive the work: **remove it** (`--remove-label
  in-progress`) when you stop without finishing, when you close the issue after implementing it
  (`Fixes #N` closes it, but does not remove the label — do that too), and when you **reopen** an
  issue. A reopened issue starts without the label until someone picks it up again.
- **Priorities are labels.** Every issue carries exactly one of `priority: high`, `priority: medium`,
  `priority: low` (set it when creating the issue; the user decides when unsure, default `priority: medium`).
  When picking work, take the highest-priority open issue that is not `in-progress` (oldest first within a level;
  `gh issue list --state open --label "priority: high"`); an issue without a priority label counts as medium. Change a
  priority only when the user asks. Topic labels (e.g. `architecture`) are optional extras. Architecture issues whose
  exact measurements are missing from Peab's material keep their geometry preliminary: centralise and mark the values as
  assumptions (*guess*), never replace one guess with another and call it verified (docs/peab/arkitekturgranskning-2026-10-04.md).
- **Every new issue gets a `Lapp: <text>` line** in its body (#340): 2–6 plain everyday Swedish words
  ("Laga glitchiga kuddar", "Kaffeburk vid bryggaren") — the open issues are post-its on the fridge door; without
  the line the title is cleaned up automatically (src/todo.js `cleanTitle`).
- **Reference images** (screenshots, product photos, Peab renders) that the user sends in with a
  request are always committed to `docs/` (descriptive file names, e.g. `docs/sekretar-bang-oppen.png`)
  and linked from the issue as `https://github.com/solwation/lunden-3d-apartment/blob/main/docs/<file>`,
  so the agent working on the issue sees them. Push the images before creating the issue.
- Verify changes in a real browser before pushing (see [verification](docs/development/verification.md)). Don't claim something
  works from reading the code alone.
- **Every user-visible change gets an entry in `data/changelog.json`** (Swedish, newest first,
  next `id`), in the same commit — **one short sentence**, no digressions. It is shown only on the
  note on the freezer (the start screen says nothing about news; visitors find the note themselves);
  entries newer than the visitor's last visit are marked "Nytt".
  **The id is picked last:** after your final `git pull --rebase`, right before pushing, renumber your entry to
  the file's max id + 1 and keep it on top — never an id chosen when the work started (parallel agents push in
  between). The ids must stay unique and strictly descending in file order; `tools/stamp.sh` warns (`::warning::`
  in the Pages run) when they are not. The published order and "Nytt" do not rely on the id (#341):
  `tools/changelog_stamp.py` gives each entry `t` = the committer time of the commit that added its id line
  (rewording an entry later keeps its `t`; needs full history, `fetch-depth: 0`) and sorts by it; the page keeps the
  highest `t` seen (`lunden.changelogSeenT`, migrated from the old id key) and falls back to file order + id without `t`.
- Keep this entry point, the relevant topic files and `README.md` up to date when behaviour, structure or known facts change.

## Project orientation

Static ES-module Three.js site, with no framework or development build step. Scene geometry comes from `data/plan.json`, extracted from the dimensioned PDF. Coordinates: x east, z south, y up; north is −z. `src/config.js` holds shared measurements and tunables. `src/bootstrap.js` checks published versions before `src/main.js` builds the scene.

## Cheat-code maintenance

When adding, changing or removing a cheat code, update the shared `src/cheats.js` catalogue so both public console help and the bike-room graffiti stay current. The secret `sarah is the goat` and `olof is the goat` commands must always be excluded from all public lists.

## Shared conventions

- Plain ES modules, no framework, no bundler. Keep three.js pinned in the import map.
- Target hardware includes a Surface Pro (Intel Iris 640): keep draw calls and lights modest,
  pixel ratio capped at 1.5, one shadow-casting light.
- New tunable numbers go in `src/config.js` with a comment saying where they come from.

## Read the relevant topic before changing it

| Topic | Read when working on |
|---|---|
| [Architecture and geometry](docs/development/architecture.md) | building geometry, doors, stairs, collision, floor levels or PDF extraction |
| [Site, streets and neighbours](docs/development/environment.md) | streets, courtyard, neighbours, cars, exterior routes or patio |
| [Furniture and furnishings](docs/development/furniture.md) | furniture models, cupboards, cushions, beds or placement dimensions |
| [Plants and pots](docs/development/plants.md) | plants, pots, entrance greenery or shared foliage geometry |
| [Graphics, materials and lighting](docs/development/graphics.md) | lighting, shadows, weather, materials, curtains or reflections |
| [Interactions, controls and HUD](docs/development/interactions.md) | input, HUD, raycasts, holding, rearranging, drawings, toys or score |
| [Life simulation and chores](docs/development/life.md) | domain events, inventory, containers, cleaning, dishes, rubbish or everyday tasks |
| [Food, kitchen appliances and drinks](docs/development/food.md) | food preparation, appliances, coffee, cups, fridge storage or drinks |
| [Animals, audio and smart devices](docs/development/animals-audio.md) | cats, sound, music, speakers or smart devices |
| [Saving, shared layouts and cloud](docs/development/storage.md) | saved home, resume state, IndexedDB, shared layouts, Cloudflare persistence or crash reports (`src/crashlog.js`) |
| [Deployment, startup and updates](docs/development/deployment.md) | publishing, startup loading, version checks, changelog or install flow |
| [Local server and debug parameters](docs/development/local-development.md) | starting a local server or choosing camera/debug URL parameters |
| [Browser verification and test selection](docs/development/verification.md) | selecting browser tests, screenshots and checks before pushing |
| [Rendering performance](docs/development/performance.md) | mesh merging, culling, warm-up, resolution or render budgets |
| [Apartment facts, materials and references](docs/development/plan-material.md) | verified apartment/site facts, furniture references and chosen finishes |

Common routes: a wall or door change → architecture + plan/material facts + verification; a touch control → interactions + verification; a life item → life + food + storage; startup/update → deployment + storage + verification. Read several topics when a change crosses their responsibilities. The per-topic module/test maps retain the detailed historical implementation notes.

## Keep the structure current

Put new implementation details in the existing topic that owns them; do not append issue notes to this entry point. Update the affected module and test references together. If a topic needs splitting, add its replacement links and reading guidance here. Preserve source/assumption distinctions and project-wide rules. Keep Markdown links relative to their document; code-span paths remain relative to the repository root.
