$ErrorActionPreference = 'Stop'
$uat = 'C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\RunUAT.bat'
$args2 = @('BuildCookRun', '-project=C:\Users\Olof\Documents\lunden-ue-wt\opus-2288\unreal\Lunden\Lunden.uproject', '-platform=Win64', '-clientconfig=Shipping',
  '-nocompileuat', '-nocompile', '-skipbuild', '-cook', '-stage', '-pak', '-iostore', '-package', '-nodebuginfo', '-nobootstrapexe', '-archive',
  '-map=/Game/Lunden/Save/_PackTest/L_SaveTest',
  '-stagingdirectory=C:\LundenBuilds\opus-2288\stage', '-archivedirectory=C:\LundenBuilds\opus-2288\archive', '-unattended', '-nop4', '-utf8output')
$sw = [Diagnostics.Stopwatch]::StartNew()
& $uat @args2 2>&1 | Out-File -LiteralPath 'C:\LundenBuilds\opus-2288\BuildCookRun.log' -Encoding utf8
"exit=$LASTEXITCODE secs=$([math]::Round($sw.Elapsed.TotalSeconds))"
