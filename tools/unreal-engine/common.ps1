# Lunden Unreal tooling (#2243): shared functions, dot-sourced by the tools/unreal-engine/*.ps1 scripts.
# Windows PowerShell 5.1+ (powershell.exe) or PowerShell 7 (pwsh). Nothing here installs, deletes or changes
# anything outside unreal/Lunden/Saved (logs and reports).
#
# Exit codes used by all scripts (docs/development/unreal.md "Scripts"):
#   0 ok | 1 command failed | 2 engine not found | 3 wrong engine version | 4 toolchain (VS/MSVC/SDK) missing
#   5 project files invalid | 6 project on an unsupported path (WSL/UNC)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:UnrealExit = @{ Ok = 0; Failed = 1; EngineMissing = 2; EngineVersion = 3; Toolchain = 4; Project = 5; Path = 6 }

# Minimums from Epic's UE 5.8 requirements (docs/development/unreal.md "Requirements").
$script:UnrealMinVsVersion = [version]'17.14'     # VS 2022 17.14+, or VS 2026 (18.x)
$script:UnrealMinMsvc = [version]'14.38'          # recommended 14.50
$script:UnrealMinWindowsSdk = [version]'10.0.22621.0'
$script:UnrealVsInstallHint = 'Install Visual Studio 2022 Community with: vs_community.exe --config tools\unreal-engine\lunden-unreal.vsconfig (bootstrapper https://aka.ms/vs/17/release/vs_community.exe), or add the components to an existing install via the Visual Studio Installer (More > Import configuration).'

