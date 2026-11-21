using System.Diagnostics;
using System.Text.Json;

namespace Lunden.Launcher.Tests;

// The opt-in physical Windows test uses the engine installed on the build PC, with an isolated
// checkout, user data, and the same null-renderer automation flags as the normal run-tests script.
internal sealed class LiveNetworkEditor : IDisposable
{
    readonly Process editor;
    readonly string report;
    readonly string staged;
    readonly bool ownsScript;

    internal LiveNetworkEditor(string executable, string root, string userDir, PlayerBridge bridge)
    {
        if (!OperatingSystem.IsWindows() || Path.GetFileName(executable) != "UnrealEditor-Cmd.exe" || !File.Exists(executable))
            throw new ArgumentException("LUNDEN_TEST_UE_EDITOR must be the installed Windows UnrealEditor-Cmd.exe.");
        string project = Path.Combine(root, "unreal", "Lunden");
        staged = Path.Combine(project, "Content", "Python", "test_network_live.py");
        string source = Path.Combine(root, "tools", "unreal-engine", "tests", "test_network_live.py");
        if (File.Exists(staged)) {
            if (!File.ReadAllBytes(source).SequenceEqual(File.ReadAllBytes(staged)))
                throw new IOException("A different test_network_live.py is already staged in the checkout.");
        } else {
            File.Copy(source, staged);
            ownsScript = true;
        }
        try {
            report = Path.Combine(userDir, "Automation");
            Directory.CreateDirectory(report);
            var info = new ProcessStartInfo(executable) {
                UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = root
            };
            info.Environment["LUNDEN_NETWORK_LIVE_DIR"] = bridge.DirectoryPath;
            foreach (string arg in new[] {
                Path.Combine(project,"Lunden.uproject"), "-EnablePlugins=PythonAutomationTest",
                "-ExecCmds=Automation RunTests Editor.Python.Lunden.test_network_live; Quit", "-TestExit=Automation Test Queue Empty",
                "-ReportExportPath="+report, "-abslog="+Path.Combine(userDir,"network-live.log"), "-UserDir="+userDir,
                "-unattended", "-nullrhi", "-nosplash", "-nosound", "-nop4", bridge.GameArgument
            }) info.ArgumentList.Add(arg);
            editor = Process.Start(info) ?? throw new IOException("Could not start headless Unreal.");
        } catch {
            if (ownsScript) File.Delete(staged);
            throw;
        }
    }

    internal async Task Ready(string folder, CancellationToken ct)
    {
        while (!File.Exists(Path.Combine(folder,"live-ready"))) {
            if (editor.HasExited) throw new InvalidOperationException("The editor exited before the network component was ready.");
            await Task.Delay(200,ct);
        }
    }

    internal async Task Verify(CancellationToken ct)
    {
        await editor.WaitForExitAsync(ct);
        using var summary = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(report,"index.json"),ct));
        var result = summary.RootElement;
        if (editor.ExitCode != 0 || result.GetProperty("failed").GetInt32() != 0 || result.GetProperty("notRun").GetInt32() != 0 ||
            result.GetProperty("succeeded").GetInt32() + result.GetProperty("succeededWithWarnings").GetInt32() < 1)
            throw new InvalidOperationException("The headless three-client PIE automation did not pass.");
    }

    public void Dispose()
    {
        try {
            if (!editor.HasExited) { editor.Kill(entireProcessTree: true); editor.WaitForExit(); }
        } finally {
            editor.Dispose();
            if (ownsScript) File.Delete(staged);
        }
    }
}
