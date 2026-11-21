# Wire fixtures for the players' room (#2292)

`players.json` holds fixed message exchanges for the Worker's `/players` WebSocket (the room in
`cloudflare/players.js`, protocol described at the top of that file and in `cloudflare/README.md`). They describe the
protocol as it is; they add no fields. Two consumers play the same steps:

- **Worker (Node):** `node --test cloudflare/playerswire.test.mjs` runs every scenario against the real Worker and
  `PlayerRoom` with the runtime stand-ins in `cloudflare/devws.mjs`, and checks that the file's limits, close codes and
  coordinate cases still match `cloudflare/players.js`, `src/config.js` and `tools/unreal-engine/coordinates.mjs`. A protocol
  change that breaks a fixture fails here first. `node --test cloudflare/*.test.mjs` includes it.
- **Unreal acceptance (#2292):** `tools/unreal-engine/tests/test_network.py` is to drive the Windows client's connection
  through the same steps against a local Worker (`node cloudflare/dev.mjs <port>`, `LUNDEN_AWAY_MS` for a short away time),
  and to use the coordinate cases for its conversion. Read the file; do not copy the values into the test.

## Format

- `endpoint`, `heartbeat`, `limits`, `closeCodes`: the room's contract (`PLAYERS`, `CLOSE`, `AWAY.ms`, `COMBAT.lives`; the
  web client's 5 Hz and 10 s heartbeat from `GHOSTS` for reference).
- `coordinates`: web ↔ Unreal axes and units, and `cases` (web `p`/`r`/`look` with the expected Unreal feet in cm, yaw,
  pitch and relative head yaw in degrees), computed with `coordinates.mjs`. The test checks both directions.
- `scenarios[].steps`, in order:
  - `connect` `{client, name?, token?, origin?, status?}`: open `/players?n=<name>&a=<token>`. No `origin` = no Origin header,
    as a native client sends; `status` (default 101) is the expected HTTP answer. The id from the welcome becomes `$<client>`.
  - `send` `{client, json | text | texts}`: one message (`json` is sent as `JSON.stringify(json)`, `text` byte for byte) or
    several in a burst (`texts`; a string is sent as is, an object as JSON).
  - `close` `{client, code, reason?}`: the client closes (1000 a plain leave, 4100 away).
  - `advance` `{ms}`: the room's clock moves on (Node fakes `Date.now`); a live run waits at least that long.
  - `setBill` `{req, msg}`: Node-only set-up of the month's counter (the scenario carries `nodeOnly`).
  - `expect` `{client, messages?, closed?, sameId?, newId?}`: what the client received since its previous `expect`, counting
    only `relevantTypes` (`w`, `j`, `s`, `x`) and the heartbeat reply `q`; the welcome also carries the room's other
    features, which a player client ignores. `messages` must match in order: `s`, `j`, `x` exactly (key order does not
    matter), the welcome only on the keys listed. `$A` stands for client A's id. `closed` is the close code the client got
    (`null` = still open). `sameId`/`newId` compare the client's id with another client's.
- `note` fields are explanations only.

## What is covered

Welcome with the peer id and the others' rows, join `j`, state `s` (rounding to 0.01, cleaned name, optional look and pose
fields `look`, `c`, `pose`, `h`, `jp`, `dn`, `av`, `ax`, junk and invalid values dropped, no echo), leave `x`, the heartbeat
`p` → `q`, the Origin rule (a native client sends none), the rate limit (`perSecond` per second, `strikes` → 4008), the size
limit (`maxBytes` passes, one more → 1009), idle close (4000; a heartbeat counts), away (`?a=` token + close 4100: `aw: 1`,
back within `awayMs` with the same id, expiry `x` with `aw: 1`, another name, no token) and the monthly cap (4001).
Chat, doors, hits and life belong to #2293; the full room (4029) and the admin brake (4003) stay in
`cloudflare/players.test.mjs`.

