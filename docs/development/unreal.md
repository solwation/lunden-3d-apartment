# Unreal Engine version (Windows)

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [deployment](deployment.md) (how the web version is published and protected), [verification](verification.md).

The Unreal Engine 5 version of Lunden for Windows (#2242) lives in the **same repository** under `unreal/`,
next to the unchanged web version. Parent plan and order of work: #2242. Project foundation and automation: #2243.
Shared data/export from the web scene: #2245. Packaging and updates: #2248, #2249, #2250.

**Only the original repository.** The public downstream `solwation/kvarteret-lunden` does not receive the Unreal
version, its scripts or this document (no transfer, no downstream issue; #2242).

**Status (2026-11-20):** phase A of #2243 is in place: project skeleton, version lock, Git LFS rules, Pages
protection, PowerShell scripts and this document. Nothing has been built or opened in the engine yet, because
Unreal Engine and Visual Studio were not installed. Phase B (below) needs the engine.

## Module and file map

```text
unreal/Lunden/Lunden.uproject      C++ project "Lunden", EngineAssociation "5.8"; plugins PythonScriptPlugin,
                                   EditorScriptingUtilities, ModelContextProtocol, AllToolsets; target platform Windows
unreal/Lunden/ENGINE_VERSION       exact locked engine version (5.8.4); compared with Engine/Build/Build.version
unreal/Lunden/Config/              DefaultEngine.ini (Lumen/VSM/DX12 SM6, desktop/maximum), DefaultGame.ini
                                   (project id/name, packaging defaults), DefaultEditor.ini (Python, no remote exec)
unreal/Lunden/Source/              Lunden.Target.cs (game), LundenEditor.Target.cs (editor),
                                   Lunden/Lunden.Build.cs, Lunden.h/.cpp (primary module),
                                   Lunden/Tests/LundenSmokeTest.cpp (Automation Test "Lunden.Smoke.ModuleLoaded")
unreal/Lunden/Content/Lunden/      hand-made content: Materials/, Blueprints/, Maps/, Lighting/ (.gitkeep until real
                                   assets exist); Generated/ is reserved for imports from #2245, never hand-edited
unreal/Lunden/.gitignore           Binaries, Intermediate, Saved, DerivedDataCache, .vs, *.sln, packaged builds, .mcp.json
.gitattributes, .lfsconfig         Git LFS rules for unreal/** only; LFS downloads of unreal/** off by default
tools/ue/ue-common.ps1             shared functions (engine/VS/SDK discovery, exit codes, logs); dot-sourced
tools/ue/ue-env.ps1                environment report and check (read-only)
tools/ue/ue-build-editor.ps1       builds LundenEditor with Build.bat
tools/ue/ue-python.ps1             runs a Python script headless (UnrealEditor-Cmd -run=pythonscript)
tools/ue/ue-test.ps1               runs Automation Tests headless and reads the exported report
tools/ue/python/smoke_create_asset.py  phase-B smoke test: create, save, reload, delete a material asset
tools/ue/lunden-unreal.vsconfig    Visual Studio 2022 component list for Unreal C++ development
```

The configuration values in `Config/*.ini` are **assumptions** modelled on what a UE 5.x Blank C++ template writes
(Lumen global illumination and reflections, virtual shadow maps, DX12 with SM6, no static lighting). They were
written without the engine installed; the first editor start in phase B confirms or adjusts them. Look/lighting
decisions belong to #2246 and packaging settings to #2248.

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
   [`tools/ue/lunden-unreal.vsconfig`](../../tools/ue/lunden-unreal.vsconfig): download the bootstrapper
   https://aka.ms/vs/17/release/vs_community.exe and run, from the repository root on Windows,

   ```text
   vs_community.exe --config tools\ue\lunden-unreal.vsconfig
   ```

   (or *Visual Studio Installer → More → Import configuration* for an existing install). The file selects the
   CoreEditor, NativeGame (*Game development with C++*), NativeDesktop (*Desktop development with C++*) and
   ManagedDesktop (*.NET desktop development*) workloads, MSVC v143 x64/x86, Windows 11 SDK 22621, the
   .NET Framework 4.6.2 targeting pack, C++ diagnostic tools and `Component.Unreal.Ide` (IDE support for Unreal
   Engine). The separate "Unreal Engine installer" component is not included: the engine comes from the Launcher.
   VS 2026 also satisfies Epic's requirements.
3. Check: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-env.ps1` must end with
   `OK: the Unreal environment matches the project lock.`

`ue-env.ps1` deliberately checks only what a build needs: a VS 2022 17.14+/2026 instance with MSVC 14.38+, a
Windows SDK 10.0.22621.0+ and the .NET Framework 4.6.2 targeting pack. Other components of the `.vsconfig` that are
missing are listed for information; Unreal-specific VS components are never checked.

## Version lock

- `EngineAssociation: "5.8"` in `Lunden.uproject` makes the Launcher/editor pick the installed 5.8 engine.
- `unreal/Lunden/ENGINE_VERSION` holds the exact hotfix (`5.8.4`). `ue-env.ps1` (and every script that runs the
  engine) reads `Engine\Build\Build.version` and fails with exit code 3 on any other version:
  `ERROR: Wrong engine version: found 5.8.3 …, the project is locked to 5.8.4`.
- Upgrading (a new 5.8 hotfix, or 5.9 once it is stable) is a deliberate change in its own issue: update
  `ENGINE_VERSION` (and `EngineAssociation` for a minor version), rebuild, re-run the tests.

## Where the Unreal checkout lives

The global WSL rule is to work in ext4 mirrors, but the Unreal editor, UnrealBuildTool and Visual Studio are
Windows programs: building a project on a `\\wsl.localhost\…` path is slow or fails. **Decision (#2243, can be
overturned in one sentence): Unreal work runs in a Windows-drive checkout** (today the Windows clone
`C:\Users\Olof\Documents\lunden-3d-apartment`, the `winc` side of the mirror), and is committed with **Windows Git**,
which has Git LFS (3.8.1). The scripts refuse to run the engine on a WSL/UNC checkout (exit code 6) and only warn in
`ue-env.ps1`.

- WSL Git has **no git-lfs**. A `.uasset` committed from WSL would bypass the LFS filter and land in normal Git
  history. Commit Unreal binaries only with Windows Git (`"/mnt/c/Program Files/Git/cmd/git.exe"` from WSL, or
  Git for Windows directly) until git-lfs is installed in WSL.
- Text files (`.uproject`, `Config/`, `Source/`, `tools/ue/`, this document) can be edited and committed from the
  ext4 mirror as usual; the LFS rules do not touch them.
- How the `wsl-repo-sync` mirror (`winc` remote, `updateInstead`) behaves with LFS pointers is verified in phase B
  (#2243 point 5); the ext4 mirror only ever needs the pointers because `.lfsconfig` excludes `unreal/**`.

## Scripts (`tools/ue/`)

All scripts are PowerShell (Windows PowerShell 5.1 or PowerShell 7), run on Windows and callable from WSL:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-env.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-build-editor.ps1 [-Configuration Development|DebugGame]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-python.ps1 tools/ue/python/smoke_create_asset.py [args…]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-test.ps1 [-Filter Lunden.] [-WithRhi]
```

`-ExecutionPolicy Bypass` is needed because Windows 11's default policy blocks unsigned scripts. Every script
takes `-EngineDir <root>` (or the environment variable `LUNDEN_UE_ROOT`); otherwise the engine is found through the
registry (`HKLM\SOFTWARE\EpicGames\Unreal Engine\5.8`), the Launcher's `LauncherInstalled.dat` and finally the
default path. Logs go to `unreal/Lunden/Saved/Logs/<script>-<time>.log` and test reports to
`unreal/Lunden/Saved/Automation/<time>/` (both ignored by Git).

| Script | Runs | Success means |
|---|---|---|
| `ue-env.ps1` | nothing; reports project, engine, VS/MSVC, SDK, .NET | exit 0 and `OK: …` |
| `ue-build-editor.ps1` | `Build.bat LundenEditor Win64 Development -Project=… -WaitMutex` | Build.bat exit 0 |
| `ue-python.ps1` | `UnrealEditor-Cmd.exe <uproject> -run=pythonscript -script="<file> <args>" -unattended -nullrhi …` | exit 0 **and** no `LogPython: Error`/traceback in the log |
| `ue-test.ps1` | `UnrealEditor-Cmd.exe <uproject> -ExecCmds="Automation RunTests <filter>; Quit" -TestExit="Automation Test Queue Empty" -ReportExportPath=… -nullrhi` | report `index.json`: ≥ 1 passed, 0 failed |

Exit codes (all scripts): 0 ok, 1 command failed, 2 engine not found, 3 wrong engine version, 4 toolchain
(VS/MSVC/SDK/.NET targeting pack) missing, 5 project files invalid, 6 checkout on a WSL/UNC path.
When the environment is not usable the scripts run **nothing**: they print the problems and the exact command they
would have run. They never install, delete or change anything outside `unreal/Lunden/Saved` (the smoke script
creates and removes its own `/Game/Lunden/_Smoke` folder, which is also ignored by Git).

Packaging (`ue-package.ps1`/`release.ps1`, `RunUAT.bat BuildCookRun`) is added by #2248 and #2244.

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

- `.github/workflows/pages.yml` ignores pushes that only change `unreal/**`, `tools/ue/**` or `shared/schema/**`
  (the JSON schemas planned in #2245, not loaded by the web), in addition to docs/material/cloudflare/`*.md`.
  A web change still deploys as before.
- `tools/stamp.sh` copies an explicit list of web files (unchanged) and, at the end, **fails the build** with
  `::error::` if any published file starts with `version https://git-lfs.github.com/spec/v1` or has the extension
  `.uasset/.umap/.pak/.utoc/.ucas`. A clean build prints `site ok: no Git LFS pointers or Unreal packages in …`.
- Unreal changes need **no** `data/changelog.json` entry: that file is the web version's note on the freezer. The
  Unreal version's change history becomes release notes (#2250).

## Claude Code and MCP

Stable automation does not depend on MCP: headless Python (`ue-python.ps1`), commandlets, Automation Tests
(`ue-test.ps1`) and later `RunUAT BuildCookRun` are the primary route. MCP is a complement for interactive work in
an open editor.

- **Plugins in `Lunden.uproject`:** `ModelContextProtocol` (the server, experimental in UE 5.8) and `AllToolsets`
  (provides the tools; without it the server exposes none). Both names are taken from Epic's plugin setup guide
  ([setup.md](https://github.com/EpicGames/unreal-engine-skills-for-claude-code-plugin/blob/main/skills/unreal-mcp/references/setup.md),
  plugin v3.1.2) and still have to be confirmed against the installed 5.8.4 engine in phase B; if the editor
  reports one as missing, disable that entry and fall back to headless Python.
- **Claude Code plugin** (Epic, MIT): https://github.com/EpicGames/unreal-engine-skills-for-claude-code-plugin.
  Install on the Unreal PC: `/plugin install unreal-engine-skills-for-claude-code@claude-plugins-official`. It
  ships skills (`unreal-mcp`, `unreal-skill`, `create-toolset`) and a SessionStart hook that needs `bash` (Git Bash
  or WSL); it has no MCP server of its own.
- **Start the server** per session in the editor console: `ModelContextProtocol.StartServer` (default
  `http://127.0.0.1:8000/mcp`). Auto-start is per user only
  (`Saved/Config/WindowsEditor/EditorPerProjectUserSettings.ini`, `[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]`
  `bAutoStartServer=True`); it is deliberately not in the shared `DefaultEditor.ini`. Commandlets start it only with
  `-ModelContextProtocolStartServer`.
- **Connect Claude Code** without committing machine config: `claude mcp add --transport http unreal-mcp http://127.0.0.1:8000/mcp`
  (local scope), or `ModelContextProtocol.GenerateClientConfig ClaudeCode`, which writes `.mcp.json` next to the
  `.uproject` for a Launcher engine (ignored by `unreal/Lunden/.gitignore`; start Claude Code in `unreal/Lunden/`
  to use it). Verify with `/mcp` and a read-only call such as `list_toolsets`.
- **Security boundary:** the server binds localhost **without authentication**; any process of the same user can
  connect. `ProgrammaticToolset.execute_tool_script` runs arbitrary Python in the editor. Do not run the editor's
  MCP server on a shared machine, never expose the port, commit before long MCP sessions and review the diff.
- **Known issue:** forum reports of the 5.8 server dropping connections
  ([thread](https://forums.unrealengine.com/t/5-8-experimental-modelcontextprotocol-mcp-server-instantly-drops-connections/2729488)).
  If MCP does not work, document it in the issue and use headless Python; #2243 accepts either outcome.

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
- Different tools folders can be worked on in parallel (`tools/ue/export*`, `tools/ue/package*`,
  `unreal/Launcher/`; #2242).

## Build location (decision #2244)

**Decision (agent's recommendation, alternative 1; can be overturned in one sentence):** Unreal is built **locally
with scripts on the Windows development PC**; signing and publishing happen later in **GitHub Actions** (#2250).

- Why: GitHub-hosted Windows runners have 14 GB SSD — too little for the engine, project and Derived Data Cache.
  The repository is public, and a self-hosted runner on a public repository can be made to run code from other
  people's pull requests (booster-ai avoids it for the same reason). A cloud GPU VM costs money per hour and is not
  justified now.
- Security boundary: the build PC holds no signing keys or Azure secrets, only a `gh` login. The planned
  `tools/ue/release.ps1` (#2244/#2248) builds from a clean work tree at an exact commit, writes `build-info.json`
  (commit, engine version, time), and uploads **unsigned** files to a draft release/artifact; the Actions workflow
  signs and publishes them.
- Derived Data Cache: local, on a fast disk outside the repository (path documented when `release.ps1` lands); no
  shared DDC is needed for a single builder.
- Another Windows PC can take over by following the install steps above, cloning the repository, running
  `git config lfs.fetchexclude ""` + `git lfs pull` and `ue-env.ps1`.

## Phase B (needs the engine)

1. `ue-env.ps1` → OK on the Windows checkout (engine 5.8.4, VS, SDK, targeting pack).
2. `git config lfs.fetchexclude ""` in that checkout; open `Lunden.uproject` once (accept module build), confirm the
   ModelContextProtocol/AllToolsets plugin names and let the editor add missing template config keys; commit
   reviewed config changes.
3. `ue-build-editor.ps1` builds the C++ module; pin `BuildSettingsVersion`/`EngineIncludeOrderVersion` if UBT asks.
4. `ue-python.ps1 tools/ue/python/smoke_create_asset.py` exits 0 and logs `LUNDEN_SMOKE_OK`; confirm whether the
   pythonscript commandlet itself returns non-zero on a Python exception (the script checks the log either way).
5. `ue-test.ps1` runs `Lunden.Smoke.ModuleLoaded` and reports 1 passed, 0 failed (confirm the `index.json` field
   names).
6. MCP: `ModelContextProtocol.StartServer`, `claude mcp add …`, `list_toolsets` — or document why not.
7. First real `.uasset` commit with Windows Git: `git lfs ls-files` shows it, `git check-attr` matrix, a push with
   only `unreal/` changes produces no Pages run (`gh run list --workflow pages.yml`); check the `winc` mirror sync.
