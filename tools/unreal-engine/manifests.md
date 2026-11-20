# Build an update manifest

Run `make-manifest.mjs` on Windows with Node 22 or later. It needs the completed
`archive/Windows` from `release.ps1`, the protected signing job's extracted
`signed-launcher` artifact, its approved signing tag and source commit, the
expected leaf certificate SHA-256, and the public P-256 key embedded in that
launcher. Obtain the trust values from the approved release configuration.
The output directory must be new and outside both inputs.

```powershell
node tools/unreal-engine/make-manifest.mjs `
  --archive D:\build\archive\Windows --archive-commit $archiveCommit `
  --signed-launcher D:\build\signed-launcher --launcher-tag v0.2.1 --launcher-commit $launcherCommit `
  --launcher-release-tag v0.2.1 --public-key D:\build\manifest-public.pem --signer-sha256 $approvedLeaf `
  --tag app-v0.4.0 --app-version 0.4.0 --min-launcher 0.2.1 --content-version 12 `
  --channel test --published 2026-11-20T22:00:00Z --out D:\build\draft-12
```

The versions and instant above are examples. The archive's `build-info.json` must
match the app/content versions, expected archive commit and reviewed stock engine.
The signing tag `vM.m.p` must match the protected artifact's `launcher-build.json`.
`--launcher-release-tag` names the immutable public release that will contain
`Lunden.exe`. An app distribution may use `vM.m.p` or `app-vM.m.p`. The values
may identify different releases. The tool verifies both identical binaries against
`SHA256SUMS`, the protected source commit and public trust fingerprints, and
uses Windows to validate the embedded, timestamped signature against the expected
leaf. It streams the archived game files and requires all 14 reviewed UE 5.8.4
vendor images at their exact paths and hashes.

The output is `lunden-manifest-test.json` for test or `lunden-manifest.json` for
stable, plus `upload-plan.json`. Each `uploads` entry maps one archive-relative
`source` to its release `asset`, size and SHA-256. Publish those bytes under the
exact asset name on `plan.tag`. The `mappings` list includes every installed path
and its URL. Identical bytes share one asset. The separate launcher entry maps
`Lunden.exe` from the protected artifact to its specified distribution URL.
Verify packages and the proposed signed manifest before promoting a release.
This generator only writes the local draft and plan.

For a content-only release, pass `--tag content-13 --content-version 13` and
`--previous D:\build\old\lunden-manifest-test.json` with all other required
inputs for the new cook. The old manifest must have a sibling `.json.sig`
containing its raw 64-byte P-256 signature, in the same channel with an earlier
publication instant. A matching size and full SHA-256 can reuse an older
versioned GitHub release asset, including when the installation path changes.
Preserve referenced releases and assets.

The compatibility ID hashes the sorted program paths, sizes and final file
hashes, global containers and base IoStore files. In an unchunked cook the whole
`Lunden-Windows` base is bound. In a chunked cook, chunk zero's loose-file
`.pak` accompanies the changed content. In the real two-zone B→C test its only
changed entry was `Lunden/AssetRegistry.bin`. The release applies chunk zero and
the affected zone together. A changed global, base IoStore or program rejects
a content-only release and requires a new app distribution. The current cook
supports either `Lunden-Windows` or `pakchunkN-Windows` groups and their
`_sN.ucas` partitions. UAT staging lists and the build completion record stay
with the producer. Runtime notices are included. GitHub assets must be
smaller than 2 GiB each and fit the release's 1000-asset limit.
