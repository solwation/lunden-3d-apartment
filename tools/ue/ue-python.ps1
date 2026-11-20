<#
.SYNOPSIS
  Lunden (#2243): run a Python script headless in the Unreal editor (no window, no GPU).
.DESCRIPTION
  UnrealEditor-Cmd.exe <uproject> -run=pythonscript -script="<script> <args>" -unattended -nullrhi -nosplash ...
  Fails (exit 1) when the editor exits non-zero or the log contains a Python error. Requires a built editor
  module (ue-build-editor.ps1). Without a usable engine it only prints the command. Log under unreal/Lunden/Saved/Logs.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-python.ps1 tools/ue/python/smoke_create_asset.py
#>
[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)][string]$Script,
	[Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$ScriptArgs = @(),
	[string]$EngineDir
)
. (Join-Path $PSScriptRoot 'ue-common.ps1')

$p = Get-LundenProject
$scriptPath = if ([System.IO.Path]::IsPathRooted($Script)) { $Script } else { Join-Path (Get-Location).ProviderPath $Script }
if (-not (Test-Path -LiteralPath $scriptPath)) {
	$alt = Join-Path $p.RepoRoot $Script
	if (Test-Path -LiteralPath $alt) { $scriptPath = $alt } else { Write-Host "ERROR: Python script not found: $Script" -ForegroundColor Red; exit $UeExit.Failed }
}
$scriptPath = [System.IO.Path]::GetFullPath($scriptPath)
$log = '<unreal/Lunden/Saved/Logs/ue-python-TIME.log>'
$argsFor = { param($logPath)
	$inner = (@($scriptPath) + $ScriptArgs) -join ' '
	"$(ConvertTo-UeArg $p.UProject) -run=pythonscript -script=$(ConvertTo-UeArg $inner) -unattended -nullrhi -nosplash -nosound -nop4 -stdout -FullStdOutLogOutput -abslog=$(ConvertTo-UeArg $logPath)" }
$envr = Resolve-UeForRun $EngineDir 'ue-python' { param($root) Format-UeCommand (Join-Path $root 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') (& $argsFor $log) }

$log = New-UeLogPath 'ue-python'
$code = Invoke-UeProcess $envr.Engine.EditorCmd (& $argsFor $log)
# ASSUMPTION (verify in phase B): the pythonscript commandlet may return 0 after a Python exception, so the log is
# checked as well.
$pyErrors = @()
if (Test-Path -LiteralPath $log) { $pyErrors = @(Select-String -LiteralPath $log -Pattern 'LogPython: Error:|Traceback \(most recent call last\)' | Select-Object -First 20) }
foreach ($e in $pyErrors) { Write-Host "PYTHON ERROR: $($e.Line)" -ForegroundColor Red }
Write-Host "UnrealEditor-Cmd exit code $code; python errors $($pyErrors.Count); log $log"
if ($code -ne 0 -or $pyErrors.Count) { exit $UeExit.Failed }
exit $UeExit.Ok
