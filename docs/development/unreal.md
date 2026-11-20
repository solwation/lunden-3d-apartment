# Unreal Engine version (Windows)

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [deployment](deployment.md) (how the web version is published and protected), [verification](verification.md).

The Unreal Engine 5 version of Lunden for Windows (#2242) lives in the **same repository** under `unreal/`,
next to the unchanged web version. Parent plan and order of work: #2242. Project foundation and automation: #2243.
Shared data/export from the web scene: #2245. Packaging and updates: #2248, #2249, #2250.

**Only the original repository.** The public downstream `solwation/kvarteret-lunden` does not receive the Unreal
version, its scripts or this document (no transfer, no downstream issue; #2242).

**Status (2026-11-20):** #2243 phase A (skeleton, version lock, Git LFS rules, Pages protection, scripts) and
phase B are done. On UE 5.8.4 (CL 58902052) with VS 2022 17.14 / MSVC 14.44 / Windows SDK 10.0.22621, the editor
module builds, headless Python and the Automation Test pass, the MCP server answers, and the first `.uasset` is in
Git LFS. Verified results are listed under [Phase B results](#phase-b-results-verified-2026-11-20).

## Module and file map

```text
unreal/Lunden/Lunden.uproject      C++ project "Lunden", EngineAssociation "5.8"; plugins PythonScriptPlugin,
                                   EditorScriptingUtilities, ModelContextProtocol, AllToolsets on; AndroidFileServer
                                   off (Windows only; it otherwise writes a token section into DefaultEngine.ini)
unreal/Lunden/ENGINE_VERSION       exact locked engine version (5.8.4); compared with Engine/Build/Build.version
unreal/Lunden/Config/              DefaultEngine.ini (Lumen/VSM/DX12 SM6, desktop/maximum), DefaultGame.ini
                                   (project id/name, packaging defaults, Asset Manager GameFeatureData rule),
                                   DefaultEditor.ini (Python, no remote exec), DefaultInput.ini (5.8.4 template
                                   defaults written by the editor: Enhanced Input classes, default axes)
unreal/Lunden/Source/              Lunden.Target.cs (game), LundenEditor.Target.cs (editor),
                                   Lunden/Lunden.Build.cs, Lunden.h/.cpp (primary module),
                                   Lunden/Tests/LundenSmokeTest.cpp (Automation Test "Lunden.Smoke.ModuleLoaded")
unreal/Lunden/Content/Lunden/      hand-made content: Materials/, Blueprints/, Maps/, Lighting/ (.gitkeep until real
                                   assets exist); Generated/ is reserved for imports from #2245, never hand-edited;
                                   Fixtures/M_LundenFixture.uasset: empty material (2 KB, LFS) the smoke test loads
unreal/Lunden/.gitignore           Binaries, Intermediate, Saved, DerivedDataCache, .vs, *.sln, packaged builds, .mcp.json
.gitattributes, .lfsconfig         Git LFS rules for unreal/** only; LFS downloads of unreal/** off by default
tools/unreal-engine/common.ps1                    shared functions (engine/VS/SDK discovery, exit codes, logs); dot-sourced
tools/unreal-engine/check-environment.ps1         environment report and check (read-only)
tools/unreal-engine/build-editor.ps1              builds LundenEditor with Build.bat
tools/unreal-engine/run-python.ps1                runs a Python script headless (UnrealEditor-Cmd -run=pythonscript)
tools/unreal-engine/run-tests.ps1                 runs Automation Tests headless and reads the exported report
tools/unreal-engine/release.ps1                     runs a clean Win64 Shipping build, archives it with build-info.json and keeps the log
tools/unreal-engine/python/smoke_create_asset.py  smoke test: scratch material round trip + load the LFS fixture
tools/unreal-engine/mcp-bridge.py                 stdio bridge: Claude Code in WSL -> editor MCP server (curl.exe)
tools/unreal-engine/lunden-unreal.vsconfig        Visual Studio 2022 component list for Unreal C++ development
```

The rendering values in `Config/DefaultEngine.ini` are **assumptions** modelled on what a UE 5.x Blank C++ template
writes (Lumen global illumination and reflections, virtual shadow maps, DX12 with SM6, no static lighting). The
5.8.4 editor and commandlets load them without errors or rewrites (phase B), but their visual effect is
unreviewed. Look/lighting decisions belong to #2246 and packaging settings to #2248.

## Requirements

Engine: **Unreal Engine 5.8.x**, locked to **5.8.4** (latest stable hotfix 2026-10-20; 5.9 is only a preview),
installed with the Epic Games Launcher. A source build of the engine is not needed for a client game (a dedicated
server would need one; not planned).

Toolchain for UE 5.8 on Windows (Epic's
[Visual Studio setup](https://dev.epicgames.com/documentation/unreal-engine/setting-up-visual-studio-development-environment-for-cplusplus-projects-in-unreal-engine)
and [hardware/software specifications](https://dev.epicgames.com/documentation/unreal-engine/hardware-and-software-specifications-for-unreal-engine)):

- Visual Studio 2022 **17.14+** or Visual Studio 2026 (18.x) with the *Game development with C++*,
  *Desktop development with C++* and *.NET desktop development* workloads;
- MSVC v143 **14.38+** (14.50 recommended), Windows SDK **10.0.22621.0+**, .NET Framework 4.6.2 targeting pack;
- UnrealBuildTool runs on the .NET SDK bundled with the engine; a system .NET is not required.

The development PC (i9-10900K, RTX 3080, 32 GB RAM, Windows 11 Pro) is above Epic's recommendation for the editor.

### Install steps (done by the user; the Epic login cannot be automated)

1. **Epic Games Launcher** → sign in → *Unreal Engine* → *Library* → **+** next to *Engine Versions* → choose
   **5.8.x** → install to the default `C:\Program Files\Epic Games\UE_5.8`. In the engine's dropdown, turn off
   automatic updates so a new hotfix does not silently replace the locked version.
2. **Visual Studio 2022 Community** with the project's component list
   [`tools/unreal-engine/lunden-unreal.vsconfig`](../../tools/unreal-engine/lunden-unreal.vsconfig): download the bootstrapper
   https://aka.ms/vs/17/release/vs_community.exe and run, from the repository root on Windows,

   ```text
   vs_community.exe --config tools\unreal-engine\lunden-unreal.vsconfig
   ```

   (or *Visual Studio Installer → More → Import configuration* for an existing install). The file selects the
   CoreEditor, NativeGame (*Game development with C++*), NativeDesktop (*Desktop development with C++*) and
   ManagedDesktop (*.NET desktop development*) workloads, MSVC v143 x64/x86, Windows 11 SDK 22621, the
   .NET Framework 4.6.2 targeting pack, C++ diagnostic tools and `Component.Unreal.Ide` (IDE support for Unreal
   Engine). The separate "Unreal Engine installer" component is not included: the engine comes from the Launcher.
   VS 2026 also satisfies Epic's requirements.
3. Check: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/check-environment.ps1` must end with
   `OK: the Unreal environment matches the project lock.`

`check-environment.ps1` deliberately checks only what a build needs: a VS 2022 17.14+/2026 instance with MSVC 14.38+, a
Windows SDK 10.0.22621.0+ and the .NET Framework 4.6.2 targeting pack. Other components of the `.vsconfig` that are
missing are listed for information; Unreal-specific VS components are never checked.

## Version lock

- `EngineAssociation: "5.8"` in `Lunden.uproject` makes the Launcher/editor pick the installed 5.8 engine.
- `unreal/Lunden/ENGINE_VERSION` holds the exact hotfix (`5.8.4`). `check-environment.ps1` (and every script that runs the
  engine) reads `Engine\Build\Build.version` and fails with exit code 3 on any other version:
  `ERROR: Wrong engine version: found 5.8.3 …, the project is locked to 5.8.4`.
- Upgrading (a new 5.8 hotfix, or 5.9 once it is stable) is a deliberate change in its own issue: update
  `ENGINE_VERSION` (and `EngineAssociation` for a minor version), rebuild, re-run the tests.

## Where the Unreal checkout lives

The global WSL rule is to work in ext4 mirrors, but the Unreal editor, UnrealBuildTool and Visual Studio are
Windows programs: building a project on a `\\wsl.localhost\…` path is slow or fails. **Decision (#2243, can be
overturned in one sentence): Unreal work runs in a dedicated Windows clone,
`C:\Users\Olof\Documents\lunden-unreal-engine`**, made and committed with **Windows Git** (Git LFS 3.8.1). It is a
plain clone of GitHub, **not** the `winc` side of the WSL mirror (`C:\Users\Olof\Documents\lunden-3d-apartment`)
and **not** registered with `wsl-repo-sync`: the mirror must stay clean for the sync (see below), and engine output
(`Binaries/`, `Intermediate/`, `Saved/`, `DerivedDataCache/`) would otherwise sit in the synced tree. One-time setup:

```text
git clone --filter=blob:none https://github.com/solwation/lunden-3d-apartment C:\Users\Olof\Documents\lunden-unreal-engine
cd C:\Users\Olof\Documents\lunden-unreal-engine
git lfs install --local
git config lfs.fetchexclude ""
git lfs pull
```

The scripts refuse to run the engine on a WSL/UNC checkout (exit code 6) and only warn in `check-environment.ps1`.
Renaming or moving the clone invalidates the absolute paths in `unreal/Lunden/Intermediate`; delete `Intermediate/`
and `Binaries/` and run `build-editor.ps1` again.

- WSL Git has **no git-lfs**. A `.uasset` committed from WSL would bypass the LFS filter and land in normal Git
  history. Commit Unreal binaries only with Windows Git (`"/mnt/c/Program Files/Git/cmd/git.exe"` from WSL, or
  Git for Windows directly) until git-lfs is installed in WSL.
- Text files (`.uproject`, `Config/`, `Source/`, `tools/unreal-engine/`, this document) can be edited and committed
  from the ext4 mirror as usual; the LFS rules do not touch them.
- **LFS and the WSL mirror (verified 2026-11-20 with throwaway clones):** WSL Git without git-lfs checks out an LFS
  commit as the 129-byte pointer text and `git status` stays clean (`git hash-object` of the pointer equals the
  committed blob). A WSL push to an `updateInstead` mirror on `/mnt/c` writes the pointer too, and Windows Git in
  that mirror also reports it clean; a Windows Git checkout there keeps the pointer (`.lfsconfig` excludes
  `unreal/**`) and marks the `lockable` file read-only, which a later WSL push still replaces. **The one way to break
  the sync:** real LFS content in the mirror (someone runs `git lfs pull` or clears `lfs.fetchexclude` in
  `C:\Users\Olof\Documents\lunden-3d-apartment`). Both Gits then report the `.uasset` as modified, `updateInstead`
  rejects every push ("Working directory has unstaged changes") and `wsl-repo-sync` stops with a warning. Never
  pull LFS content into the mirror; Unreal work belongs in the dedicated clone.

## Scripts (`tools/unreal-engine/`)

All scripts are PowerShell (Windows PowerShell 5.1 or PowerShell 7), run on Windows and callable from WSL:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/check-environment.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/build-editor.ps1 [-Configuration Development|DebugGame]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/smoke_create_asset.py [args…]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-tests.ps1 [-Filter Lunden.] [-WithRhi]
```

`-ExecutionPolicy Bypass` is needed because Windows 11's default policy blocks unsigned scripts. Every script
takes `-EngineDir <root>` (or the environment variable `LUNDEN_UNREAL_ENGINE_ROOT`); otherwise the engine is found through the
registry (`HKLM\SOFTWARE\EpicGames\Unreal Engine\5.8`), the Launcher's `LauncherInstalled.dat` and finally the
default path. Logs go to `unreal/Lunden/Saved/Logs/<script>-<time>.log` and test reports to
`unreal/Lunden/Saved/Automation/<time>/` (both ignored by Git).

| Script | Runs | Success means |
|---|---|---|
| `check-environment.ps1` | nothing; reports project, engine, VS/MSVC, SDK, .NET | exit 0 and `OK: …` |
| `build-editor.ps1` | `Build.bat LundenEditor Win64 Development -Project=… -WaitMutex` | Build.bat exit 0 |
| `run-python.ps1` | `UnrealEditor-Cmd.exe <uproject> -run=pythonscript -script="<file> <args>" -unattended -nullrhi …` | exit 0 **and** no `LogPython: Error`/traceback in the log |
| `run-tests.ps1` | `UnrealEditor-Cmd.exe <uproject> -ExecCmds="Automation RunTests <filter>; Quit" -TestExit="Automation Test Queue Empty" -ReportExportPath=… -nullrhi` | report `index.json`: ≥ 1 passed, 0 failed |

Exit codes (all scripts): 0 ok, 1 command failed, 2 engine not found, 3 wrong engine version, 4 toolchain
(VS/MSVC/SDK/.NET targeting pack) missing, 5 project files invalid, 6 checkout on a WSL/UNC path.
When the environment is not usable the scripts run **nothing**: they print the problems and the exact command they
would have run.

Verified engine behaviour (5.8.4): `UnrealEditor-Cmd` returns non-zero whenever the log's final *Warning/Error
Summary* contains an error (exit 1, e.g. two Asset Manager errors before the GameFeatureData rule existed), −1 when
a Python script raises or cannot be loaded, and 255 when an Automation Test fails. `run-python.ps1` passes the script
path with forward slashes, because with arguments the commandlet parses `-script` as a command line in which a
backslash is an escape (`\tools` became `<TAB>ools`); paths with spaces are not supported in that form.
`index.json` from the Automation report has the fields `succeeded`, `succeededWithWarnings`, `failed` and `notRun`.
The scripts listed in the table store their logs and reports under `unreal/Lunden/Saved`. The smoke script creates and
removes its own ignored `/Game/Lunden/_Smoke` folder.

For local Shipping archives, see [Build location](#build-location-decision-2244).

## Git LFS (Unreal only)

`.gitattributes` in the repository root puts **only files under `unreal/`** in Git LFS:

- `unreal/**/*.uasset` and `unreal/**/*.umap`: `filter=lfs diff=lfs merge=lfs -text lockable`;
- source art and import files under `unreal/`: `*.fbx *.obj *.glb *.exr *.hdr *.png *.tga *.psd *.tif *.tiff
  *.jpg *.jpeg *.wav *.ogg *.mp3 *.mp4` (LFS, not lockable).

**Never add an LFS rule outside `unreal/`.** GitHub Pages cannot serve LFS files and the Pages checkout does not
fetch them, so an LFS-tracked web file (`models/*.glb`, `music/*`, `textures/*`, `data/*`, `icons/*` …) would be
published as its pointer text ([GitHub: Git LFS and Pages](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)).
Check with `git check-attr -a -- <path>`: web paths must print nothing, `unreal/**/*.uasset` must show `filter: lfs`
and `lockable: set`.

`.lfsconfig` sets `lfs.fetchexclude = unreal/**`, so agent clones, cloud sessions and CI never download Unreal
content. The Unreal checkout opts in locally, once:

```text
git config lfs.fetchexclude ""
git lfs pull
```

**Quota (user decision, non-blocking now; #2242 point 3):** GitHub Free includes 10 GiB LFS storage and 10 GiB
download per month ([billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)). Every saved
version of a binary `.uasset` is stored in full, and every clone that pulls LFS downloads it. Recommendation: start
on Free, report the LFS size in each Unreal delivery (`git lfs ls-files -s`), add large source files (raw EXR,
photos) only when they are actually used, and keep generated imports (#2245) out of Git where possible.

## Web protection

- `.github/workflows/pages.yml` ignores pushes that only change `unreal/**`, `tools/unreal-engine/**` or `shared/schema/**`
  (the JSON schemas planned in #2245, not loaded by the web), in addition to docs/material/cloudflare/`*.md`.
  A web change still deploys as before.
- `tools/stamp.sh` copies an explicit list of web files (unchanged) and, at the end, **fails the build** with
  `::error::` if any published file starts with `version https://git-lfs.github.com/spec/v1` or has the extension
  `.uasset/.umap/.pak/.utoc/.ucas`. A clean build prints `site ok: no Git LFS pointers or Unreal packages in …`.
- Unreal changes need **no** `data/changelog.json` entry: that file is the web version's note on the freezer. The
  Unreal version's change history becomes release notes (#2250).

## Claude Code and MCP

Stable automation does not depend on MCP: headless Python (`run-python.ps1`), commandlets, Automation Tests
(`run-tests.ps1`) and later `RunUAT BuildCookRun` are the primary route. MCP is a complement for interactive work in
an open editor.

- **Plugins in `Lunden.uproject`:** `ModelContextProtocol` (the server, "Unreal MCP", experimental in UE 5.8) and
  `AllToolsets` (mounts the toolset plugins; without it the server exposes no tools). Both exist in 5.8.4 under
  `Engine/Plugins/Experimental/` (verified). Names first came from Epic's
  [setup.md](https://github.com/EpicGames/unreal-engine-skills-for-claude-code-plugin/blob/main/skills/unreal-mcp/references/setup.md).
- **Claude Code plugin** (Epic, MIT): https://github.com/EpicGames/unreal-engine-skills-for-claude-code-plugin.
  Optional: `/plugin install unreal-engine-skills-for-claude-code@claude-plugins-official`. It ships skills
  (`unreal-mcp`, `unreal-skill`, `create-toolset`) and a SessionStart hook that needs `bash`; no MCP server of its
  own. Not installed by #2243.
- **Start the server** per session: editor console `ModelContextProtocol.StartServer [port]` (stop:
  `ModelContextProtocol.StopServer`), or start the editor with `-ModelContextProtocolStartServer`
  (`-ModelContextProtocolPort=N` to change the port). Auto-start is per user only
  (`Saved/Config/WindowsEditor/EditorPerProjectUserSettings.ini`, `[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]`
  `bAutoStartServer=True`) and deliberately not in the shared `DefaultEditor.ini`; commandlets never auto-start it.
- **Verified 2026-11-20:** the editor logs `Created new HttpListener on 127.0.0.1:8000`; the listener binds loopback
  because `[HTTPServer.Listeners] DefaultBindAddress` defaults to `localhost` (leave it unset; `any` would expose it).
  `initialize` → protocol `2025-06-18`; `tools/list` returns the three meta-tools `list_toolsets`, `describe_toolset`
  and `call_tool` (tool search), and `list_toolsets` lists the toolsets (Automation tests, config settings, editor,
  logs, …). The [forum report](https://forums.unrealengine.com/t/5-8-experimental-modelcontextprotocol-mcp-server-instantly-drops-connections/2729488)
  of 5.8 dropping connections did not reproduce over plain HTTP requests.
- **From WSL:** this PC runs WSL2 in **NAT** networking (`wslinfo --networking-mode` = `nat`). A WSL process cannot
  reach Windows loopback (`curl http://127.0.0.1:8000/mcp` → connection refused; the host IP times out because the
  server is not bound there). Mirrored networking or a wider bind would change Windows/WSL settings or expose the
  port, so instead `tools/unreal-engine/mcp-bridge.py` is a stdio MCP server for Claude Code that forwards each
  JSON-RPC message with the Windows `curl.exe` (WSL interop) to `127.0.0.1:8000`; the server stays loopback-only.
  Verified from WSL: `initialize`, `tools/list` and `describe_toolset` through the bridge. Register it **locally**
  (machine config, never committed), from the ext4 checkout:

  ```text
  claude mcp add --scope local unreal-editor -- python3 /mnt/c/Users/Olof/Documents/lunden-unreal-engine/tools/unreal-engine/mcp-bridge.py
  ```

  Claude Code running on Windows can instead connect directly: `claude mcp add --transport http unreal-editor
  http://127.0.0.1:8000/mcp`. Check with `/mcp` and a read-only `list_toolsets`. Limits of the bridge: one request
  at a time, no server-initiated stream. Without a running editor every call returns a clear error.
- **Security boundary:** the server has **no authentication**; any process of the same Windows user (and, through
  the bridge, of the WSL user) can call it. `ProgrammaticToolset.execute_tool_script` runs arbitrary Python in the
  editor. Do not run the MCP server on a shared machine, never expose the port, commit before long MCP sessions and
  review the diff. Stop the server (or the editor) when done.

## Parallel work: levels and Blueprints

Binary Unreal assets cannot be merged. Rules for agents and people working in parallel:

- **One owner per level/zone or Blueprint at a time**, recorded in the issue (#2247 assigns zones). Before editing a
  `.umap`/`.uasset`, lock it: `git lfs lock <path>` (Windows Git); `git lfs locks` lists locks; unlock after the
  push with `git lfs unlock <path>`. With `lockable`, Git LFS checks these files out **read-only** until you hold the
  lock, so an unlocked edit fails early instead of conflicting later.
- **One file per actor (OFPA):** create levels with World Partition (external actors on), so each placed actor is
  its own small `.uasset` under `__ExternalActors__/` and two owners of different actors in one level rarely
  collide. The level file itself still has one owner. (No level exists yet; #2246 creates the first.)
- `Content/Lunden/Generated/` is written only by the #2245 importer; hand edits there are lost on the next import.
- Different tools folders can be worked on in parallel (`tools/unreal-engine/export*`, `tools/unreal-engine/package*`,
  `unreal/Launcher/`; #2242).

## Build location (decision #2244)

**Decision (agent's recommendation, alternative 1; can be overturned in one sentence):** Unreal is built **locally
with scripts on the Windows development PC**; signing and publishing happen later in **GitHub Actions** (#2250).

- Why: GitHub-hosted Windows runners have 14 GB SSD — too little for the engine, project and Derived Data Cache.
  The repository is public, and a self-hosted runner on a public repository can be made to run code from other
  people's pull requests (booster-ai avoids it for the same reason). A cloud GPU VM costs money per hour and is not
  justified now.
- Security boundary: keep all signing keys and Azure credentials off the build PC. The local step produces an unsigned
  archive. A separate handoff to a draft release or artifact and signing/publication belong to #2248/#2250.
- Derived Data Cache: use the local Zen DDC on a fast disk outside the checkout. The default on Windows is
  `%LOCALAPPDATA%\UnrealEngine\Common\Zen\Data`. Set `UE-ZenDataPath` for a different local disk.
  [Epic documents the Zen data location and overrides](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-zen-storage-server-as-cooked-output-store-for-unreal-engine).
- Another Windows PC can take over by following the install steps above, cloning the repository, running
  `git config lfs.fetchexclude ""` + `git lfs pull` and `check-environment.ps1`.

### Building an unsigned archive

Use Windows Git to check out the intended commit with all Unreal LFS objects. Verify
`check-environment.ps1` on that checkout. From Windows PowerShell run

```powershell
.\tools\unreal-engine\release.ps1 -Version 0.1.0 -Content 12 -OutputRoot D:\LundenBuilds
```

`-Version` is the app version and `-Content` is its accompanying content version
(nonnegative integer). The default output root is `%LOCALAPPDATA%\Lunden\Builds`.
The script checks for staged, modified and untracked files before calling
`RunUAT.bat BuildCookRun` for a Win64 Shipping cook, stage, IoStore package and
archive. It checks HEAD and worktree cleanliness again after UAT. Each invocation
creates a separate directory under the output root containing `BuildCookRun.log`,
`stage/` and `archive/Windows/`. UAT can also use the engine's ordinary ignored
intermediate files in the project.

A completed archive contains the Shipping executable and `build-info.json` beside
the packaged `Lunden/` folder. The metadata contains `appVersion`, `contentVersion`,
the full Git `commit`, the actual `engineVersion`, the committed script blob ID
(`releaseScriptBlob`) and completion time in UTC (`builtUtc`). A failed build
can leave files and its log in its own build directory. Hand off only a completed
archive. For #2248, build twice from one commit and compare the resulting program
and container files across the two archives.

Run `tools/unreal-engine/tests/release-test.ps1` with Windows PowerShell for a disposable
Windows Git and simulated UAT check. The real cook, archived layout, container
hash comparison and cross-cook compatibility need the installed 5.8.4 engine
and pilot content (#2243/#2248).

## Phase B results (verified 2026-11-20)

Run in `C:\Users\Olof\Documents\lunden-unreal-engine` (i9-10900K, RTX 3080, 32 GB):

1. `check-environment.ps1` → `OK: the Unreal environment matches the project lock.` (exit 0; engine 5.8.4
   CL 58902052; VS Community 2022 and VS Build Tools 2022 17.14, MSVC 14.44.35207; SDK 10.0.22621 + 10.0.26100).
2. `build-editor.ps1` → `Result: Succeeded` (first build 74 s, 8 actions; UBT picked the Build Tools instance).
   `BuildSettingsVersion.Latest`/`EngineIncludeOrderVersion.Latest` resolve to `Unreal5_8` without UBT asking for a
   pin; they stay `Latest` because the engine lock already fixes the version.
3. `run-python.ps1 tools/unreal-engine/python/smoke_create_asset.py` → `LUNDEN_SMOKE_OK …; loaded fixture
   /Game/Lunden/Fixtures/M_LundenFixture.M_LundenFixture (2067 bytes) (engine 5.8.4-58902052+++UE5+Release-5.8)`,
   `Success - 0 error(s), 0 warning(s)`, exit 0. With the fixture replaced by its pointer text: exit 1 and
   `… is a Git LFS pointer, not the asset. In this checkout run: git config lfs.fetchexclude "" && git lfs pull`.
4. `run-tests.ps1` → `Automation 'Lunden.': passed 1 (with warnings 0), failed 0, not run 0; editor exit code 0`,
   exit 0. A deliberately failing build of the test → `passed 0 …, failed 1 …; editor exit code 255`, exit 1; a
   filter without tests (`-Filter Lunden.NoSuchTest`) → no report, exit 1.
5. MCP: see [Claude Code and MCP](#claude-code-and-mcp).
6. Git LFS: `git lfs ls-files` lists `e89abbc8bc * unreal/Lunden/Content/Lunden/Fixtures/M_LundenFixture.uasset`;
   `git check-attr` shows `filter: lfs`, `diff: lfs`, `merge: lfs`, `text: unset`, `lockable: set`; the committed
   blob is the pointer (`size 2067`). WSL mirror behaviour: see [Where the Unreal checkout lives](#where-the-unreal-checkout-lives).
   Still open at integration: the first push with only `unreal/` changes must produce no Pages run
   (`gh run list --workflow pages.yml`), and `git lfs push` uploads the object (counts towards the LFS quota).

## Windows launcher (#2249)

The .NET 10 console launcher in `unreal/Launcher/` uses the proposed v1 manifest in #2248.
The signature is a sibling `.json.sig` file containing a 64-byte ECDSA P-256 signature
(IEEE P1363, SHA-256) over the exact UTF-8 manifest bytes. The launcher embeds the **public**
SPKI PEM and the expected Authenticode leaf certificate's SHA-256 fingerprint at build time.
The publisher must hash binaries after signing. Each executable and DLL must pass both the
manifest check and Windows Authenticode verification for the configured certificate.

```sh
dotnet test unreal/Launcher.Tests
dotnet publish unreal/Launcher -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:LundenManifestKey=/absolute/path/to/public.pem \
  -p:LundenSignerSha256="$LUNDEN_SIGNER_SHA256" -o /path/to/build-output
```

Set `LUNDEN_SIGNER_SHA256` to the 64 hexadecimal characters in the public certificate fingerprint. A checkout contains no release
key or fingerprint. A build without the public key supports `--help` and declines updates.
On Windows, run `unreal/Launcher.Tests/Test-Authenticode.ps1` with a .NET SDK for the four
native certificate checks. It uses temporary copies of an already signed binary and leaves
the certificate stores untouched.

- Start-menu installation by #2250 places `Lunden.exe` in `%LOCALAPPDATA%\Programs\Lunden\`.
  `--channel test` uses a separate `Lunden-Test` installation and user directory and requests
  `lunden-manifest-test.json`. `--manifest <file-or-url> --dry-run` lists the files and bytes
  the manifest requires. Production URLs use HTTPS. The test channel also accepts loopback HTTP.
- `state.json` identifies a complete app/content pair in `versions/<id>/game/`; unchanged files
  are copied into a new tree. Each version stores its signed manifest beside the game tree.
  Partial downloads in `staging/` resume with HTTP Range. A transient transfer failure gets one
  automatic retry. The active pair changes with one state-file replacement after verification.
  The last successful pair is retained. Older generated versions are pruned on launch while the
  game is stopped. A version containing a project-local `Saved` directory is retained.
- The launcher verifies installed bytes and the cached manifest before offline play. The shipping
  executable starts in its complete package tree with `-UserDir=%LOCALAPPDATA%\Lunden` (or
  `Lunden-Test`). An immediate nonzero exit within eight seconds on the new version triggers
  rollback when a previous installation exists. For troubleshooting, launch
  `Lunden/Binaries/Win64/Lunden-Win64-Shipping.exe` in the active game tree with the same
  `-UserDir` argument. `Lunden.exe --offline` bypasses the network explicitly.
- A minimum launcher upgrade starts a verified copy of the current launcher as a helper. It
  waits for the parent to exit, acquires the installation lock, rechecks the signed replacement
  and swaps it into place. If starting the replacement fails, it restores the previous verified
  executable and starts it offline. The installed channel and manifest override survive restart.

**Verification on 2026-11-20.** The isolated loopback fixture covered changed-file-only updates,
interruption and resumption, incompatible ABI, signature/publisher/hash rejection, interrupted
state writes, early failure and offline rollback with preserved fixture user data. A real CLI
dry run read a locally signed test manifest, listed two files totalling six bytes, wrote no
installation state and rejected an edited manifest. The win-x64 self-contained cross-build produced
a PE32+ console executable. Four native Windows checks passed for correct, wrong-publisher,
unsigned and modified signatures. Application Control blocked execution of the unsigned process
fixture on the Windows host, so the Windows file-lock and full helper/restart tests still need an
approved signed build or CI environment. The release-manifest generator, test-channel publishing,
actual IoStore mounting, UE 5.8 user-data location, quick-crash threshold and real signed
N-to-N+1/offline pilot remain to be verified with #2246, #2248 and #2250.
