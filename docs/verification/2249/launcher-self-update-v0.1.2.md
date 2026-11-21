# Real launcher self-update 0.1.1 → 0.1.2 on the build PC (#2249), 2026-11-21

Conductor session `orkester: solwation-w11-opus-5.5-20261121`. Full output: [selfupdate-log.txt](selfupdate-log.txt).
Same isolation and tooling as the [content upgrade](signed-upgrade-v0.1.1-to-0.1.2.md): test channel only, hidden desktop
([`run-hidden.ps1`](run-hidden.ps1)), counting proxy, every game stopped by PID, everything removed afterwards.

## Release

- Tag `v0.1.2` from `350cb81f` (no code change; the workflow stamps the version from the tag):
  [release.yml run 44884270436](https://github.com/solwation/lunden-3d-apartment/actions/runs/44884270436), build and sign
  succeeded. `Lunden.exe` SHA-256 `23a7813ca185ad612edf3e3f7c88fc307864eb7f1bbaf31d37a2278aa37c229f`, file version 0.1.2.0,
  `Get-AuthenticodeSignature` Valid, Svep Design Center AB, Microsoft RFC 3161 timestamp.
- Prerelease [`v0.1.2`](https://github.com/solwation/lunden-3d-apartment/releases/tag/v0.1.2), **not latest** (`v0.1.1` stays
  latest): the signed launcher, setup copy, `SHA256SUMS`, `launcher-build.json` and a test manifest with `launcher` 0.1.2,
  `app.minLauncher` 0.1.2, app 0.1.2 / content 2. Its content is a cook of `85b80563` at the fixed root, so all 23 files
  reuse `v0.1.1` URLs (`make-manifest.mjs --previous`: 0 uploads).
  [sign-manifest run 44884587149](https://github.com/solwation/lunden-3d-apartment/actions/runs/44884587149);
  `verify-published.mjs` anonymous check: 24 objects, 537,565,490 bytes.
- The launcher reads its own update from the same channel manifest as the content (`releases/latest/download/…` unless
  `--manifest` is given). The test used `--manifest …/releases/download/v0.1.2/lunden-manifest-test.json`, so nothing
  was promoted.

## Results

| Step | Result |
| --- | --- |
| A. Install the signed 0.1.1 setup (test channel); first start from latest | 463,898,610 bytes; game ran; active 0.1.1/1 |
| B. Start with the v0.1.2 manifest while `Lunden.exe` is held open without delete sharing ([`hold-lock.ps1`](hold-lock.ps1)) | `Nytt startprogram krävs: 0.1.2.` → launcher downloaded (73.8 MB through the proxy) and verified → `Swap.exe` could not replace it (`Access to the path is denied.` after its 8 s retry) → installed exe still `e6477a6a…` (0.1.1, Valid) → the old launcher restarted `--offline` and N's game started |
| C. Same start without the lock | exe replaced by `23a7813c…` (0.1.2.0, Valid, Svep Design Center AB); the new launcher restarted with the same arguments, applied app 0.1.2 / content 2 with `Hämtat: 0 byte.`, game started from the new version; previous 0.1.1/1 kept |
| D. Wrong hash: one byte of the active version's installed `NOTICES.txt` changed, `--offline` | `Installerad fil stämmer inte: NOTICES.txt.` → `Startar den föregående fungerande versionen.` → game started from 0.1.1/1; `state.json` active 0.1.1, `rejected` = the damaged version |
| E. `Lunden-Setup-0.1.2-win-x64.exe --uninstall --quiet --channel test` | program, shortcut and HKCU entry removed; throwaway user data deleted |

**Harness finding (not a launcher bug):** the first run of B started no game. `Swap.exe` restarts the old launcher after the
parent has exited. By then `run-hidden.ps1` had returned and closed its hidden desktop, so the restarted process had no
desktop to run on. Starting the same command directly, with the exe still held open, worked. `run-hidden.ps1` now has
`-LingerSec`. With it, B and C behaved as documented. On a normal user desktop this situation cannot arise.

## Still automated-only

- Restore after the swap **succeeded** but the new launcher could not be started (`installed` branch of
  `SelfUpdate.Activate`): fixture tests only.
- Incompatible `contentAbi`, a published manifest with a wrong file hash (download-time rejection) and wrong/unsigned
  executables: fixture tests only. A deliberately broken signed release was not published. The real negatives here are
  the installed-file hash mismatch (D) and the tampered manifest signature (content upgrade run, step 10).
- Rollback after a quick game crash (8 s window): fixture tests only.
- `Swap.exe` stays in `.launcher-update\` after a swap (both failed and successful); it is overwritten by the next update
  and removed by uninstall.
