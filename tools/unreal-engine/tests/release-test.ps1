# Windows PowerShell integration test: real Git and release.ps1, disposable UAT/toolchain fixtures.
$ErrorActionPreference = 'Stop'
$unrealEngineTools = Split-Path $PSScriptRoot
$temp = Join-Path ([IO.Path]::GetTempPath()) ('Lunden build test ' + [guid]::NewGuid().ToString('N'))
$repo = Join-Path $temp 'source repo'
$out = Join-Path $temp 'unsigned builds'
$fixture = Join-Path $repo 'tools\unreal-engine'
$engine = Join-Path $temp 'fixture engine'
$batDir = Join-Path $engine 'Engine\Build\BatchFiles'
$ps = (Get-Process -Id $PID).Path
$previousMode = $env:LUNDEN_FIXTURE_MODE
function Run-Release([string]$output = $out, [string]$failure, [switch]$Gate, [string[]]$Extra = @()) {
    # the fixture has no Unreal import: every case but the gate's own skips it (#2305)
    $gateArgs = @()
    if (-not $Gate) { $gateArgs = @('-SkipImportGate') } # (an if-expression would unroll the array: splatting a string passes its characters)
    try {
        $ErrorActionPreference = 'Continue'
        $result = & $ps -NoProfile -NonInteractive -File (Join-Path $fixture 'release.ps1') -Version 0.1.0 -Content 12 -EngineDir $engine -OutputRoot $output @gateArgs @Extra 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    $text = $result | Out-String
    if ($failure) {
        if ($code -eq 0 -or $text -notmatch $failure) { throw "Expected $failure; exit $code. $text" }
    } elseif ($code -ne 0) { throw "Clean build failed (exit $code). $text" }

}
function Require($ok, $message) { if (-not $ok) { throw $message } }
function Git-Fixture {
    $result = & git -C $repo @args
    if ($LASTEXITCODE -ne 0) { throw "test repo Git command failed: $args" }
    $result
}
try {
    New-Item -ItemType Directory -Path $fixture, $batDir, (Join-Path $repo 'unreal\Lunden') | Out-Null
    Copy-Item (Join-Path $unrealEngineTools 'release.ps1'), (Join-Path $unrealEngineTools 'common.ps1') -Destination $fixture
    # the import gate (#2305) and the export check it runs
    Copy-Item (Join-Path $unrealEngineTools 'check-import.mjs'), (Join-Path $unrealEngineTools 'check-export.mjs'), (Join-Path $unrealEngineTools 'sources.mjs'),
        (Join-Path $unrealEngineTools 'json-schema.mjs') -Destination $fixture
    $source = Join-Path $unrealEngineTools '..\..\unreal\Lunden'
    Copy-Item (Join-Path $source 'Lunden.uproject'), (Join-Path $source 'ENGINE_VERSION') -Destination (Join-Path $repo 'unreal\Lunden')
    # Only the disposable checkout substitutes discovery of installed VS/SDK. Real engine-lock checks stay active.
    Add-Content (Join-Path $fixture 'common.ps1') @'
function Find-VisualStudio {
    [pscustomobject]@{ Name='Fixture'; Version=[version]'17.14'; Path='test'; Msvc=@([version]'14.38')
        Components=@('Microsoft.Net.Component.4.6.2.TargetingPack'); MissingComponents=@() }
}
function Find-WindowsSdk { [version]'10.0.22621.0' }
# The fixture bytes only model UAT file placement. Production uses the Windows signature provider.
function Get-AuthenticodeSignature([string]$LiteralPath) {
    $cert = [pscustomobject]@{}
    $cert | Add-Member ScriptMethod GetNameInfo {
        param($nameType, $issuer)
        if ($env:LUNDEN_FIXTURE_MODE -eq 'other-publisher') { return 'Other Publisher' }
        'Epic Games Inc.'
    }
    $status = if ($env:LUNDEN_FIXTURE_MODE -eq 'unsigned-runtime') { 'NotSigned' } else { 'Valid' }
    [pscustomobject]@{ Status = $status; SignerCertificate = $cert }
}
'@
    '{"MajorVersion":5,"MinorVersion":8,"PatchVersion":4,"Changelist":1,"BranchName":"fixture"}' |
        Set-Content (Join-Path $engine 'Engine\Build\Build.version')
    New-Item -Type Directory -Path (Join-Path $engine 'Engine\Binaries\Win64') | Out-Null
    New-Item -Type File -Path (Join-Path $engine 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') | Out-Null
    Set-Content (Join-Path $engine 'Engine\Binaries\Win64\UnrealGame-Win64-Shipping.exe') 'synthetic stock runtime'
    Set-Content (Join-Path $batDir 'RunUAT.bat') @'
@echo off
echo FAKE BuildCookRun fixture
if "%LUNDEN_FIXTURE_MODE%"=="uat-failure" exit /b 19
if "%LUNDEN_FIXTURE_MODE%"=="no-game" exit /b 0
powershell.exe -NoProfile -NonInteractive -File "%~dp0fixture.ps1" %*
exit /b %ERRORLEVEL%
'@
    Set-Content (Join-Path $batDir 'fixture.ps1') @'
$ErrorActionPreference = 'Stop'
foreach ($flag in 'BuildCookRun','-platform=Win64','-clientconfig=Shipping','-skipbuild','-nocompile','-nocompileuat','-nobootstrapexe','-cook','-stage','-pak','-iostore','-package','-archive') {
    if ($args -notcontains $flag) { throw "Missing expected flag $flag" }
}
if ($args -contains '-build') { throw 'Content-only project must use the installed game executable.' }
$project = ($args -like '-project=*').Substring(9)
if (-not (Test-Path -LiteralPath $project)) { throw "Invalid project path $project" }
if ($env:LUNDEN_FIXTURE_MODE -eq 'dirty-during') { Add-Content $project 'changed during UAT fixture' }
$stage = ($args -like '-stagingdirectory=*').Substring(18)
Write-Output "FIXTURE STAGE=$stage"
New-Item -ItemType Directory -Path $stage | Out-Null
$archive = ($args -like '-archivedirectory=*').Substring(18)
$dir = Join-Path $archive 'Windows\Engine\Binaries\Win64'
New-Item -ItemType Directory -Path $dir | Out-Null
$game = Join-Path $dir 'UnrealGame-Win64-Shipping.exe'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\..\Binaries\Win64\UnrealGame-Win64-Shipping.exe') -Destination $game
if ($env:LUNDEN_FIXTURE_MODE -eq 'changed-runtime') { Add-Content $game 'changed executable' }
'@
    # Exercise release.ps1's real gated sync invocation; any missing argument (including a split space) fails the fixture.
    Set-Content (Join-Path $fixture 'sync-import.ps1') @'
param([string]$EngineDir, [string]$ExportFrom)
if ($EngineDir -ne (Join-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot))) 'fixture engine') -or
    $ExportFrom -ne 'folder with spaces') { exit 87 }
