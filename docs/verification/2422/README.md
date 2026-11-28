# #2422 Linux source checkpoint

This is an open implementation checkpoint, not a distributed game or issue closure.
Linux source `e78af5a8a1af59d30ec85d6b23633eebfed34a45` was reapplied as
`12f5d1963af29c5a4ad331a8b708dddde1b6e63a` on public `8afc03f1`, then
integrated with the verified night-sky correction as `d78eb3abcab4c40e8cc091bfa1ae56c21e8b70b9`.
No private C4/15c prototype ancestry was imported. The24 implementation files
are byte-exact against the tested checkpoint; only development-document context differs.

The source adds a content-only Linux x86_64 Shipping cook, a self-contained Linux
launcher, platform-bound P256 signed manifests, atomic installation and rollback
with persistent saves, ELF validation and rejection of wrong-platform downloads.
Windows trust and the union of Windows/Linux release channels are retained.
Linux launcher self-update currently requires an official manual update.

Existing source-bound results are reused without automatic suite repetition:
launcher58 PASS/6 SKIP (64 total); release protocol33 PASS/1 Windows SKIP.
Subsequent targeted checks overlap those suites and are not added as new totals.
A real self-contained ELF was published locally from the clean e78 source;
a signed Linux manifest passed the real launcher's --dry-run with exit0.
No game payload or engine started in that dry-run. See the exact proof files.

The installed exact Epic5.8.4 has a real Linux Shipping runtime, installed
Game/Shipping receipt and all973 declared receipt paths/globs. RunUAT,
precompiled AutomationTool and bundled .NET10 are present. The native compiler
SDK is absent; whether the content-only route needs it is left to actual UAT
validation, without guessing a blocker or installing unrelated compiler versions.

The first actual --plan on clean d78eb3ab passed the current322-source export
and every zone's import fingerprints, then correctly failed the global sync
builder fingerprint changed by the night-sky work. Nothing bypassed this gate.
Next: one genuine canonical sync using the existing valid imports, then a new
release plan and actual Shipping cook. The sync stamp is written only after all
required real steps succeed. Current247 authored packages were preserved exactly
and remain readonly.

Still untested: actual Shipping cook, ordinary Linux desktop/GPU gameplay and
performance, hosted signed distribution/update/rollback, and current Windows
build. Version0.3.0/content20 in the local trial is provisional test metadata.
Nothing here publishes an official binary release or claims whole-issue acceptance.
This Unreal-only implementation has no public web downstream transfer.
