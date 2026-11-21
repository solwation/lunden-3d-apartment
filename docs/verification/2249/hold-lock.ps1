# Holds Lunden.exe open without FILE_SHARE_DELETE so the self-update swap (MoveFile over it) fails.
param([string]$Path, [int]$Seconds = 60)
$f = [IO.File]::Open($Path, 'Open', 'Read', 'Read')
"locked $Path at $((Get-Date).ToUniversalTime().ToString('HH:mm:ss'))"
Start-Sleep -Seconds $Seconds
$f.Dispose(); "released at $((Get-Date).ToUniversalTime().ToString('HH:mm:ss'))"
