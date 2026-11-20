# Exercise the real wrapper's exit codes. The fake editor writes the same report fields as UE 5.8.
$ErrorActionPreference = 'Stop'
$tools = Split-Path $PSScriptRoot
$temp = Join-Path ([IO.Path]::GetTempPath()) ('Lunden editor test ' + [guid]::NewGuid().ToString('N'))
$runner = (Get-Process -Id $PID).Path
$fixture = Join-Path $temp 'tools\unreal-engine'
$engine = Join-Path $temp 'engine'
$project = Join-Path $temp 'unreal\Lunden'
$previous = $env:LUNDEN_TEST_EDITOR
try {
    New-Item -ItemType Directory -Path $fixture, $project, "$engine\Engine\Build", "$engine\Engine\Binaries\Win64" | Out-Null
    Copy-Item "$tools\common.ps1", "$tools\run-tests.ps1" $fixture
    Copy-Item "$tools\..\..\unreal\Lunden\ENGINE_VERSION", "$tools\..\..\unreal\Lunden\Lunden.uproject" $project
    $v = [version](Get-Content "$project\ENGINE_VERSION")
    @{ MajorVersion=$v.Major; MinorVersion=$v.Minor; PatchVersion=$v.Build; Changelist=1; BranchName='fixture' } |
        ConvertTo-Json | Set-Content "$engine\Engine\Build\Build.version"
    New-Item -ItemType File "$engine\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" | Out-Null
    Add-Content -LiteralPath "$fixture\common.ps1" -Value @'
function Invoke-UnrealProcess([string]$Exe, [string]$ArgLine) {
    if ($ArgLine -notlike '*-EnablePlugins=PythonAutomationTest*' -or
        $ArgLine -notlike '*Automation RunTests Editor.Python.Lunden.; Quit*' -or
        $ArgLine -notmatch '-ReportExportPath="([^"]+)"') { throw "Unexpected editor command: $ArgLine" }
    $index = Join-Path $Matches[1] 'index.json'
    $result = @{ succeeded=1; succeededWithWarnings=0; failed=0; notRun=0 }
    switch ($env:LUNDEN_TEST_EDITOR) {
        'no-report' { return 0 }
        'test-failure' { $result.succeeded=0; $result.failed=1 }
        'not-run' { $result.notRun=1 }
    }
    $result | ConvertTo-Json | Set-Content -LiteralPath $index
    if ($env:LUNDEN_TEST_EDITOR -eq 'editor-failure') { return 255 }
    return 0
}
'@
    foreach ($case in 'success', 'no-report', 'test-failure', 'not-run', 'editor-failure') {
        $env:LUNDEN_TEST_EDITOR = $case
        & $runner -NoProfile -NonInteractive -File "$fixture\run-tests.ps1" -EngineDir $engine
        $expected = if ($case -eq 'success') { 0 } else { 1 }
        if ($LASTEXITCODE -ne $expected) { throw "Editor fixture '$case' returned $LASTEXITCODE, expected $expected" }
    }
    Write-Host 'PASS: editor success, missing report, failed or unrun test, and nonzero editor exit.'
} finally {
    $env:LUNDEN_TEST_EDITOR = $previous
    if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
