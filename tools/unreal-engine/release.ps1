<#
.SYNOPSIS
  Build a local unsigned Win64 Shipping archive and record its source revision (#2244).
.EXAMPLE
  .\tools\unreal-engine\release.ps1 -Version 0.1.0 -Content 12 -OutputRoot D:\LundenBuilds
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Version,
    [Parameter(Mandatory)][ValidateRange(0, 2147483647)][int]$Content,
    [string]$OutputRoot = (Join-Path $env:LOCALAPPDATA 'Lunden\Builds'),
    [string]$EngineDir
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
$build = Join-Path $base ("{0}-{1}" -f $commit.Substring(0, 12), [guid]::NewGuid().ToString('N'))
$archive = Join-Path $build 'archive'
$stage = Join-Path $build 'stage'
$uatArgs = @('BuildCookRun', "-project=$($project.UProject)", '-platform=Win64', '-clientconfig=Shipping',
    '-build', '-cook', '-stage', '-pak', '-iostore', '-package', '-nodebuginfo', '-archive',
    "-stagingdirectory=$stage", "-archivedirectory=$archive", '-unattended', '-nop4', '-utf8output')
$report = Resolve-UnrealForRun $EngineDir 'release' {
    param($root)
    Format-UnrealCommand (Join-Path $root 'Engine\Build\BatchFiles\RunUAT.bat') (($uatArgs | ForEach-Object { ConvertTo-UnrealArg $_ }) -join ' ')
}
if (-not (Test-Path -LiteralPath $report.Engine.RunUAT -PathType Leaf)) { throw 'RunUAT.bat is missing from the engine installation.' }
New-Item -ItemType Directory -Path $build | Out-Null
$log = Join-Path $build 'BuildCookRun.log'
Write-Host "Building $commit; UAT log: $log"
# Windows PowerShell 5.1 wraps redirected native stderr as nonterminating errors.
# Capture both streams, and take success from UAT's actual exit code.
try {
    $ErrorActionPreference = 'Continue'
    & $report.Engine.RunUAT @uatArgs 2>&1 | Out-File -LiteralPath $log -Encoding utf8
    $code = $LASTEXITCODE
} finally { $ErrorActionPreference = 'Stop' }
if ($code -ne 0) { throw "BuildCookRun failed (exit $code); see $log" }

$package = Join-Path $archive 'Windows'
$game = Join-Path $package 'Lunden\Binaries\Win64\Lunden-Win64-Shipping.exe'
if (-not (Test-Path -LiteralPath $game -PathType Leaf) -or (Get-Item -LiteralPath $game).Length -eq 0) {
    throw "BuildCookRun produced no Win64 Shipping executable in the archive; see $log"
}
if ((Get-CleanRevision) -ne $commit) { throw "Git HEAD changed during BuildCookRun; see $log" }
$info = [ordered]@{
    appVersion = $Version; contentVersion = $Content; commit = $commit
    engineVersion = $report.Engine.Version; releaseScriptBlob = $scriptBlob
    builtUtc = [DateTime]::UtcNow.ToString('o')
}
# build-info.json is the completion marker; a failed run keeps its diagnostics separately.
$pending = Join-Path $build 'build-info.tmp'
[IO.File]::WriteAllText($pending, ($info | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
[IO.File]::Move($pending, (Join-Path $package 'build-info.json'))
Write-Host "Unsigned Windows archive ready: $package"
