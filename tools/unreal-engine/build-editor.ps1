<#
.SYNOPSIS
  Lunden (#2243): build the LundenEditor target (C++ module) with UnrealBuildTool.
.DESCRIPTION
  Runs <engine>\Engine\Build\BatchFiles\Build.bat LundenEditor Win64 <Configuration> -Project=<uproject> -WaitMutex.
  Checks the environment first (check-environment.ps1); when the engine/toolchain is missing it only prints the command it would
  run and exits with the check-environment code. Log: unreal/Lunden/Saved/Logs/build-editor-<time>.log.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/build-editor.ps1
#>
[CmdletBinding()]
param(
	[ValidateSet('Development', 'DebugGame')][string]$Configuration = 'Development',
	[string]$EngineDir
)
. (Join-Path $PSScriptRoot 'common.ps1')

$log = '<unreal/Lunden/Saved/Logs/build-editor-TIME.log>'
$argsFor = { param($uproject, $logPath) "LundenEditor Win64 $Configuration -Project=$(ConvertTo-UnrealArg $uproject) -WaitMutex -NoHotReloadFromIDE -Log=$(ConvertTo-UnrealArg $logPath)" }
$p = Get-LundenProject
$envr = Resolve-UnrealForRun $EngineDir 'build-editor' { param($root) Format-UnrealCommand (Join-Path $root 'Engine\Build\BatchFiles\Build.bat') (& $argsFor $p.UProject $log) }

$log = New-UnrealLogPath 'build-editor'
$code = Invoke-UnrealProcess $envr.Engine.BuildBat (& $argsFor $p.UProject $log)
Write-Host "Build.bat exit code $code; log $log"
if ($code -ne 0) { exit $UnrealExit.Failed }
exit $UnrealExit.Ok
