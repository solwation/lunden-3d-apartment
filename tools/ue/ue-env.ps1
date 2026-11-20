<#
.SYNOPSIS
  Lunden (#2243): report the Unreal build environment and fail clearly when it is not usable.
.DESCRIPTION
  Finds Unreal Engine (parameter / LUNDEN_UE_ROOT, registry, Epic Games Launcher LauncherInstalled.dat, default
  C:\Program Files\Epic Games\UE_<association>), compares Engine\Build\Build.version with unreal/Lunden/ENGINE_VERSION,
  and checks Visual Studio (components of tools/ue/lunden-unreal.vsconfig), MSVC and the Windows SDK.
  Read-only. Exit codes: see ue-common.ps1 (0 ok, 2 engine missing, 3 wrong version, 4 toolchain, 5 project, 6 path).
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ue/ue-env.ps1
#>
[CmdletBinding()]
param([string]$EngineDir)
. (Join-Path $PSScriptRoot 'ue-common.ps1')

$envr = Test-UeEnvironment -EngineDir $EngineDir
Write-UeEnvironment $envr
if ($envr.Code -eq $UeExit.Ok) { Write-Host 'OK: the Unreal environment matches the project lock.' -ForegroundColor Green }
exit $envr.Code
