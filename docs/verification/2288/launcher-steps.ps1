# #2288 update-survival check on the TEST channel only (never the stable install). Every start runs on a hidden desktop.
param([Parameter(Mandatory)][ValidateSet('install','first','update','uninstall','games','hash','cleanup')][string]$Step, [string]$Save = '')
$ErrorActionPreference = 'Stop'
$B = 'C:\LundenBuilds\opus-2288'
$hidden = "$B\run-hidden.ps1"
$setup = "$B\dl\Lunden-Setup-0.1.1-win-x64.exe"
$exe = "$env:LOCALAPPDATA\Programs\Lunden-Test\Lunden.exe"
$user = "$env:LOCALAPPDATA\Lunden-Test"
$n1 = 'https://github.com/solwation/lunden-3d-apartment/releases/download/app-v0.1.2/lunden-manifest-test.json'
function Stop-Games {
  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$env:LOCALAPPDATA\Programs\Lunden-Test\*" } | ForEach-Object {
    "game pid=$($_.ProcessId) $($_.Name) $($_.ExecutablePath)"; Stop-Process -Id $_.ProcessId -Force }
}
function Show-State { $s = "$env:LOCALAPPDATA\Programs\Lunden-Test\state.json"; if (Test-Path $s) { "state.json: $(Get-Content -Raw $s)" } else { 'state.json: none' } }
switch ($Step) {
  'install'   { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hidden -CommandLine "`"$setup`" --install --quiet --channel test" -TimeoutSec 300 }
  'first'     { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hidden -CommandLine "`"$exe`" --channel test" -TimeoutSec 900 -LingerSec 12; Show-State; Stop-Games }
  'update'    { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hidden -CommandLine "cmd.exe /c `"`"$exe`" --channel test --manifest $n1 > `"$B\update-out.txt`" 2>&1`"" -TimeoutSec 900 -LingerSec 12; Get-Content "$B\update-out.txt"; Show-State; Stop-Games }
  'uninstall' { Stop-Games; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hidden -CommandLine "`"$setup`" --uninstall --quiet --channel test" -TimeoutSec 300
                "program dir exists: $(Test-Path "$env:LOCALAPPDATA\Programs\Lunden-Test")"
                "HKCU entry exists: $(Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Lunden-Test')" }
  'games'     { Stop-Games }
  'hash'      { if (Test-Path $user) { Get-ChildItem -Recurse -File $user | Where-Object { $_.FullName -notmatch '\\Logs\\|CrashReportClient' } | ForEach-Object { "$((Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower())  $($_.FullName.Substring($user.Length))" } } else { "no $user" } }
  'cleanup'   { Stop-Games; if (Test-Path $user) { Remove-Item -Recurse -Force $user; "removed $user" } }
}