The size limit is 512 characters (`PLAYERS.maxBytes`, #1648; it was 256), the rate limit 6 messages a second.


## Launcher bridge

The launcher's WebSocket uses the same room as the web client. The signed Epic 5.8.4 stock Shipping receipt lacks
`HttpBlueprint`. Its editor DLL and precompiled object exist in the installation. The signed Shipping executable
does contain the reflected `ImportTableFromCSVString`, `ExportTableToCSVFile`, `ImportTableFromCSVFile` and
`GetTableEntrySourceString` functions from `KismetStringTableLibrary`. These stock nodes can exchange data
with the launcher under the game's user directory without adding a plugin or relinking the game.

The launcher passes a fresh per-process directory in `-LundenPlayersBridge=`. Percent, space, comma and
closing parenthesis in that argument are escaped as `%25`, `%20`, `%2C` and `%29` for Unreal's argument parser.
Offline launches omit the argument. An online launch joins only after the first valid game packet. The
launcher deletes its transient files on exit. The UTC month of a room cap is saved across launches.

Both directions use Unreal string tables with an entry named `Packet`. The return table also carries `Events`. The optional editor-only `DevNotes` column
and Unicode BOM are accepted. Unreal escapes its string-table cells before CSV quoting. Inside a packet,
the name field escapes percent, backslash, apostrophe and double quote as `%25`, `%5C`, `%27` and `%22`;
decode percent last. Personal save ids do not go to the room.

| File | Value of the Packet entry |
| --- | --- |
| `game-1.csv`, `game-2.csv`, … | Eleven LF-separated fields in order: version `1`, chosen display name, appearance code, foot X/Y/Z (cm), body yaw and camera pitch (degrees), crouch (`0/1`), pose (`0/1/2`), relative head yaw (degrees). A single `away` closes the socket with 4100. |
| `peers.csv` | Header `1<TAB>selfId`. Each subsequent LF-separated row contains id, name, appearance, foot X/Y/Z, yaw, pitch, crouch, away, pose and relative head yaw, separated by tabs. Empty fields are significant. A complete snapshot replaces the previous roster. |

The return table's `Events` entry carries the latest 64 presence messages as LF-separated rows:
sequence, type (`w/j/s/x`), peer id and compact JSON separated by tabs. Only presence fields are projected.
The initial roster is in `Packet`. A welcome starts a fresh event history. A subscriber receives each new
sequence once while connected, and the complete roster also recovers state after a pause.

The game creates a new numbered file on each write. The launcher consumes them in numeric order and deletes each processed file. This avoids competing with the game for an exclusive Windows handle. The game writes at most five updates a second while playing. A three-second break in writes handles a
suspended game. After two minutes without meaningful motion the socket goes away, as in `ghosts.js`.
Moving more than two centimetres or turning more than 0.03 radians wakes it. A changed state is sent at
most once per 210 ms and at most 256 UTF-8 bytes, with one settling resend and then ten-second heartbeats.

Run `dotnet test unreal/Launcher.Tests/Lunden.Launcher.Tests.csproj` to check the shared coordinate fixtures,
exchange movement with the real local Worker and check reconnect, traffic and monthly caps. For the additional
Chromium desktop and touch-phone peers, install the project's Three.js version and Playwright, then run
`LUNDEN_TEST_BROWSER_PEERS=1 tools/browsertest.sh dotnet test unreal/Launcher.Tests/Lunden.Launcher.Tests.csproj --filter FullyQualifiedName~LauncherAndWebPeer`.
This uses the real browser avatar code and exercises the launcher with synthetic game-side packets. Actual
headless PIE and packaged-game movement remain separate acceptance checks.


For the three-client Windows acceptance run, build the network Blueprints and the player in an isolated
Windows checkout, reserve the shared editor slot and set `LUNDEN_TEST_UE_EDITOR` to the installed
`UnrealEditor-Cmd.exe` before running the same filtered .NET test with Playwright and Three.js available.
The harness stages the automation script, starts a headless null-RHI editor with a temporary user directory
and the local bridge, then checks both browsers and the interpolated actors actually present in PIE.
