# #2231 standalone NES proof

`python3 -m http.server 8456` from the repository root, then open
`http://localhost:8456/tools/retro2231/`. Press Starta; only then are the local
emulator and ROM downloaded. No app imports, production integration, service,
external runtime requests, storage, or audio. This own minimal homebrew is a
technical proof, not an existing third-party retro title.

`make_rom.py` is the complete preferred source for `lightcatch.nes`: explicit
6502 bytes and two original 8×8 sprite patterns; no compiler or SDK. Regenerate
with `python3 tools/retro2231/make_rom.py`. Own code/art/page use `LICENSE` (MIT).
The ROM moves a red sprite with the NES controller; contact with the yellow
sprite increments RAM $02 and moves the target. A/B/Start/Select are mapped but
have no ROM action. It intentionally has no audio and no production leaderboard.

`vendor/jsnes.js` is **unmodified**, unminified jsnes **1.2.1** from the official
npm package `https://registry.npmjs.org/jsnes/-/jsnes-1.2.1.tgz`, SHA512 integrity
`sha512-Gn+lnv5B5c/TVwFSc8vzo7amiSogRyfMI9UL7VjYgKDrlTLf7GKuK2WD+t0gEcLbzh/NfMpkIlopzN/3cq760A==`.
Upstream tag resolves to `9a312c983be1bbb7dea5e6a6e1aafcdb9496e0cb`:
https://github.com/bfirsh/jsnes/tree/9a312c983be1bbb7dea5e6a6e1aafcdb9496e0cb

The copied `vendor/LICENSE.apache-2.0` is its complete **Apache-2.0** license.
The package has no NOTICE file. Its bundle is retained unmodified, including the
optional source-map comment; no source map is needed to run. The full preferred
upstream source is at the pinned tag. No npm install, package lifecycle scripts,
webpack build or app dependency was used. Before execution the unminified UMD
loader, exported NES/frame/controller API and CPU/PPU/mapper boundaries were
inspected; a scan found no external network/eval/Function/DOM/storage APIs.
This limited source review is not a full emulator security audit.

Measured sizes/hashes and package-integrity verification:
`docs/verification/2231/provenance.json`. Browser verification:
`PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/retro2231/browser.cjs http://127.0.0.1:8456 docs/verification/2231`.
Full feasibility/licensing report: `docs/verification/2231/README.md`.

The existing Pages build deliberately excludes all `tools/`; this prototype is
available in a local checkout, not a newly published game route. No publication
policy or build step has been changed.
