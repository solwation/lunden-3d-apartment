# Build an update manifest

Run `make-manifest.mjs` on Windows with Node 22 or later. It needs the completed
`archive/Windows` from `release.ps1`, the protected signing job's extracted
`signed-launcher` artifact, its approved signing tag and source commit, and the
public P-256 key embedded in that launcher. The publisher identity comes from
`unreal/Launcher/publisher-identity.json` in this checkout (#2277); it must equal
the identity recorded in the artifact's `launcher-build.json`.
The output directory must be new and outside both inputs.

```powershell
node tools/unreal-engine/make-manifest.mjs `
  --archive D:\build\archive\Windows --archive-commit $archiveCommit `
  --signed-launcher D:\build\signed-launcher --launcher-tag v0.2.1 --launcher-commit $launcherCommit `
  --launcher-release-tag v0.2.1 --public-key D:\build\manifest-public.pem `
  --tag app-v0.4.0 --app-version 0.4.0 --min-launcher 0.2.1 --content-version 12 `
  --channel test --published 2026-11-20T22:00:00Z --out D:\build\draft-12
```

The versions and instant above are examples. The archive's `build-info.json` must
match the app/content versions, expected archive commit and reviewed stock engine.
The signing tag `vM.m.p` must match the protected artifact's `launcher-build.json`.
`--launcher-release-tag` names the immutable public release that will contain
`Lunden.exe`. An app distribution may use `vM.m.p` or `app-vM.m.p`. The values
may identify different releases. The tool verifies both identical binaries against
`SHA256SUMS`, the protected source commit, publisher identity and manifest key,
and uses Windows (`get-signer-identity.ps1`) to validate the embedded, timestamped
signature against the publisher identity: CN, O, root certificate SHA-256 and
certificate-profile identity usage. Artifact Signing replaces its leaf every 72 hours, so
no leaf is pinned; the observed leaf must only equal the one the record names.
It streams the archived game files and requires all 14 reviewed UE 5.8.4 vendor images at their exact paths and hashes.

The output is `lunden-manifest-test.json` for test or `lunden-manifest.json` for
stable, plus `upload-plan.json`. Each `uploads` entry maps one archive-relative
`source` to its release `asset`, size and SHA-256. Publish those bytes under the
exact asset name on `plan.tag`. The `mappings` list includes every installed path
and its URL. Identical bytes share one asset. The separate launcher entry maps
`Lunden.exe` from the protected artifact to its specified distribution URL.
Verify packages and the proposed signed manifest before promoting a release.
This generator only writes the local draft and plan.

## Sign the manifest

The generator does not sign. Upload the generated manifest to its draft or published
non-latest release. Then dispatch `.github/workflows/sign-manifest.yml` from a
`vMAJOR.MINOR.PATCH` tag, because the `signing` environment only deploys `v*` tags:

```sh
gh workflow run sign-manifest.yml --ref v0.2.1 -f tag=app-v0.4.0 -f asset=lunden-manifest-test.json
```

Its protected job runs `sign-manifest.mjs` with the `LUNDEN_MANIFEST_PRIVATE_KEY` secret.
It uploads the sibling `.json.sig` (64-byte P1363 ECDSA P-256 over the exact manifest
bytes) only after the release verifier accepts it. The workflow never moves latest.
For a local test with a throwaway key, pass the key through stdin:

```sh
LUNDEN_MANIFEST_PUBLIC_KEY="$(cat test-public.pem)" node tools/unreal-engine/sign-manifest.mjs sign \
  --channel test --manifest lunden-manifest-test.json --private-key-stdin < throwaway-private.pem
```

Key custody, creation (`create-manifest-key.sh`) and rotation: see
[Sign a release manifest in Actions](../../docs/development/unreal.md#sign-a-release-manifest-in-actions).

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

## Linux x86_64 (#2422)

`make-linux-manifest.mjs` adapts a completed `release-linux.py` archive and
`publish-linux-launcher.py` output to the same v1 P-256 protocol. It does not run
Unreal, sign, upload or promote. Use actual clean commit IDs and the public key
that was embedded in the launcher:

```sh
node tools/unreal-engine/make-linux-manifest.mjs \
  --archive /mnt/d/LundenBuilds/linux-0.3.0/archive/Linux \
  --archive-commit "$archiveCommit" \
  --launcher-dir /mnt/d/LundenBuilds/launcher-linux-0.3.0 \
  --launcher-commit "$launcherCommit" --launcher-version 0.3.0 \
  --public-key /secure/public/manifest-public.pem \
  --app-version 0.3.0 --content-version 20 --min-launcher 0.3.0 \
  --tag app-v0.3.0 --channel test --published 2026-11-28T12:00:00Z \
  --out /mnt/d/LundenBuilds/linux-draft-20
```

Examples do not reserve versions or announce a release. The new output contains
`lunden-manifest-linux-x64-test.json` and `upload-plan.json`. The launcher mapping
uses local `Lunden` as source and the immutable URL's `Lunden-linux-x64` as asset
name. All archive blob mappings remain content addressed. `--previous FILE` is
accepted only with its verified `.sig`, matching Linux platform/channel and the
existing ABI/content-only rules. The scanner rejects symlinks, Windows PE/files,
foreign ELF architectures, missing/incomplete Linux IoStore containers and files
at least 2 GiB. It does not treat a fixture ELF header as proof that a game runs.

Linux manifests include signed `platform: "linux-x64"` and `executable: true` on
ELF files. Explicit Linux platform is mandatory; old omitted-platform v1 manifests
remain Windows-only. No Linux file uses `authenticode`. The same protected signing
workflow accepts the two Linux manifest asset names and passes the expected
platform through verification. For a **local throwaway-key test only**:

```sh
LUNDEN_MANIFEST_PUBLIC_KEY="$(cat test-public.pem)" \
  node tools/unreal-engine/sign-manifest.mjs sign --platform linux-x64 \
  --channel test --manifest lunden-manifest-linux-x64-test.json \
  --private-key-stdin < throwaway-private.pem
node tools/unreal-engine/verify-published.mjs --platform linux-x64 --channel test \
  --manifest lunden-manifest-linux-x64-test.json \
  --signature lunden-manifest-linux-x64-test.json.sig --public-key test-public.pem
```

The last command actually downloads and hashes manifest payloads; invoke it only
once the draft references the intended uploaded bytes. Private release keys still
belong exclusively in the existing protected signing environment. Never copy one
to the Linux builder or put it on the command line. Release promotion checks both
Windows and Linux pairs whenever either the candidate or current latest contains
them. No workflow is automatically dispatched by these changes.
