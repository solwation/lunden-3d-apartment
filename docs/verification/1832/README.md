# Faster outdoor sprint (#1832)

Baseline source `33116bd5`; production changes only the new guessed `PLAYER.runOutdoor = 4.8 m/s` and the existing Player's sprint-speed selection. Outdoor sprint is 50% faster than the former 3.2 m/s. Ordinary walking stays 1.6 m/s; indoor sprint remains 3.2 m/s. Shift/full-stick thresholds, crouch, coffee multiplier, jetpack speed selection and 5 cm collision substeps retain their existing behaviour.

`Player.runSpeed` excludes basement/core areas from the existing broad outdoors flag. In the real app `world.core` composes `CoreHouse` A/B/C through `Core.attach`; `Core.contains` checks all attached parts before its own L core. No house geometry or dimensions changed.

## Checks

- `node.txt`: five actual-Player Node checks pass. Supported lanes establish outdoor/walk/indoor speeds, full vs half joystick, diagonal and crouch behaviour; garage/core/visited-unit/hidden-room classification; thin-wall stopping at 15/30/60 FPS and a 1 second frame, including 1.8× coffee boost. Parameterized actual Core/CoreHouse containment methods cover L/A/B/C using their published band data. This is classification/controller coverage, not a new traversal or geometry audit of all four houses.
- `walk-sprint.txt`: all eight affected contracts in `tools/walktest.html?sprint` pass: park/outdoor 4.80, indoor 3.20, outdoor hedge stop, full-stick indoor pace, bathroom wall at 30 FPS, closed entrance and correct pace through an open doorway. The new query runs only these contracts; the default fixture retains its full old route set. Unrelated routes were not claimed as rerun.
- `result.json` / `state.json`: actual app native W/Shift and real CDP touch events pass all checks, with zero page errors. Keyboard walk 1.60, outdoor Shift 4.80, indoor Shift 3.20; the actual full touch gesture supplies analog 1.0 and reaches 4.80 m/s outdoors.
- Syntax and `git diff --check` pass.

Commands:

```sh
THREE_DIR=/path/to/three node --test tools/outdoorsprinttest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/outdoorsprintbrowser.cjs GAME OUT
```

The first app fixture attempted desktop pointer lock in a touch-enabled context that the app treated as a phone. The correction starts with a desktop context, then enables CDP touch for the actual touch route. Only the app part was repeated (`SPRINT_APP_ONLY=1`), reusing the unchanged green World fixture. No product workaround was added for the fixture.

## Result images

`before-outdoor-route.png` and `after-outdoor-route.png` show the actual endpoints along the same mapped park path, source44447973. Start XZ `[-147.516,165.88]`, yaw0.4741258434588974 rad. Identical three seconds of controlled ordinary Player updates reach:

| Comparison | Distance | Endpoint XZ |
| --- | ---: | --- |
| Former outdoor pace3.2 | 9.60 m | [-151.899,157.339] |
| New outdoor pace4.8 | 14.40 m | [-154.090,153.068] |

The before comparison uses the same final scene and changes only `PLAYER.runOutdoor` to the retained3.2 value, then restores it. It is a controlled old-value comparison, not a separate historical scene build. Images were inspected at1280×800, Chromium1248/SwiftShader, June12:00clear/frozen. Native inputs with manually advanced simulation time establish movement behaviour, not wall-clock performance. The low FPS visible in this software-rendered capture is not a hardware result. No physical-phone or performance improvement is claimed.

## Public follow-up

Read-only review of public AGENTS.md, docs/upstream.md and Navigation found this improvement applicable to neutral navigation. Its controller uses BODY.run3.2 with Shift and a separate core/garage classification; it needs an adapted low-priority port after the source commit. Public full-stick sprint differs from the original, so that is not silently imported here. The conductor owns the separate public issue, final main/image publication and changelog numbering.
