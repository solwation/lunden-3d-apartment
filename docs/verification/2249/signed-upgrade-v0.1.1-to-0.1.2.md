# Real signed upgrade N → N+1 on the build PC (#2249), 2026-11-21

Conductor session `orkester: solwation-w11-opus-5.5-20261121`. Full command output: [upgrade-log.txt](upgrade-log.txt).

## Setup

- **N:** release [`v0.1.1`](https://github.com/solwation/lunden-3d-apartment/releases/tag/v0.1.1) (latest): signed launcher 0.1.1,
  app 0.1.1, content 1 (see [#2248 evidence](../2248/release-v0.1.1.md)).
- **N+1:** prerelease [`app-v0.1.2`](https://github.com/solwation/lunden-3d-apartment/releases/tag/app-v0.1.2), not latest: app 0.1.2,
  content 2, `minLauncher` 0.1.1, generated with `make-manifest.mjs --previous` (v0.1.1's signed manifest) and signed by
  [sign-manifest run 44883462055](https://github.com/solwation/lunden-3d-apartment/actions/runs/44883462055); `verify-published.mjs`
  accepted it anonymously (24 objects, 537,565,490 bytes). The cook is the same commit `85b80563` with
  `-OutputRoot C:\LundenBuilds\release-n1`, so its only changed file is `Lunden-Windows.pak` (different path-hash seed,
  11,226,745 bytes); 22 URLs point back to `v0.1.1`. This is a real byte change, not an edited asset.
- **Isolation:** the signed setup installed the separate **test channel** (`%LOCALAPPDATA%\Programs\Lunden-Test`,
  user data `%LOCALAPPDATA%\Lunden-Test`, HKCU `Uninstall\Lunden-Test`), none of which existed before. No stable
  `Lunden` installation exists on this PC and none was touched. The launcher resolves `LocalApplicationData` through
  Windows, so a different root is not possible without a code change; the channel split is the separation.
- **No visible windows:** every launcher start ran through [`run-hidden.ps1`](run-hidden.ps1), which creates a separate,
  never-switched-to desktop (`CreateDesktop` in `WinSta0`) and starts `cmd.exe` there with `CREATE_NO_WINDOW`; the game
  window inherited that desktop. Each game was stopped by PID after the check.
- **Byte counting and network faults:** `HTTPS_PROXY` pointed the launcher at [`counting-proxy.py`](counting-proxy.py), a
  CONNECT relay in WSL that keeps TLS end to end, logs bytes per tunnel and can throttle; `HTTPS_PROXY=http://127.0.0.1:9`
  simulated an unreachable network.

## Results

| # | Step | Result |
| --- | --- | --- |
| 1 | `Lunden-Setup-0.1.1-win-x64.exe --install --quiet --channel test` | exit 0, no elevation |
| 2 | First start, default `releases/latest` manifest | downloaded 23 files, **463,898,610 bytes** (proxy: 464,562,125 bytes through TLS); game still running after the 8 s check, state `active` 0.1.1/1, not pending |
| 3a | `--offline` | N started from the installed tree |
| 3b | Unreachable network, online start | `Uppdateringen kunde inte genomföras … actively refused`; N started |
| 4 | Update to N+1, proxy at 1 MB/s, launcher killed at 6 s | partial pak 1,202,176 bytes left in `staging`; `state.json` unchanged (active N) |
| 5 | `--offline` after the interruption | N started |
| 6 | Online start with the N+1 manifest | **resumed**: only `Lunden-Windows.pak`, **10,024,569 bytes** (= 11,226,745 − 1,202,176, HTTP Range; proxy 10,055,822 bytes); active 0.1.2/2, previous 0.1.1/1; game ran past the 8 s check |
| 7 | `--offline` | N+1 started |
| 8 | Installed trees N vs N+1 | 23 files each; only `Lunden-Windows.pak` differs (`38cd82d8…` → `cd4b57e1…`) |
| 9 | User data after app+content update | fixture save and the game-written `CrashReportClient.ini` unchanged |
| 10 | Local manifest with one changed byte and the original `.sig` | `Manifestets signatur är ogiltig.`; nothing activated; N+1 started |
| 12 | `--uninstall --quiet --channel test` | program, shortcut and HKCU entry removed; save kept; throwaway user data then deleted |

## Not covered by this run

- A launcher self-update (`minLauncher` above the installed launcher) needs a second signed launcher tag; it was not
  exercised for real. The rollback after a quick crash, wrong hash, wrong/unsigned exe and incompatible `contentAbi`
  remain covered by the launcher's fixture tests, not by this run.
- The settings fixture: a hand-written `GameUserSettings.ini` without the engine's `Version` key was deleted by the game
  itself (reproduced by starting the stock game directly, without the launcher). A real settings file needs a clean game
  exit, which the headless test could not produce.
- The interruption killed the launcher process; a connection dropped by the network mid-transfer was not separately
  simulated (the unreachable-network start in 3b covers the no-network path).
