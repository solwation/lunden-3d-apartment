# #2420: the launcher is a GUI-subsystem program whose setup, progress and error dialogs open without a console.
# Runs on a Windows desktop session (the launcher-tests workflow). Builds an unsigned launcher with a throwaway manifest
# key, opens each dialog the way Explorer would (no redirected output), screenshots it with PrintWindow and closes it.
# Usage: ./tools/unreal-engine/tests/launcher-dialogs.ps1 -Out <screenshot directory>
param([Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$work = Join-Path ([IO.Path]::GetTempPath()) ('lunden-dialogs-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work, $Out | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<IntPtr> Of(int pid) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static string Text(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
  public static string Class(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
}
'@

function Require($ok, $message) { if (-not $ok) { throw $message } }
function Wait-Dialog($process, [int]$count = 1, [int]$seconds = 30) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $seconds) {
        $windows = @([Win]::Of($process.Id) | Where-Object { [Win]::Class($_) -eq '#32770' })
        if ($windows.Count -ge $count) { Start-Sleep -Milliseconds 700; return $windows }
        if ($process.HasExited) { throw "The launcher exited ($($process.ExitCode)) before showing a dialog." }
        Start-Sleep -Milliseconds 200
    }
    throw 'No task dialog appeared.'
}
function Save-Window($hwnd, $name) {
    $r = New-Object Win+RECT; [void][Win]::GetWindowRect($hwnd, [ref]$r)
    $bmp = New-Object Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
    $g = [Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
    [void][Win]::PrintWindow($hwnd, $dc, 2); $g.ReleaseHdc($dc); $g.Dispose()
    $bmp.Save((Join-Path $Out $name), [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}
function Close-Window($hwnd) { [void][Win]::PostMessage($hwnd, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) } # WM_CLOSE

try {
    $key = Join-Path $work 'manifest-public.pem'
    node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'P-256'});process.stdout.write(k.publicKey.export({type:'spki',format:'pem'}))" | Set-Content -NoNewline -Encoding ascii $key
    dotnet publish (Join-Path $root 'unreal\Launcher') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true `
        -p:LundenManifestKey=$key -o (Join-Path $work 'bin') | Out-Null
    Require ($LASTEXITCODE -eq 0) 'dotnet publish failed.'
    $exe = Join-Path $work 'bin\Lunden.exe'

    # A GUI-subsystem image (IMAGE_SUBSYSTEM_WINDOWS_GUI = 2) never gets a console window from Explorer.
    $bytes = [IO.File]::ReadAllBytes($exe); $pe = [BitConverter]::ToInt32($bytes, 0x3C)
    Require ([BitConverter]::ToUInt16($bytes, $pe + 24 + 68) -eq 2) 'Lunden.exe is not a Windows (GUI) program.'

    # 1. The setup asks in a dialog; closing it installs nothing.
    $setup = Join-Path $work 'Kv-Lunden-Unreal-L1007-Setup-0.0.0-win-x64.exe'
    Copy-Item $exe $setup
    $p = Start-Process -FilePath $setup -ArgumentList '--channel', 'test' -PassThru
    $dialog = (Wait-Dialog $p)[0]
    Require ([Win]::Text($dialog) -eq 'Kv. Lunden Unreal L1007') "Unexpected setup title: $([Win]::Text($dialog))"
    Save-Window $dialog 'setup.png'
    Close-Window $dialog
    Require ($p.WaitForExit(15000)) 'The setup did not exit after Cancel.'
    Require (-not (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\Lunden-Test\Lunden.exe'))) 'Cancel installed the launcher.'

    # 2. Progress while the update check waits on a server that never answers, then the error with "Försök igen".
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $p = Start-Process -FilePath $exe -ArgumentList '--channel', 'test', '--manifest', "http://127.0.0.1:$port/lunden-manifest-test.json" -PassThru
    $progress = (Wait-Dialog $p)[0]
    Require ([Win]::Text($progress) -eq 'Kv. Lunden Unreal L1007') 'Unexpected progress title.'
    Save-Window $progress 'progress.png'
    $listener.Stop() # refuse the pending request: the launcher reports the failed update
    $windows = Wait-Dialog $p 2 60
    $failure = $windows | Where-Object { $_ -ne $progress } | Select-Object -First 1
    Save-Window $failure 'update-error.png'
    Close-Window $failure
    Require ($p.WaitForExit(15000)) 'The launcher did not exit after closing the error.'
    Require ($p.ExitCode -eq 1) "Expected exit 1 without an installed version, got $($p.ExitCode)."
    Write-Host "Dialogs verified: setup, progress and update error ($Out)."
}
finally {
    Get-Process -Name 'Lunden', 'Kv-Lunden-Unreal-L1007-Setup-0.0.0-win-x64' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -like "$work*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
