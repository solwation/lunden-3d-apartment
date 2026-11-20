<#
.SYNOPSIS
  Lunden (#2243): run Unreal Automation Tests headless and fail unless they all pass.
.DESCRIPTION
  UnrealEditor-Cmd.exe <uproject> -ExecCmds="Automation RunTests <Filter>; Quit" -TestExit="Automation Test Queue Empty"
  -ReportExportPath=<Saved/Automation/<time>> -unattended -nullrhi ... and then reads the exported index.json.
  Runs the project tests under Content/Python with Epic's editor-only PythonAutomationTest plugin. Without a usable engine it
  only prints the command. Logs and reports under unreal/Lunden/Saved.
.EXAMPLE
  powershell.exe -NoProfile -File tools/unreal-engine/run-tests.ps1
  powershell.exe -NoProfile -File tools/unreal-engine/run-tests.ps1 -Filter Editor.Python.Lunden.test_fixture_material
#>
[CmdletBinding()]
param(
	[string]$Filter = 'Editor.Python.Lunden.',
	[switch]$WithRhi,
	[string]$EngineDir
)
. (Join-Path $PSScriptRoot 'common.ps1')

$p = Get-LundenProject
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $p.Dir "Saved\Automation\$stamp"
$log = '<unreal/Lunden/Saved/Logs/run-tests-TIME.log>'
$argsFor = { param($logPath)
	$a = "$(ConvertTo-UnrealArg $p.UProject) -EnablePlugins=PythonAutomationTest -ExecCmds=`"Automation RunTests $Filter; Quit`" -TestExit=`"Automation Test Queue Empty`"" +
		" -ReportExportPath=$(ConvertTo-UnrealArg $report) -unattended -nosplash -nosound -nop4 -stdout -FullStdOutLogOutput -abslog=$(ConvertTo-UnrealArg $logPath)"
	if (-not $WithRhi) { $a += ' -nullrhi' }
	$a }
$envr = Resolve-UnrealForRun $EngineDir 'run-tests' -SkipToolchain { param($root) Format-UnrealCommand (Join-Path $root 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') (& $argsFor $log) }

$log = New-UnrealLogPath 'run-tests'
New-Item -ItemType Directory -Force -Path $report | Out-Null
$code = Invoke-UnrealProcess $envr.Engine.EditorCmd (& $argsFor $log)
$index = Join-Path $report 'index.json'
if (-not (Test-Path -LiteralPath $index)) {
	Write-Host "ERROR: no test report at $index (editor exit code $code); see $log" -ForegroundColor Red
	exit $UnrealExit.Failed
}
$r = Get-Content -LiteralPath $index -Raw | ConvertFrom-Json
$passed = [int]$r.succeeded + [int]$r.succeededWithWarnings
Write-Host "Automation '$Filter': passed $passed (with warnings $($r.succeededWithWarnings)), failed $($r.failed), not run $($r.notRun); editor exit code $code"
Write-Host "Report $report; log $log"
if ($code -ne 0 -or [int]$r.failed -gt 0 -or [int]$r.notRun -gt 0 -or $passed -lt 1) { exit $UnrealExit.Failed }
exit $UnrealExit.Ok