function Get-LundenRepoRoot {
	[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
}

function Get-LundenProject {
	<# The .uproject, its EngineAssociation and the exact locked version from unreal/Lunden/ENGINE_VERSION. #>
	$root = Get-LundenRepoRoot
	$dir = Join-Path $root 'unreal\Lunden'
	$uproject = Join-Path $dir 'Lunden.uproject'
	$versionFile = Join-Path $dir 'ENGINE_VERSION'
	$problems = @()
	$association = $null
	$locked = $null
	if (-not (Test-Path -LiteralPath $uproject)) { $problems += "missing $uproject" }
	else {
		try { $association = (Get-Content -LiteralPath $uproject -Raw | ConvertFrom-Json).EngineAssociation }
		catch { $problems += "Lunden.uproject is not valid JSON: $($_.Exception.Message)" }
	}
	if (-not (Test-Path -LiteralPath $versionFile)) { $problems += "missing $versionFile" }
	else { $locked = (Get-Content -LiteralPath $versionFile -Raw).Trim() }
	if ($locked -and $locked -notmatch '^\d+\.\d+\.\d+$') { $problems += "ENGINE_VERSION '$locked' is not MAJOR.MINOR.PATCH" }
	if ($locked -and $association -and -not $locked.StartsWith("$association.")) {
		$problems += "ENGINE_VERSION $locked does not match EngineAssociation $association in Lunden.uproject"
	}
	[pscustomobject]@{
		RepoRoot = $root; Dir = $dir; UProject = $uproject; Association = $association; LockedVersion = $locked
		Problems = $problems; IsUncPath = $root.StartsWith('\\')
	}
}

function Get-UnrealBuildVersion([string]$EngineRoot) {
	$f = Join-Path $EngineRoot 'Engine\Build\Build.version'
	if (-not (Test-Path -LiteralPath $f)) { return $null }
	$j = Get-Content -LiteralPath $f -Raw | ConvertFrom-Json
	[pscustomobject]@{ Version = "$($j.MajorVersion).$($j.MinorVersion).$($j.PatchVersion)"; Changelist = $j.Changelist; Branch = $j.BranchName }
}

function Find-UnrealEngine([string]$Association, [string]$Override) {
	<# Candidate engine roots in priority order; the first one with Engine\Build\Build.version wins. #>
	$candidates = New-Object System.Collections.ArrayList
	if ($Override) { [void]$candidates.Add([pscustomobject]@{ Root = $Override; Source = 'parameter/LUNDEN_UNREAL_ENGINE_ROOT' }) }
	foreach ($key in @("HKLM:\SOFTWARE\EpicGames\Unreal Engine\$Association", "HKLM:\SOFTWARE\WOW6432Node\EpicGames\Unreal Engine\$Association")) {
		$v = Get-ItemProperty -LiteralPath $key -Name InstalledDirectory -ErrorAction SilentlyContinue
		if ($v) { [void]$candidates.Add([pscustomobject]@{ Root = $v.InstalledDirectory; Source = "registry $key" }) }
	}
	$dat = Join-Path $env:ProgramData 'Epic\UnrealEngineLauncher\LauncherInstalled.dat'
	if (Test-Path -LiteralPath $dat) {
		try {
			foreach ($i in (Get-Content -LiteralPath $dat -Raw | ConvertFrom-Json).InstallationList) {
				if ($i.AppName -eq "UE_$Association") { [void]$candidates.Add([pscustomobject]@{ Root = $i.InstallLocation; Source = 'Epic Games Launcher (LauncherInstalled.dat)' }) }
			}
		} catch { }
	}
	[void]$candidates.Add([pscustomobject]@{ Root = (Join-Path $env:ProgramFiles "Epic Games\UE_$Association"); Source = 'default Launcher path' })
	foreach ($c in $candidates) {
		if (-not $c.Root) { continue }
		$bv = Get-UnrealBuildVersion $c.Root
		if ($bv) {
			return [pscustomobject]@{
				Root = $c.Root; Source = $c.Source; Version = $bv.Version; Changelist = $bv.Changelist
				EditorCmd = Join-Path $c.Root 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
				BuildBat = Join-Path $c.Root 'Engine\Build\BatchFiles\Build.bat'
				RunUAT = Join-Path $c.Root 'Engine\Build\BatchFiles\RunUAT.bat'
				Searched = $candidates
			}
		}
	}
	[pscustomobject]@{ Root = $null; Searched = $candidates }
}

function Get-LundenVsConfigComponents {
	$f = Join-Path $PSScriptRoot 'lunden-unreal.vsconfig'
	if (-not (Test-Path -LiteralPath $f)) { return @() }
	@((Get-Content -LiteralPath $f -Raw | ConvertFrom-Json).components)
}

function Find-VisualStudio {
	<# Every VS 2022/2026 instance with its MSVC toolsets and which tools/unreal-engine/lunden-unreal.vsconfig components it has. #>
	$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
	if (-not (Test-Path -LiteralPath $vswhere)) { return @() }
	$json = & $vswhere -products * -all -prerelease -include packages -format json | Out-String
	# Windows PowerShell 5.1 emits a JSON array as ONE pipeline object, so @(... | ConvertFrom-Json) would wrap the whole
	# array as a single element once two VS instances exist (e.g. Build Tools + Community); assign first, then unroll
	$parsed = $json | ConvertFrom-Json
	$instances = @($parsed)
	$wanted = Get-LundenVsConfigComponents
	foreach ($i in $instances) {
		if (-not $i.installationPath) { continue }
		$ids = @($i.packages | Where-Object { $_.type -in @('Workload', 'Component') } | ForEach-Object { $_.id })
		$msvcDir = Join-Path $i.installationPath 'VC\Tools\MSVC'
		$msvc = @()
		if (Test-Path -LiteralPath $msvcDir) {
			$msvc = @(Get-ChildItem -LiteralPath $msvcDir -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } | ForEach-Object { [version]$_.Name } | Sort-Object -Descending)
		}
		[pscustomobject]@{
			Name = $i.displayName; Version = [version]$i.installationVersion; Path = $i.installationPath
			# Unreal-specific VS components (IDE integration) are optional and never checked.
			Msvc = $msvc; Components = $ids; MissingComponents = @($wanted | Where-Object { $_ -notmatch 'Unreal' -and $ids -notcontains $_ })
			IsBuildTools = $i.productId -eq 'Microsoft.VisualStudio.Product.BuildTools'
		}
	}
}

function Find-WindowsSdk {
	$roots = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -Name KitsRoot10 -ErrorAction SilentlyContinue
	if (-not $roots) { return @() }
	$inc = Join-Path $roots.KitsRoot10 'Include'
	if (-not (Test-Path -LiteralPath $inc)) { return @() }
	@(Get-ChildItem -LiteralPath $inc -Directory | Where-Object { $_.Name -match '^10\.\d+\.\d+\.\d+$' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'um\windows.h')) } |
		ForEach-Object { [version]$_.Name } | Sort-Object -Descending)
}

