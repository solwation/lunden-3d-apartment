# Windows PowerShell integration test: real Git and release.ps1, disposable UAT/toolchain fixtures.
$ErrorActionPreference = 'Stop'
$ue = Split-Path $PSScriptRoot
$temp = Join-Path ([IO.Path]::GetTempPath()) ('Lunden build test ' + [guid]::NewGuid().ToString('N'))
$repo = Join-Path $temp 'source repo'
$out = Join-Path $temp 'unsigned builds'
$fixture = Join-Path $repo 'tools\ue'
$engine = Join-Path $temp 'fixture engine'
$batDir = Join-Path $engine 'Engine\Build\BatchFiles'
$ps = (Get-Process -Id $PID).Path
$previousMode = $env:LUNDEN_FIXTURE_MODE
function Run-Release([string]$output = $out, [string]$failure) {
    try {
        $ErrorActionPreference = 'Continue'
        $result = & $ps -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $fixture 'release.ps1') -Version 0.1.0 -Content 12 -EngineDir $engine -OutputRoot $output 2>&1
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
    Copy-Item (Join-Path $ue 'release.ps1'), (Join-Path $ue 'ue-common.ps1') -Destination $fixture
    $source = Join-Path $ue '..\..\unreal\Lunden'
    Copy-Item (Join-Path $source 'Lunden.uproject'), (Join-Path $source 'ENGINE_VERSION') -Destination (Join-Path $repo 'unreal\Lunden')
    # Only the disposable checkout substitutes discovery of installed VS/SDK. Real engine-lock checks stay active.
    Add-Content (Join-Path $fixture 'ue-common.ps1') @'
function Find-VisualStudio {
    [pscustomobject]@{ Name='Fixture'; Version=[version]'17.14'; Path='test'; Msvc=@([version]'14.38')
        Components=@('Microsoft.Net.Component.4.6.2.TargetingPack'); MissingComponents=@() }
}
function Find-WindowsSdk { [version]'10.0.22621.0' }
'@
    '{"MajorVersion":5,"MinorVersion":8,"PatchVersion":4,"Changelist":1,"BranchName":"fixture"}' |
        Set-Content (Join-Path $engine 'Engine\Build\Build.version')
    New-Item -Type Directory -Path (Join-Path $engine 'Engine\Binaries\Win64') | Out-Null
    New-Item -Type File -Path (Join-Path $engine 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') | Out-Null
    Set-Content (Join-Path $batDir 'RunUAT.bat') @'
@echo off
echo FAKE BuildCookRun fixture
if "%LUNDEN_FIXTURE_MODE%"=="uat-failure" exit /b 19
if "%LUNDEN_FIXTURE_MODE%"=="no-game" exit /b 0
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0fixture.ps1" %*
exit /b %ERRORLEVEL%
'@
    Set-Content (Join-Path $batDir 'fixture.ps1') @'
$ErrorActionPreference = 'Stop'
foreach ($flag in 'BuildCookRun','-platform=Win64','-clientconfig=Shipping','-build','-cook','-stage','-pak','-iostore','-package','-archive') {
    if ($args -notcontains $flag) { throw "Missing expected flag $flag" }
}
$project = ($args -like '-project=*').Substring(9)
if (-not (Test-Path -LiteralPath $project)) { throw "Invalid project path $project" }
if ($env:LUNDEN_FIXTURE_MODE -eq 'dirty-during') { Add-Content $project 'changed during UAT fixture' }
$archive = ($args -like '-archivedirectory=*').Substring(18)
$dir = Join-Path $archive 'Windows\Lunden\Binaries\Win64'
New-Item -ItemType Directory -Path $dir | Out-Null
Set-Content (Join-Path $dir 'Lunden-Win64-Shipping.exe') 'synthetic game fixture'
'@
    Git-Fixture init --quiet
    Git-Fixture add .
    Git-Fixture -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgSign=false commit -qm fixture
    $sha = Git-Fixture rev-parse HEAD
    $blob = Git-Fixture rev-parse 'HEAD:tools/ue/release.ps1'
    $env:LUNDEN_FIXTURE_MODE = 'success'
    Run-Release
    Run-Release
    $finished = @(Get-ChildItem -LiteralPath $out -Recurse -Filter build-info.json)
    Require ($finished.Count -eq 2) 'Expected two distinct completed archives'
    foreach ($file in $finished) {
        $info = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        Require ($info.commit -eq $sha -and $info.releaseScriptBlob -eq $blob -and $info.engineVersion -eq '5.8.4') 'Incorrect source provenance'
        Require ($info.appVersion -eq '0.1.0' -and $info.contentVersion -eq 12 -and $info.builtUtc -match 'Z$') 'Incorrect build metadata'
        Require (Test-Path (Join-Path $file.DirectoryName 'Lunden\Binaries\Win64\Lunden-Win64-Shipping.exe')) 'Missing fake game'
    }
    $logs = @(Get-ChildItem -LiteralPath $out -Recurse -Filter BuildCookRun.log)
    Require ($logs.Count -eq 2 -and @(Select-String -Path $logs.FullName -Pattern 'FAKE BuildCookRun fixture').Count -eq 2) 'Missing UAT logs'
    Run-Release (Join-Path $repo 'inside') 'outside the Git checkout'
    $dirty = Join-Path $repo 'dirty.txt'
    Set-Content $dirty 'untracked'
    Run-Release $out 'clean Git worktree'
    Git-Fixture add dirty.txt
    Run-Release $out 'clean Git worktree'
    Git-Fixture rm -q -f dirty.txt
    Require (@(Get-ChildItem -LiteralPath $out).Count -eq 2) 'Dirty worktree started a build'
    $env:LUNDEN_FIXTURE_MODE = 'uat-failure'
    Run-Release $out 'exit 19'
    $env:LUNDEN_FIXTURE_MODE = 'no-game'
    Run-Release $out 'no Win64 Shipping executable'
    $env:LUNDEN_FIXTURE_MODE = 'dirty-during'
    Run-Release $out 'clean Git worktree'
    Require (@(Get-ChildItem -LiteralPath $out -Recurse -Filter build-info.json).Count -eq 2) 'Failed build got a completion marker'
    Write-Host 'PASS: two clean fixture builds, provenance and logs, external-only output, dirty inputs, UAT failures, changed checkout.'
}
finally {
    $env:LUNDEN_FIXTURE_MODE = $previousMode
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
