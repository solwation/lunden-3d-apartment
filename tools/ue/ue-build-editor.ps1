<#
.SYNOPSIS
  Lunden (#2243): build the LundenEditor target (C++ module) with UnrealBuildTool.
.DESCRIPTION
  Runs <engine>\Engine\Build\BatchFiles\Build.bat LundenEditor Win64 <Configuration> -Project=<uproject> -WaitMutex.
  Checks the environment first (ue-env.ps1); when the engine/toolchain is missing it only prints the command it would
  run and exits with the ue-env code. Log: unreal/Lunden/Saved/Logs/ue-build-editor-<time>.log.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-build-editor.ps1
#>
[CmdletBinding()]
param(
	[ValidateSet('Development', 'DebugGame')][string]$Configuration = 'Development',
	[string]$EngineDir
)
. (Join-Path $PSScriptRoot 'ue-common.ps1')

$log = '<unreal/Lunden/Saved/Logs/ue-build-editor-TIME.log>'
$argsFor = { param($uproject, $logPath) "LundenEditor Win64 $Configuration -Project=$(ConvertTo-UeArg $uproject) -WaitMutex -NoHotReloadFromIDE -Log=$(ConvertTo-UeArg $logPath)" }
$p = Get-LundenProject
$envr = Resolve-UeForRun $EngineDir 'ue-build-editor' { param($root) Format-UeCommand (Join-Path $root 'Engine\Build\BatchFiles\Build.bat') (& $argsFor $p.UProject $log) }

$log = New-UeLogPath 'ue-build-editor'
$code = Invoke-UeProcess $envr.Engine.BuildBat (& $argsFor $p.UProject $log)
Write-Host "Build.bat exit code $code; log $log"
if ($code -ne 0) { exit $UeExit.Failed }
exit $UeExit.Ok
