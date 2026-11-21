<#
.SYNOPSIS
  Lunden (#2305): bring the local Unreal import up to the web export of this checkout, headless (no window).
.DESCRIPTION
  1. Export: keeps unreal/Lunden/Import/ when tools/unreal-engine/check-export.mjs says it is current for this checkout.
     Otherwise it takes, in order: -ExportFrom <folder>; the "Unreal export" workflow's artifact for this source hash
     (unreal-export-<hash>, needs an authenticated gh); a local export (needs Playwright in node_modules). Every export
     is checked with check-export.mjs before it replaces unreal/Lunden/Import/.
  2. import_world.py: unchanged zones are skipped by their import stamps; only changed zones are imported again.
  3. The derived levels, each skipping itself when its inputs are unchanged: build_l1007.py, build_exterior.py,
     build_site.py, build_lighting.py, build_vegetation.py, build_interaction.py.
  4. compose_world.py --check (the world map L_Lunden must match world-levels.json and START; it is never saved here).
  5. Quick tests: import_world.py --check (stamps, content fingerprints, ids, collision, fixture positions).
  6. Writes unreal/Lunden/Content/Lunden/Generated/sync-stamp.json and runs the release gate (check-import.mjs).
  Every Unreal step runs through run-python.ps1 (UnrealEditor-Cmd -unattended -nullrhi -nosplash). Any failure stops
  with exit 1 and names the step; the log of each step is under unreal/Lunden/Saved/Logs.
  A builder that writes a versioned asset (for example BP_LundenSky when the lamps changed) leaves the Git worktree
  changed: commit it with its LFS lock before a release; release.ps1 refuses a dirty worktree.
.PARAMETER ExportFrom
  A folder holding an export (an unzipped workflow artifact, or tools/unreal-engine/export-world.mjs --out from WSL).
.PARAMETER ImportOnly
  Steps 1, 2 and 5 only. The sync stamp is marked partial, so release.ps1 still refuses until a full run.
.PARAMETER Zones
  Import only these zones (comma separated); implies -ImportOnly.
.PARAMETER Repo
  GitHub repository of the export workflow (default solwation/lunden-3d-apartment).
.PARAMETER DryRun
  Print what would run; no export, no Unreal.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\unreal-engine\sync-import.ps1
#>
[CmdletBinding()]
param(
    [string]$ExportFrom,
    [switch]$ImportOnly,
    [string]$Zones,
    [string]$Repo = 'solwation/lunden-3d-apartment',
    [switch]$DryRun,
    [string]$EngineDir
)
. (Join-Path $PSScriptRoot 'common.ps1')

$project = Get-LundenProject
$root = $project.RepoRoot
$tools = Join-Path $root 'tools\unreal-engine'
$importDir = Join-Path $project.Dir 'Import'
$ps = (Get-Process -Id $PID).Path
if ($Zones) { $ImportOnly = $true }
$steps = New-Object Collections.Generic.List[string]

function Fail([string]$step, [string]$message) {
    Write-Host "SYNC-IMPORT FAILED in step '$step': $message" -ForegroundColor Red
    exit $UnrealExit.Failed
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'prerequisites' 'Node.js is not on PATH (https://nodejs.org); the export checks need it.' }

function Invoke-Node([string[]]$NodeArgs) {
    # Windows PowerShell 5.1 turns redirected native stderr into error records: capture both, decide on the exit code.
    $old = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $out = & $node.Source @NodeArgs 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
    [pscustomobject]@{ Code = $code; Out = @($out) }
}

function Test-Export([string]$dir) {
    $r = Invoke-Node @((Join-Path $tools 'check-export.mjs'), '--dir', $dir)
    $r.Out | ForEach-Object { Write-Host "  $_" }
    $r.Code
}

function Install-Export([string]$from) {
    # replace the export files only (the folder may hold nothing else that matters; it is Git-ignored)
    if (-not (Test-Path -LiteralPath $importDir)) { New-Item -ItemType Directory -Path $importDir | Out-Null }
    Get-ChildItem -LiteralPath $importDir -File | Where-Object { $_.Name -match '\.glb$|^measurements\.json$|^export-manifest\.json$' } | Remove-Item -Force
    Get-ChildItem -LiteralPath $from -File | Where-Object { $_.Name -match '\.glb$|^measurements\.json$|^export-manifest\.json$' } |
        Copy-Item -Destination $importDir
    if ((Test-Export $importDir) -ne 0) { Fail 'export' "the export copied from $from does not check out in $importDir" }
}

function Get-ArtifactExport {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) { return $null }
    $key = Invoke-Node @((Join-Path $tools 'export-ci.mjs'), 'key')
    if ($key.Code -ne 0) { Fail 'export' "export-ci.mjs key failed: $($key.Out -join ' ')" }
    $name = ($key.Out[-1] | ConvertFrom-Json).artifact
    $old = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $run = & $gh.Source api "repos/$Repo/actions/artifacts?name=$name&per_page=20" --jq '[.artifacts[] | select(.expired | not)][0].workflow_run.id // empty' 2>$null
        if (-not $run) { Write-Host "  no workflow artifact $name (yet): the export workflow has not run for these sources"; return $null }
        $tmp = Join-Path ([IO.Path]::GetTempPath()) ("lunden-export-" + [guid]::NewGuid().ToString('N'))
        Write-Host "  downloading artifact $name of run $run"
        & $gh.Source run download $run --repo $Repo --name $name --dir $tmp 2>&1 | ForEach-Object { Write-Host "  $_" }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
    if ($code -ne 0) { Write-Host "  artifact download failed (gh exit $code)"; return $null }
    $tmp
}

