# First published release v0.1.1: cook, manifest, signing, anonymous download, promotion (#2248), 2026-11-21

Conductor session `orkester: solwation-w11-opus-5.5-20261121`; user approval for releases on #2250 (2026-11-21).

## Cooks

Windows worktree `C:\Users\Olof\Documents\lunden-ue-wt\opus-release` at tag `v0.1.1` (`85b80563`), UE 5.8.4,
`release.ps1 -Version 0.1.1 -Content 1 -OutputRoot C:\LundenBuilds\release` twice (exit 0, about 40 s and 55 s).
Keep `C:\LundenBuilds\release` as the output root for later releases so the chunk-0 pak keeps its seed.

- [`v0.1.1-cooks.json`](v0.1.1-cooks.json): `compare-cooks.mjs` reports all 5 containers identical
  (`Lunden-Windows.pak` `38cd82d8…7b6c`, 11,226,745 bytes). Over all 26 archived files only `build-info.json` and UAT's two
  `Manifest_*UFSFiles_Win64.txt` differ, which the generator ignores. Two earlier cooks of `2dcabb34` gave the same result.

## Same commit, same manifest

`make-manifest.mjs` on each archive with the same inputs (`--tag v0.1.1 --launcher-tag v0.1.1 --launcher-release-tag v0.1.1
--app-version 0.1.1 --min-launcher 0.1.1 --content-version 1 --channel test --published 2026-11-21T08:00:00Z`, signed artifact of
run 44882237973, repository public key SHA-256 `e1af2471…0289`): both `lunden-manifest-test.json` files are byte-identical
(SHA-256 `a10ada408eae77422547c9660d8418e26de640faf6740627aa925258c11c9907`, 9,684 bytes), and so are both `upload-plan.json`
(`bc310a58…f060`). The criterion holds without excluding anything but the chosen `published` instant.
Saved: [manifest](v0.1.1-lunden-manifest-test.json), [upload plan](v0.1.1-upload-plan.json) (23 unique content assets plus `Lunden.exe`).

## Publication

1. Draft release `v0.1.1` created with `gh release create --draft --verify-tag`; 28 assets uploaded under their planned names
   (23 `sha256-*.blob`, `Lunden.exe`, `Lunden-Setup-0.1.1-win-x64.exe`, `SHA256SUMS`, `launcher-build.json`,
   `lunden-manifest-test.json`; 583 MB, 38 s).
2. [Sign an Unreal release manifest, run 44882918661](https://github.com/solwation/lunden-3d-apartment/actions/runs/44882918661),
   dispatched from `--ref v0.1.1` with `tag=v0.1.1 asset=lunden-manifest-test.json`: preflight and sign succeeded; log
   `Signed lunden-manifest-test.json (test, sha256 a10ada40…9907) -> lunden-manifest-test.json.sig`.
3. Release published with `--draft=false --latest=false`. Because it is the repository's only release, GitHub already
   reported it as latest before promotion.
4. Local anonymous check from WSL (`curl` of the published manifest and `.sig`; the manifest equals the local one byte for byte):
   `node tools/unreal-engine/verify-published.mjs --channel test …` → `Verified 24 unique objects, 537565490 bytes (test).` (exit 0, 41 s).
5. [Verify and promote a published Unreal release, run 44883091315](https://github.com/solwation/lunden-3d-apartment/actions/runs/44883091315)
   from `main` with `tag=v0.1.1`: verify (`Verified v0.1.1 (test): 24 objects, 537565490 bytes.`) and promote succeeded.
6. `gh release view` and the latest download redirect:

```text
latest=v0.1.1 draft=false pre=false published=2026-11-21T08:02:45Z assets=29 url=https://github.com/solwation/lunden-3d-apartment/releases/tag/v0.1.1
location: https://github.com/solwation/lunden-3d-apartment/releases/download/v0.1.1/lunden-manifest-test.json
```

`git ls-files` lists no `.pak`, `.ucas`, `.utoc` or `.exe`. The release workflows run only on `v*` tags or by dispatch;
no Pages deployment was triggered by the tags.