function Test-UnrealEnvironment([string]$EngineDir, [switch]$SkipToolchain) {
	<# Collects everything and returns @{ Code; Errors; Warnings; Info; Project; Engine }. Never throws for a missing tool. #>
	$errors = New-Object System.Collections.ArrayList
	$warnings = New-Object System.Collections.ArrayList
	$info = New-Object System.Collections.ArrayList
	$code = $UnrealExit.Ok
	$project = Get-LundenProject
	[void]$info.Add("Project:        $($project.UProject)")
	[void]$info.Add("Locked engine:  $($project.LockedVersion) (EngineAssociation $($project.Association))")
	foreach ($p in $project.Problems) { [void]$errors.Add($p); $code = $UnrealExit.Project }
	if ($project.IsUncPath) {
		[void]$warnings.Add("The checkout is on a WSL/UNC path ($($project.RepoRoot)). Unreal builds and the editor must run from a Windows-drive checkout (e.g. C:\Users\...\lunden-3d-apartment); see docs/development/unreal.md 'Where the Unreal checkout lives'.")
	}

	if (-not $EngineDir) { $EngineDir = $env:LUNDEN_UNREAL_ENGINE_ROOT }
	$assoc = if ($project.Association) { $project.Association } else { '5.8' }
	$engine = Find-UnrealEngine $assoc $EngineDir
	if (-not $engine.Root) {
		[void]$errors.Add("Unreal Engine $assoc was not found. Install it with the Epic Games Launcher (Unreal Engine > Library > + > $assoc, default C:\Program Files\Epic Games\UE_$assoc), or pass -EngineDir / set LUNDEN_UNREAL_ENGINE_ROOT to an engine root that contains Engine\Build\Build.version.")
		foreach ($c in $engine.Searched) { [void]$info.Add("  searched: $($c.Root)  [$($c.Source)]") }
		if ($code -eq $UnrealExit.Ok) { $code = $UnrealExit.EngineMissing }
	} else {
		[void]$info.Add("Engine:         $($engine.Root)  [$($engine.Source)]  version $($engine.Version) CL $($engine.Changelist)")
		if ($project.LockedVersion -and $engine.Version -ne $project.LockedVersion) {
			[void]$errors.Add("Wrong engine version: found $($engine.Version) at $($engine.Root), the project is locked to $($project.LockedVersion) (unreal/Lunden/ENGINE_VERSION). Install that hotfix in the Epic Games Launcher (and turn off auto-update for it), or upgrade the lock deliberately in its own issue.")
			if ($code -eq $UnrealExit.Ok) { $code = $UnrealExit.EngineVersion }
		}
		if (-not (Test-Path -LiteralPath $engine.EditorCmd)) { [void]$errors.Add("Missing $($engine.EditorCmd) (incomplete engine install?)"); if ($code -eq $UnrealExit.Ok) { $code = $UnrealExit.EngineMissing } }
	}

	if (-not $SkipToolchain) {
		$vs = @(Find-VisualStudio)
		$okVs = @($vs | Where-Object { $_.Version -ge $UnrealMinVsVersion -and @($_.Msvc | Where-Object { $_ -ge $UnrealMinMsvc }).Count -gt 0 })
		foreach ($v in $vs) {
			$m = if ($v.Msvc.Count) { ($v.Msvc | ForEach-Object { $_.ToString() }) -join ', ' } else { 'none' }
			[void]$info.Add("Visual Studio:  $($v.Name) $($v.Version)  MSVC $m  at $($v.Path)")
			if ($v.MissingComponents.Count) {
				[void]$info.Add("  missing from tools/unreal-engine/lunden-unreal.vsconfig: $($v.MissingComponents -join ', ')")
			}
		}
		if (-not $okVs.Count) {
			[void]$errors.Add("No Visual Studio 2022 17.14+ / 2026 with MSVC v143 $UnrealMinMsvc+ found. $UnrealVsInstallHint")
			if ($code -eq $UnrealExit.Ok) { $code = $UnrealExit.Toolchain }
		}
		# .NET Framework 4.6.2 targeting pack (some engine C# tools); the component, or its reference assemblies.
		$refAsm = Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies\Microsoft\Framework\.NETFramework\v4.6.2'
		if (-not (@($vs | Where-Object { $_.Components -contains 'Microsoft.Net.Component.4.6.2.TargetingPack' }).Count -or (Test-Path -LiteralPath $refAsm))) {
			[void]$errors.Add(".NET Framework 4.6.2 targeting pack not found (Microsoft.Net.Component.4.6.2.TargetingPack). $UnrealVsInstallHint")
			if ($code -eq $UnrealExit.Ok) { $code = $UnrealExit.Toolchain }
		}
		$sdk = @(Find-WindowsSdk)
		if ($sdk.Count) { [void]$info.Add("Windows SDK:    $(($sdk | ForEach-Object { $_.ToString() }) -join ', ')") }
		if (-not @($sdk | Where-Object { $_ -ge $UnrealMinWindowsSdk }).Count) {
			[void]$errors.Add("No Windows SDK $UnrealMinWindowsSdk+ found (the vsconfig installs Windows11SDK.22621).")
			if ($code -eq $UnrealExit.Ok) { $code = $UnrealExit.Toolchain }
		}
		# UnrealBuildTool runs on the .NET SDK bundled with the engine; a system .NET is informational only.
		$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
		if ($dotnet) { [void]$info.Add(".NET SDKs:      $((& dotnet --list-sdks 2>$null | ForEach-Object { ($_ -split ' ')[0] }) -join ', ')") }
	}
	[pscustomobject]@{ Code = $code; Errors = $errors; Warnings = $warnings; Info = $info; Project = $project; Engine = $engine }
}

