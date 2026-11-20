<#
.SYNOPSIS
  Lunden (#2243): run Unreal Automation Tests headless and fail unless they all pass.
.DESCRIPTION
  UnrealEditor-Cmd.exe <uproject> -ExecCmds="Automation RunTests <Filter>; Quit" -TestExit="Automation Test Queue Empty"
  -ReportExportPath=<Saved/Automation/<time>> -unattended -nullrhi ... and then reads the exported index.json.
  Default filter "Lunden." (the project's own tests, e.g. Lunden.Smoke.ModuleLoaded). Without a usable engine it
  only prints the command. Logs and reports under unreal/Lunden/Saved.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-test.ps1
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-test.ps1 -Filter Lunden.Smoke
#>
[CmdletBinding()]
param(
	[string]$Filter = 'Lunden.',
	[switch]$WithRhi,
	[string]$EngineDir
)
. (Join-Path $PSScriptRoot 'ue-common.ps1')

$p = Get-LundenProject
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $p.Dir "Saved\Automation\$stamp"
$log = '<unreal/Lunden/Saved/Logs/ue-test-TIME.log>'
$argsFor = { param($logPath)
	$a = "$(ConvertTo-UeArg $p.UProject) -ExecCmds=`"Automation RunTests $Filter; Quit`" -TestExit=`"Automation Test Queue Empty`"" +
		" -ReportExportPath=$(ConvertTo-UeArg $report) -unattended -nosplash -nosound -nop4 -stdout -FullStdOutLogOutput -abslog=$(ConvertTo-UeArg $logPath)"
	if (-not $WithRhi) { $a += ' -nullrhi' }
	$a }
$envr = Resolve-UeForRun $EngineDir 'ue-test' { param($root) Format-UeCommand (Join-Path $root 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') (& $argsFor $log) }

$log = New-UeLogPath 'ue-test'
New-Item -ItemType Directory -Force -Path $report | Out-Null
$code = Invoke-UeProcess $envr.Engine.EditorCmd (& $argsFor $log)
$index = Join-Path $report 'index.json'
if (-not (Test-Path -LiteralPath $index)) {
	Write-Host "ERROR: no test report at $index (editor exit code $code); see $log" -ForegroundColor Red
	exit $UeExit.Failed
}
$r = Get-Content -LiteralPath $index -Raw | ConvertFrom-Json
$passed = [int]$r.succeeded + [int]$r.succeededWithWarnings
Write-Host "Automation '$Filter': passed $passed (with warnings $($r.succeededWithWarnings)), failed $($r.failed), not run $($r.notRun); editor exit code $code"
Write-Host "Report $report; log $log"
if ([int]$r.failed -gt 0 -or $passed -lt 1) { exit $UeExit.Failed }
exit $UeExit.Ok
