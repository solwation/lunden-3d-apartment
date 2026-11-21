<#
.SYNOPSIS
  Cook a local Win64 Shipping archive with the installed Epic runtime and record its source revision.
.DESCRIPTION
  Before cooking, the import gate (#2305, tools/unreal-engine/check-import.mjs) refuses a local Unreal import that is
  older than the web export of this commit. -SyncImport runs tools/unreal-engine/sync-import.ps1 first when it is.
  -SkipImportGate is for fixture tests only; build-info.json then records import.gate = skipped.
.EXAMPLE
  .\tools\unreal-engine\release.ps1 -Version 0.1.0 -Content 12 -OutputRoot D:\LundenBuilds
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Version,
    [Parameter(Mandatory)][ValidateRange(0, 2147483647)][int]$Content,
    [string]$OutputRoot = (Join-Path $env:LOCALAPPDATA 'Lunden\Builds'),
    [string]$EngineDir,
    [switch]$SyncImport,
    [switch]$SkipImportGate
)
. (Join-Path $PSScriptRoot 'common.ps1')

$project = Get-LundenProject
function Get-CleanRevision {
    $status = & git -C $project.RepoRoot status --porcelain=v1 --untracked-files=all --ignore-submodules=none
    if ($LASTEXITCODE -ne 0) { throw 'Could not check Git worktree status.' }
    if ($status) { throw "Release requires a clean Git worktree. Review git status in $($project.RepoRoot)." }
    $sha = & git -C $project.RepoRoot rev-parse --verify HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve Git HEAD.' }
    $sha
}

$commit = Get-CleanRevision
$scriptBlob = & git -C $project.RepoRoot rev-parse --verify "${commit}:tools/unreal-engine/release.ps1"
if ($LASTEXITCODE -ne 0) { throw 'release.ps1 must be tracked in the release commit.' }

