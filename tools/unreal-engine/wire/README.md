# Wire fixtures for the players' room (#2292)

`players.json` holds fixed message exchanges for the Worker's `/players` WebSocket (the room in
`cloudflare/players.js`, protocol described at the top of that file and in `cloudflare/README.md`). They describe the
protocol as it is; they add no fields. Two consumers play the same steps:

- **Worker (Node):** `node --test cloudflare/playerswire.test.mjs` runs every scenario against the real Worker and
  `PlayerRoom` with the runtime stand-ins in `cloudflare/devws.mjs`, and checks that the file's limits, close codes and
  coordinate cases still match `cloudflare/players.js`, `src/config.js` and `tools/unreal-engine/coordinates.mjs`. A protocol
  change that breaks a fixture fails here first. `node --test cloudflare/*.test.mjs` includes it.
- **Unreal (#2292, not built yet):** `tools/unreal-engine/tests/test_network.py` is to drive the Windows client's connection
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
