<#
.SYNOPSIS
  Lunden (#2243): report the Unreal build environment and fail clearly when it is not usable.
.DESCRIPTION
  Finds Unreal Engine (parameter / LUNDEN_UNREAL_ENGINE_ROOT, registry, Epic Games Launcher LauncherInstalled.dat, default
  C:\Program Files\Epic Games\UE_<association>), compares Engine\Build\Build.version with unreal/Lunden/ENGINE_VERSION,
  and checks Visual Studio (components of tools/unreal-engine/lunden-unreal.vsconfig), MSVC and the Windows SDK.
  Read-only. Exit codes: see common.ps1 (0 ok, 2 engine missing, 3 wrong version, 4 toolchain, 5 project, 6 path).
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/check-environment.ps1
#>
[CmdletBinding()]
param([string]$EngineDir)
. (Join-Path $PSScriptRoot 'common.ps1')

$envr = Test-UnrealEnvironment -EngineDir $EngineDir
Write-UnrealEnvironment $envr
if ($envr.Code -eq $UnrealExit.Ok) { Write-Host 'OK: the Unreal environment matches the project lock.' -ForegroundColor Green }
exit $envr.Code
