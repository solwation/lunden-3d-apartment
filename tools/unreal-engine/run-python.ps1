<#
.SYNOPSIS
  Lunden (#2243): run a Python script headless in the Unreal editor (no window, no GPU).
.DESCRIPTION
  UnrealEditor-Cmd.exe <uproject> -run=pythonscript -script="<script> <args>" -unattended -nullrhi -nosplash ...
  Fails (exit 1) when the editor exits non-zero or the log contains a Python error. Requires a built editor
  module (build-editor.ps1). Without a usable engine it only prints the command. Log under unreal/Lunden/Saved/Logs.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/smoke_create_asset.py
#>
[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)][string]$Script,
	[Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$ScriptArgs = @(),
	[string]$EngineDir
)
. (Join-Path $PSScriptRoot 'common.ps1')

$p = Get-LundenProject
$scriptPath = if ([System.IO.Path]::IsPathRooted($Script)) { $Script } else { Join-Path (Get-Location).ProviderPath $Script }
if (-not (Test-Path -LiteralPath $scriptPath)) {
	$alt = Join-Path $p.RepoRoot $Script
	if (Test-Path -LiteralPath $alt) { $scriptPath = $alt } else { Write-Host "ERROR: Python script not found: $Script" -ForegroundColor Red; exit $UnrealExit.Failed }
}
# Forward slashes: with arguments the pythonscript commandlet parses -script as a command line in which a backslash
# is an escape (verified #2243 phase B: C:\...\tools became C:\...<TAB>ools and the script failed to load).
$scriptPath = [System.IO.Path]::GetFullPath($scriptPath).Replace('\', '/')
$log = '<unreal/Lunden/Saved/Logs/run-python-TIME.log>'
$argsFor = { param($logPath)
	$inner = (@($scriptPath) + $ScriptArgs) -join ' '
	"$(ConvertTo-UnrealArg $p.UProject) -run=pythonscript -script=$(ConvertTo-UnrealArg $inner) -unattended -nullrhi -nosplash -nosound -nop4 -stdout -FullStdOutLogOutput -abslog=$(ConvertTo-UnrealArg $logPath)" }
$envr = Resolve-UnrealForRun $EngineDir 'run-python' { param($root) Format-UnrealCommand (Join-Path $root 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') (& $argsFor $log) }

$log = New-UnrealLogPath 'run-python'
$code = Invoke-UnrealProcess $envr.Engine.EditorCmd (& $argsFor $log)
# Verified on 5.8.4 (#2243): a raised exception or an unloadable script makes the commandlet exit -1, and any error in
# the final log summary makes it exit 1. The log is still checked so a swallowed Python error also fails.
$pyErrors = @()
if (Test-Path -LiteralPath $log) { $pyErrors = @(Select-String -LiteralPath $log -Pattern 'LogPython: Error:|Traceback \(most recent call last\)' | Select-Object -First 20) }
foreach ($e in $pyErrors) { Write-Host "PYTHON ERROR: $($e.Line)" -ForegroundColor Red }
Write-Host "UnrealEditor-Cmd exit code $code; python errors $($pyErrors.Count); log $log"
if ($code -ne 0 -or $pyErrors.Count) { exit $UnrealExit.Failed }
exit $UnrealExit.Ok