exit 49
'@
    Git-Fixture init --quiet
    Git-Fixture add .
    Git-Fixture -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgSign=false commit -qm fixture
    $sha = Git-Fixture rev-parse HEAD
    $blob = Git-Fixture rev-parse 'HEAD:tools/unreal-engine/release.ps1'
    $env:LUNDEN_FIXTURE_MODE = 'success'
    Run-Release
    Run-Release
    $finished = @(Get-ChildItem -LiteralPath $out -Recurse -Filter build-info.json)
    Require ($finished.Count -eq 2) 'Expected two distinct completed archives'
    foreach ($file in $finished) {
        $info = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        Require ($info.commit -eq $sha -and $info.releaseScriptBlob -eq $blob -and $info.engineVersion -eq '5.8.4') 'Incorrect source provenance'
        Require ($info.appVersion -eq '0.1.0' -and $info.contentVersion -eq 12 -and $info.builtUtc -match 'Z$') 'Incorrect build metadata'
        Require ($info.runtime.path -eq 'Engine/Binaries/Win64/UnrealGame-Win64-Shipping.exe') 'Wrong runtime path'
        $hash = (Get-FileHash (Join-Path $file.DirectoryName $info.runtime.path)).Hash
        Require ($info.runtime.sha256 -eq $hash -and $info.runtime.publisher -eq 'Epic Games Inc.') 'Missing runtime verification metadata'
        Require ($info.import.gate -eq 'skipped') 'build-info.json does not record the skipped import gate'
    }
    $logs = @(Get-ChildItem -LiteralPath $out -Recurse -Filter BuildCookRun.log)
    Require ($logs.Count -eq 2 -and @(Select-String -Path $logs.FullName -Pattern 'FAKE BuildCookRun fixture').Count -eq 2) 'Missing UAT logs'
    # UnrealPak derives the pak index's path-hash seed from the staged .pak path: every build must stage at one path.
    $stages = @(Select-String -Path $logs.FullName -Pattern 'FIXTURE STAGE=(.*)$' | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() })
    Require ($stages.Count -eq 2 -and $stages[0] -eq $stages[1] -and $stages[0] -eq (Join-Path $out 'stage')) "Builds staged at different paths: $stages"
    # #2305: without an import as new as the export (here: no export at all) nothing is built
    Run-Release $out 'older than the web export' -Gate
    Run-Release $out 'pass both' -Gate -Extra @('-ExportFrom', 'folder with spaces')
    Run-Release $out 'requires the import gate' -Extra @('-SyncImport', '-ExportFrom', 'folder with spaces')
    Run-Release $out 'exit 49' -Gate -Extra @('-SyncImport', '-ExportFrom', 'folder with spaces')
    Require (@(Get-ChildItem -LiteralPath $out | Where-Object Name -ne 'stage').Count -eq 2) 'A stale import started a build'
    Run-Release (Join-Path $repo 'inside') 'outside the Git checkout'
    $dirty = Join-Path $repo 'dirty.txt'
    Set-Content $dirty 'untracked'
    Run-Release $out 'clean Git worktree'
    Git-Fixture add dirty.txt
    Run-Release $out 'clean Git worktree'
    Git-Fixture rm -q -f dirty.txt
    Require (@(Get-ChildItem -LiteralPath $out | Where-Object Name -ne 'stage').Count -eq 2) 'Dirty worktree started a build'
    $env:LUNDEN_FIXTURE_MODE = 'uat-failure'
    Run-Release $out 'exit 19'
    $env:LUNDEN_FIXTURE_MODE = 'no-game'
    Run-Release $out 'no Win64 Shipping executable'
    $env:LUNDEN_FIXTURE_MODE = 'changed-runtime'
    Run-Release $out 'differs from the installed Epic runtime'
    $env:LUNDEN_FIXTURE_MODE = 'unsigned-runtime'
    Run-Release $out 'Invalid Shipping executable signature'
    $env:LUNDEN_FIXTURE_MODE = 'other-publisher'
    Run-Release $out 'Unexpected Shipping executable publisher'
    $env:LUNDEN_FIXTURE_MODE = 'dirty-during'
    Run-Release $out 'clean Git worktree'
    Require (@(Get-ChildItem -LiteralPath $out -Recurse -Filter build-info.json).Count -eq 2) 'Failed build got a completion marker'
    Write-Host 'PASS: two clean fixture builds, provenance and logs, one fixed staging path, import gate, external-only output, dirty inputs, UAT failures, changed checkout.'
}
finally {
    $env:LUNDEN_FIXTURE_MODE = $previousMode
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
# The last child may be an expected negative probe. Actions inherits its exit code otherwise.
exit 0