$base = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputRoot)
$descendant = $project.RepoRoot + '\'
if ($base -eq $project.RepoRoot -or $base.StartsWith($descendant, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose an output root outside the Git checkout.'
}
# #2305: never cook an import that is older than the web export of this commit.
function Test-LundenImport {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Release requires Node.js on PATH for the import gate (tools/unreal-engine/check-import.mjs).' }
    try {
        $ErrorActionPreference = 'Continue'
        & $node.Source (Join-Path $PSScriptRoot 'check-import.mjs') 2>&1 | ForEach-Object { Write-Host "$_" }
        $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
}
$fix = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\unreal-engine\sync-import.ps1'
if ($SkipImportGate) {
    Write-Warning 'Import gate skipped (-SkipImportGate): this archive may hold an import older than the export.'
    $importInfo = [ordered]@{ gate = 'skipped' }
} else {
    $gate = Test-LundenImport
    if ($gate -ne 0 -and $SyncImport) {
        Write-Host "Import is older than the export; running sync-import.ps1 (-SyncImport)"
        & (Get-Process -Id $PID).Path -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'sync-import.ps1') -EngineDir $EngineDir
        if ($LASTEXITCODE -ne 0) { throw "sync-import.ps1 failed (exit $LASTEXITCODE); nothing was built." }
        if ((Get-CleanRevision) -ne $commit) { throw 'Git HEAD changed during sync-import.ps1.' }
        $gate = Test-LundenImport
    }
    if ($gate -ne 0) {
        throw "The local Unreal import is older than the web export of $($commit.Substring(0, 12)) (import gate exit $gate); nothing was built. Fix: $fix (or run release.ps1 with -SyncImport)."
    }
    $manifestFile = Join-Path $project.Dir 'Import\export-manifest.json'
    $exportManifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $importInfo = [ordered]@{ gate = 'passed'; exportCommit = $exportManifest.sourceCommit; sourceHash = $exportManifest.sourceHash
        exportManifestSha256 = (Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant() }
}

$build = Join-Path $base ("{0}-{1}" -f $commit.Substring(0, 12), [guid]::NewGuid().ToString('N'))
$archive = Join-Path $build 'archive'
# UnrealPak seeds the pak's path-hash index with a CRC of the full output .pak path, so a per-build
# staging directory gives every build a different Lunden-Windows.pak. Stage at one fixed path under
# the output root instead; each build keeps its own log and archive.
$stage = Join-Path $base 'stage'
$uatArgs = @('BuildCookRun', "-project=$($project.UProject)", '-platform=Win64', '-clientconfig=Shipping',
    '-nocompileuat', '-nocompile', '-skipbuild', '-cook', '-stage', '-pak', '-iostore', '-package', '-nodebuginfo', '-nobootstrapexe', '-archive',
    "-stagingdirectory=$stage", "-archivedirectory=$archive", '-unattended', '-nop4', '-utf8output')
$report = Resolve-UnrealForRun $EngineDir 'release' {
    param($root)
    Format-UnrealCommand (Join-Path $root 'Engine\Build\BatchFiles\RunUAT.bat') (($uatArgs | ForEach-Object { ConvertTo-UnrealArg $_ }) -join ' ')
}
if (-not (Test-Path -LiteralPath $report.Engine.RunUAT -PathType Leaf)) { throw 'RunUAT.bat is missing from the engine installation.' }
New-Item -ItemType Directory -Path $build | Out-Null
$log = Join-Path $build 'BuildCookRun.log'
# The shared staging directory (and UAT's per-engine response files) allow one release build at a time.
$lock = New-Object Threading.Mutex($false, 'Local\Lunden-release-BuildCookRun')
try {
    try {
        if (-not $lock.WaitOne(0)) {
            Write-Host 'Waiting for another release build on this PC to finish...'
            [void]$lock.WaitOne()
        }
    } catch [Threading.AbandonedMutexException] { }
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    Write-Host "Building $commit; staging: $stage; UAT log: $log"
    # Windows PowerShell 5.1 wraps redirected native stderr as nonterminating errors.
    # Capture both streams, and take success from UAT's actual exit code.
    try {
        $ErrorActionPreference = 'Continue'
        & $report.Engine.RunUAT @uatArgs 2>&1 | Out-File -LiteralPath $log -Encoding utf8
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
} finally { $lock.ReleaseMutex(); $lock.Dispose() }
if ($code -ne 0) { throw "BuildCookRun failed (exit $code); see $log" }

$package = Join-Path $archive 'Windows'
$runtimePath = 'Engine/Binaries/Win64/UnrealGame-Win64-Shipping.exe'
$game = Join-Path $package $runtimePath
if (-not (Test-Path -LiteralPath $game -PathType Leaf) -or (Get-Item -LiteralPath $game).Length -eq 0) {
    throw "BuildCookRun produced no Win64 Shipping executable in the archive; see $log"
}
$stock = Join-Path $report.Engine.Root $runtimePath
$sha256 = (Get-FileHash -LiteralPath $game -Algorithm SHA256).Hash
if ($sha256 -ne (Get-FileHash -LiteralPath $stock -Algorithm SHA256).Hash) {
    throw 'The archived Shipping executable differs from the installed Epic runtime.'
}
$signature = Get-AuthenticodeSignature -LiteralPath $game
if ($signature.Status -ne 'Valid') { throw "Invalid Shipping executable signature: $($signature.Status)" }
$publisher = $signature.SignerCertificate.GetNameInfo('SimpleName', $false)
if ($publisher -ne 'Epic Games Inc.') { throw "Unexpected Shipping executable publisher: $publisher" }
if ((Get-CleanRevision) -ne $commit) { throw "Git HEAD changed during BuildCookRun; see $log" }
$info = [ordered]@{
    appVersion = $Version; contentVersion = $Content; commit = $commit
    engineVersion = $report.Engine.Version; releaseScriptBlob = $scriptBlob
    runtime = [ordered]@{ path = $runtimePath; sha256 = $sha256; publisher = $publisher }
    import = $importInfo
    builtUtc = [DateTime]::UtcNow.ToString('o')
}
# build-info.json is the completion marker; a failed run keeps its diagnostics separately.
$pending = Join-Path $build 'build-info.tmp'
[IO.File]::WriteAllText($pending, ($info | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
[IO.File]::Move($pending, (Join-Path $package 'build-info.json'))
Write-Host "Windows archive with verified Epic runtime ready: $package"
