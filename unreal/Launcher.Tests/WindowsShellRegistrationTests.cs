using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class WindowsShellRegistrationTests : IDisposable
{
    readonly string root = Directory.CreateTempSubdirectory("Lunden shell test ").FullName;
    readonly Dictionary<string, IReadOnlyDictionary<string, object>> registry = [];

    SetupLayout Layout(string channel) =>
        new(Path.Combine(root, "Local Data"), Path.Combine(root, "Fake Start Menu"), channel);

    WindowsShellRegistration Fixture(Action<string, SetupLayout>? writeLink = null) =>
        new((key, values) => registry[key] = values, key => registry.Remove(key),
            writeLink ?? ((path, layout) => File.WriteAllLines(path, [layout.Target, layout.LaunchArguments])));

    public void Dispose() => Directory.Delete(root, recursive: true);

    [Fact]
    public void RegisterAndRemoveChannelsIndependentlyWithQuotedUninstallCommands()
    {
        var shell = Fixture();
        var stable = Layout("stable");
        var test = Layout("test");
        shell.Unregister(stable); // Even before the Start menu exists.
        shell.Register(stable, "1.0.0");
        shell.Register(test, "1.0.1");
        shell.Register(test, "1.0.2");

        Assert.Equal(2, registry.Count);
        foreach (var layout in new[] { stable, test })
        {
            Assert.StartsWith(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\", layout.RegistryPath,
                StringComparison.OrdinalIgnoreCase);
            var values = registry[layout.RegistryPath];
            var args = layout.Channel == "test" ? " --channel test" : "";
            var uninstall = $"\"{layout.Target}\" --uninstall{args}";
            Assert.Equal(uninstall, values["UninstallString"]);
            Assert.Equal(uninstall + " --quiet", values["QuietUninstallString"]);
            Assert.Equal(layout.Channel == "test" ? "1.0.2" : "1.0.0", values["DisplayVersion"]);
            Assert.Equal(layout.DisplayName, values["DisplayName"]);
            Assert.Equal(layout.InstallDir, values["InstallLocation"]);
            Assert.Equal($"\"{layout.Target}\",0", values["DisplayIcon"]);
            Assert.Equal(1, values["NoRepair"]);
            Assert.Equal(1, values["NoModify"]);
            Assert.Equal([layout.Target, args.TrimStart()], File.ReadAllLines(layout.Shortcut));
        }
        shell.Unregister(test);
        shell.Unregister(test);
        Assert.False(File.Exists(test.Shortcut));
        Assert.True(File.Exists(stable.Shortcut));
        Assert.Equal(stable.RegistryPath, Assert.Single(registry).Key);
    }

    [Fact]
    public void InterruptedShortcutWriteKeepsPreviousLinkAndRegistration()
    {
        var layout = Layout("stable");
        Fixture().Register(layout, "1.0");
        string old = File.ReadAllText(layout.Shortcut);
        var failing = Fixture((temporary, _) =>
        {
            File.WriteAllText(temporary, "incomplete");
            throw new IOException("Simulated interrupted WriteShortcut");
        });
        Assert.Throws<IOException>(() => failing.Register(layout, "2.0"));
        Assert.Equal(old, File.ReadAllText(layout.Shortcut));
        Assert.Equal("1.0", registry[layout.RegistryPath]["DisplayVersion"]);
        Assert.Equal([layout.Shortcut], Directory.GetFiles(Path.GetDirectoryName(layout.Shortcut)!));
    }

    sealed class WindowsFactAttribute : FactAttribute
    {
        public WindowsFactAttribute()
        {
            if (!OperatingSystem.IsWindows()) Skip = "Requires Windows Script Host.";
        }
    }

    [WindowsFact]
    [SupportedOSPlatform("windows")]
    public void WindowsReadsTheRealShortcutFromTheIsolatedStartMenu()
    {
        var layout = Layout("test");
        Directory.CreateDirectory(layout.InstallDir);
        File.WriteAllBytes(layout.Target, []);
        Fixture(WindowsShellRegistration.WriteShortcut).Register(layout, "1.0");
        // Reopen the real shell link. Neither this directory nor the dictionary
        // registry is used by the machine's Start menu or Apps & features.
        object shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")!)!;
        object? link = null;
        try
        {
            link = ((dynamic)shell).CreateShortcut(layout.Shortcut);
            Assert.Equal(layout.Target, (string)((dynamic)link).TargetPath, ignoreCase: true);
            Assert.Equal(layout.InstallDir, (string)((dynamic)link).WorkingDirectory, ignoreCase: true);
            Assert.Equal("--channel test", (string)((dynamic)link).Arguments);
        }
        finally
        {
            if (link != null) Marshal.FinalReleaseComObject(link);
            Marshal.FinalReleaseComObject(shell);
        }
    }
}