function Invoke-LocalExport {
    $probe = Invoke-Node @('-e', "require.resolve('playwright')")
    if ($probe.Code -ne 0) { return $false }
    Write-Host '  exporting locally (headless Chromium, about 2 minutes)'
    $old = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        Push-Location $root
        & $node.Source (Join-Path $tools 'export-world.mjs') --out $importDir 2>&1 | ForEach-Object { Write-Host "  $_" }
        $code = $LASTEXITCODE
    } finally { Pop-Location; $ErrorActionPreference = $old }
    if ($code -ne 0) { Fail 'export' "tools/unreal-engine/export-world.mjs failed (exit $code)" }
    if ((Test-Export $importDir) -ne 0) { Fail 'export' 'the local export does not check out' }
    $true
}

function Invoke-UnrealStep([string]$name, [string]$script, [string[]]$scriptArgs = @()) {
    $steps.Add($name)
    $line = "run-python.ps1 tools/unreal-engine/python/$script $($scriptArgs -join ' ')".TrimEnd()
    if ($DryRun) { Write-Host "DRY-RUN [$name] $line"; return }
    Write-Host "[$name] $line"
    $runArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $tools 'run-python.ps1'), "tools/unreal-engine/python/$script") + $scriptArgs
    if ($EngineDir) { $runArgs += @('-EngineDir', $EngineDir) }
    $old = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        Push-Location $root
        & $ps @runArgs 2>&1 | ForEach-Object { Write-Host "  $_" }
        $code = $LASTEXITCODE
    } finally { Pop-Location; $ErrorActionPreference = $old }
    if ($code -ne 0) { Fail $name "run-python.ps1 $script exited $code; see the log named above" }
}

# 1. the export
Write-Host "[export] $importDir"
$steps.Add('export')
if ((Test-Export $importDir) -eq 0) {
    Write-Host '  the export in unreal/Lunden/Import is current for this checkout'
} elseif ($DryRun) {
    Write-Host 'DRY-RUN [export] would take -ExportFrom, the workflow artifact or a local export'
} elseif ($ExportFrom) {
    if ((Test-Export $ExportFrom) -ne 0) { Fail 'export' "$ExportFrom is not a current export for this checkout (see above)" }
    Install-Export $ExportFrom
} else {
    $fromArtifact = Get-ArtifactExport
    if ($fromArtifact) {
        if ((Test-Export $fromArtifact) -ne 0) { Fail 'export' "the workflow artifact in $fromArtifact does not match this checkout" }
        Install-Export $fromArtifact
        Remove-Item -LiteralPath $fromArtifact -Recurse -Force
    } elseif (-not (Invoke-LocalExport)) {
        Fail 'export' ("no current export and no way to make one here. Do one of:`n" +
            "  - install and log in to the GitHub CLI once (winget install GitHub.cli; gh auth login), so the workflow's artifact is used;`n" +
            "  - install Playwright in this checkout once (npm install --no-save playwright@1.58.2 three@0.170.0; npx playwright install chromium);`n" +
            "  - export from WSL at this commit and pass it: tools/browsertest.sh node tools/unreal-engine/export-world.mjs --out <dir>, then -ExportFrom <dir>.")
    }
}

# 2. the zones (unchanged ones are skipped by import_world.py itself)
$zoneArgs = @()
if ($Zones) { $zoneArgs = @('--zones', $Zones) }
Invoke-UnrealStep 'import' 'import_world.py' $zoneArgs
if (-not $ImportOnly) {
    # 3. derived levels (each skips when unchanged), 4. the world map
    foreach ($b in 'build_l1007', 'build_exterior', 'build_site', 'build_lighting', 'build_vegetation', 'build_interaction') {
        Invoke-UnrealStep $b "$b.py"
    }
    Invoke-UnrealStep 'compose-check' 'compose_world.py' @('--check')
}
# 5. quick tests
Invoke-UnrealStep 'import-check' 'import_world.py' (@('--check') + $zoneArgs)
if ($DryRun) { Write-Host "DRY-RUN steps: $($steps -join ', ')"; exit $UnrealExit.Ok }

# 6. record the sync, then the release gate
$stampArgs = @((Join-Path $tools 'check-import.mjs'), '--write-sync-stamp', '--steps', ($steps -join ','))
if ($ImportOnly) { $stampArgs += '--partial' }
$r = Invoke-Node $stampArgs
$r.Out | ForEach-Object { Write-Host "  $_" }
if ($r.Code -ne 0) { Fail 'sync-stamp' 'could not write Generated/sync-stamp.json' }
$gate = Invoke-Node @((Join-Path $tools 'check-import.mjs'))
$gate.Out | ForEach-Object { Write-Host "  $_" }
if ($ImportOnly) { Write-Host 'Partial sync done (import only): release.ps1 still needs a full sync-import run.'; exit $UnrealExit.Ok }
if ($gate.Code -ne 0) { Fail 'release-gate' 'check-import.mjs still reports the import as stale (see above)' }
$dirty = & git -C $root status --porcelain=v1 --untracked-files=no
if ($dirty) { Write-Host "Note: versioned files changed (commit them with their LFS locks before a release):`n$($dirty -join "`n")" -ForegroundColor Yellow }
Write-Host 'LUNDEN_SYNC_IMPORT_OK'
exit $UnrealExit.Ok