function Write-UnrealEnvironment($Report) {
	foreach ($l in $Report.Info) { Write-Host $l }
	foreach ($w in $Report.Warnings) { Write-Host "WARNING: $w" -ForegroundColor Yellow }
	foreach ($e in $Report.Errors) { Write-Host "ERROR: $e" -ForegroundColor Red }
}

function ConvertTo-UnrealArg([string]$Value) {
	<# Unreal parses its raw command line itself (-Key="value with spaces"), so arguments are built as one string. #>
	if ($Value -match '[\s;]') { '"' + $Value + '"' } else { $Value }
}

function Format-UnrealCommand([string]$Exe, [string]$ArgLine) {
	'"' + $Exe + '" ' + $ArgLine
}

function Invoke-UnrealProcess([string]$Exe, [string]$ArgLine) {
	<# Runs the engine tool in this console, waits, and returns its exit code. #>
	Write-Host ('> ' + (Format-UnrealCommand $Exe $ArgLine))
	$proc = Start-Process -FilePath $Exe -ArgumentList $ArgLine -NoNewWindow -Wait -PassThru
	$proc.ExitCode
}

function New-UnrealLogPath([string]$Name) {
	$p = Get-LundenProject
	$dir = Join-Path $p.Dir 'Saved\Logs'
	New-Item -ItemType Directory -Force -Path $dir | Out-Null
	Join-Path $dir ("{0}-{1}.log" -f $Name, (Get-Date -Format 'yyyyMMdd-HHmmss'))
}

function Resolve-UnrealForRun([string]$EngineDir, [string]$What, [scriptblock]$Describe) {
	<# Checks the environment for a script that runs the engine. On failure prints the problems and what it WOULD run
	   (via $Describe, given a placeholder engine root) and exits with the matching code. Returns the environment. #>
	$envr = Test-UnrealEnvironment -EngineDir $EngineDir
	if ($envr.Project.IsUncPath -and $envr.Code -eq $UnrealExit.Ok) {
		[void]$envr.Errors.Add("Refusing to run $What on a WSL/UNC checkout ($($envr.Project.RepoRoot)); use the Windows-drive checkout.")
		$envr.Code = $UnrealExit.Path
	}
	if ($envr.Code -ne $UnrealExit.Ok) {
		Write-UnrealEnvironment $envr
		$root = if ($envr.Engine.Root) { $envr.Engine.Root } else { "<UE_$($envr.Project.Association) root>" }
		Write-Host ''
		Write-Host "Nothing was run. With a valid environment ${What} would run:" -ForegroundColor Yellow
		Write-Host ('  ' + (& $Describe $root))
		exit $envr.Code
	}
	$envr
}
