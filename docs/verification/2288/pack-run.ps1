param([double]$Seconds = 15)
$B = 'C:\LundenBuilds\opus-2288'
$game = "$B\archive\Windows\Engine\Binaries\Win64\UnrealGame-Win64-Shipping.exe"
$cmd = "`"$game`" ..\..\..\Lunden\Lunden.uproject /Game/Lunden/Save/_PackTest/L_SaveTest -UserDir=$B\userdir -nullrhi -nosound -unattended"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$B\run-hidden.ps1" -CommandLine $cmd -KillAfterSec $Seconds -TimeoutSec 120
Get-ChildItem -Recurse -File "$B\userdir" | Where-Object { $_.FullName -notmatch '\\Logs\\|CrashReportClient' } | ForEach-Object { "$((Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()) $($_.Length) $($_.FullName.Substring($B.Length))" }
"save files under the archive: $(@(Get-ChildItem -Recurse -File "$B\archive" -Filter *.sav).Count)"
