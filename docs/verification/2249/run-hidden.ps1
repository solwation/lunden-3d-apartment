# Runs a command line on a separate, never-shown desktop so neither the console nor the game window
# appears on the user's screen (#2249 upgrade test). Prints the exit code; optional kill after N seconds.
param([Parameter(Mandatory)][string]$CommandLine, [string]$Proxy = '', [int]$TimeoutSec = 900, [double]$KillAfterSec = 0, [string]$KillWhenFile = '', [int]$LingerSec = 0)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class HiddenDesk {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct SI { public int cb; public string r; public string desk; public string title; public int x,y,w,h,cx,cy,fill,flags; public short show, r2; public IntPtr r3, hin, hout, herr; }
  [StructLayout(LayoutKind.Sequential)] public struct PI { public IntPtr hp, ht; public int pid, tid; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateDesktop(string name, IntPtr d, IntPtr m, int f, uint access, IntPtr sa);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref SI si, out PI pi);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public static int Start(string cmd, string desk) {
    SI si = new SI(); si.cb = Marshal.SizeOf(typeof(SI)); si.desk = "WinSta0\\" + desk; PI pi;
    if (!CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0x08000000 /*CREATE_NO_WINDOW*/, IntPtr.Zero, null, ref si, out pi))
      throw new System.ComponentModel.Win32Exception();
    CloseHandle(pi.hp); CloseHandle(pi.ht); return pi.pid;
  }
}
'@
$desk = 'LundenUpgradeTest2249'
if ([HiddenDesk]::CreateDesktop($desk, [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero) -eq [IntPtr]::Zero) { throw 'CreateDesktop failed' }
if ($Proxy) { $env:HTTPS_PROXY = $Proxy; $env:HTTP_PROXY = $Proxy } else { Remove-Item Env:HTTPS_PROXY, Env:HTTP_PROXY -ErrorAction SilentlyContinue }
$procId = [HiddenDesk]::Start($CommandLine, $desk)
$p = Get-Process -Id $procId
"started pid=$procId at $((Get-Date).ToUniversalTime().ToString('HH:mm:ss.fff'))"
$sw = [Diagnostics.Stopwatch]::StartNew()
while (-not $p.HasExited -and $sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
  $kill = ($KillAfterSec -gt 0 -and $sw.Elapsed.TotalSeconds -ge $KillAfterSec) -or
          ($KillWhenFile -and (Get-ChildItem -Path $KillWhenFile -ErrorAction SilentlyContinue | Where-Object Length -gt 1MB))
  if ($kill) {
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$procId" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; "killed child pid=$($_.ProcessId) $($_.Name)" }
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; "killed pid=$procId after $([math]::Round($sw.Elapsed.TotalSeconds,1)) s"; break
  }
  Start-Sleep -Milliseconds 100
}
$p.WaitForExit(5000) | Out-Null
# Keep the hidden desktop alive for processes that outlive the command (e.g. the self-update helper's restart).
if ($LingerSec -gt 0) { Start-Sleep -Seconds $LingerSec }
"exit=$(if ($p.HasExited) { $p.ExitCode } else { 'running' }) after $([math]::Round($sw.Elapsed.TotalSeconds,1)) s"
