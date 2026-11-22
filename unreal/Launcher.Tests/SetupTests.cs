using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class SetupTests : IDisposable
{
    readonly string temp = Directory.CreateTempSubdirectory("lunden-setup-fixture-").FullName;
    readonly Dictionary<string, IReadOnlyDictionary<string, object>> registry = [];
    bool failRegister, failUnregister;
    SetupLayout Layout(string channel = "stable") => new(Path.Combine(temp, "local data"), Path.Combine(temp, "start menu"), channel);
    string Source => Path.Combine(temp, "Lunden-Setup-win-x64.exe");

    Setup Engine(SetupLayout layout)
    {
        var registration = new WindowsShellRegistration((path, values) => {
            registry[path] = values;
            if (failRegister) { failRegister = false; throw new IOException("Fake registry is full."); }
        }, path => {
            registry.Remove(path);
            if (failUnregister) { failUnregister = false; throw new IOException("Fake registry is in use."); }
        }, (path, shortcut) => File.WriteAllLines(path, [shortcut.Target, shortcut.LaunchArguments]));
        return new(layout, registration, path => {
            if (!File.ReadAllText(path).StartsWith("signed fixture", StringComparison.Ordinal))
                throw new InvalidDataException("Wrong fixture publisher.");
        });
    }

    static void Write(string path, string content) {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }
    public void Dispose() => Directory.Delete(temp, true);

    [Fact]
    public void InstallUpgradeAndUninstallKeepSeparateUserSavesAndChannel()
    {
        var stable = Layout();
        var test = Layout("test");
        var engine = Engine(stable);
        Write(Source, "signed fixture 1");
        engine.Install(Source, "1");
        Engine(test).Install(Source, "1");
        string content = Path.Combine(stable.InstallDir, "versions", "fixture", "game", "Content", "zone.utoc");
        string localSave = Path.Combine(stable.InstallDir, "versions", "fixture", "game", "Lunden", "Saved", "session.sav");
        string userSave = Path.Combine(stable.UserData, "SaveGames", "session.sav");
        Write(content, "zone");
        Write(localSave, "pilot local save");
        Write(userSave, "user save");
        Write(Source, "signed fixture 2");
        engine.Install(Source, "2");
        Assert.Equal("zone", File.ReadAllText(content));
        Assert.Equal("signed fixture 2", File.ReadAllText(stable.Target));
        Assert.Equal("2", registry[stable.RegistryPath]["DisplayVersion"]);

        engine.Uninstall(false);
        Assert.False(Directory.Exists(stable.InstallDir));
        Assert.False(File.Exists(stable.Shortcut));
        Assert.False(registry.ContainsKey(stable.RegistryPath));
        Assert.Equal("user save", File.ReadAllText(userSave));
        var recovered = Directory.GetFiles(Path.Combine(stable.UserData, "Recovered"), "session.sav", SearchOption.AllDirectories);
        Assert.Equal("pilot local save", File.ReadAllText(Assert.Single(recovered)));
        Assert.Equal("signed fixture 1", File.ReadAllText(test.Target));
        Assert.True(File.Exists(test.Shortcut));
    }

    [Fact]
    public void BetaInstallationsGetTheNewStartMenuNameOnce()
    {
        // #2415: launchers before 0.1.3 created "Lunden.lnk"; the next start renames it and the registry entry.
        foreach (string channel in new[] {"stable", "test"}) {
            var layout = Layout(channel);
            var setup = Engine(layout);
            Write(Source, "signed fixture 1");
            setup.Install(Source, "1");
            File.Move(layout.Shortcut, layout.LegacyShortcut);
            Assert.True(setup.RenameLegacyShortcut());
            Assert.True(File.Exists(layout.Shortcut));
            Assert.False(File.Exists(layout.LegacyShortcut));
            Assert.Equal(layout.DisplayName, registry[layout.RegistryPath]["DisplayName"]);
            Assert.False(setup.RenameLegacyShortcut());
        }
        Assert.Equal("Kv. Lunden Unreal L1007.lnk", Path.GetFileName(Layout().Shortcut));
        Assert.Equal("Kv. Lunden Unreal L1007 (test).lnk", Path.GetFileName(Layout("test").Shortcut));
        Assert.Equal(Path.Combine(temp, "local data", "Programs", "Lunden", "Lunden.exe"), Layout().Target);
    }

    [Fact]
    public void InstalledLauncherDoesNotCarryTheDownloadMark()
    {
        // #2418: Smart App Control blocked the installed copy because it kept the setup's Zone.Identifier stream.
        if (!OperatingSystem.IsWindows()) return;
        var layout = Layout();
        var setup = Engine(layout);
        foreach (string version in new[] {"1", "2"}) {
            Write(Source, "signed fixture " + version);
            File.WriteAllText(Source + ":Zone.Identifier", "[ZoneTransfer]\r\nZoneId=3\r\n");
            if (version == "2") File.WriteAllText(layout.Target + ":Zone.Identifier", "[ZoneTransfer]\r\nZoneId=3\r\n");
            setup.Install(Source, version);
            Assert.Equal("signed fixture " + version, File.ReadAllText(layout.Target));
            Assert.False(File.Exists(layout.Target + ":Zone.Identifier"));
        }
    }

    [Fact]
    public void BothSetupFileNamesSelectInstallation()
    {
        Assert.NotNull(SetupCommand.Parse([], Path.Combine(temp, "Kv-Lunden-Unreal-L1007-Setup-0.1.3-win-x64.exe")));
        Assert.NotNull(SetupCommand.Parse([], Path.Combine(temp, "Lunden-Setup-0.1.1-win-x64.exe")));
        Assert.Null(SetupCommand.Parse([], Path.Combine(temp, "Lunden.exe")));
    }

    [Fact]
    public void FailuresRestoreExistingLauncherShortcutAndRegistryAndCanRetry()
    {
        var layout = Layout();
        var setup = Engine(layout);
        Write(Source, "signed fixture 1");
        failRegister = true;
        Assert.Throws<IOException>(() => setup.Install(Source, "1"));
        Assert.False(Directory.Exists(layout.InstallDir));
        Assert.Empty(registry);
        setup.Install(Source, "1");
        Write(Source, "signed fixture 2");
        failRegister = true;
        Assert.Throws<IOException>(() => setup.Install(Source, "2"));
        Assert.Equal("signed fixture 1", File.ReadAllText(layout.Target));
        Assert.Equal("1", registry[layout.RegistryPath]["DisplayVersion"]);
        Write(Source, "unsigned");
        Assert.Throws<InvalidDataException>(() => setup.Install(Source, "3"));
        string content = Path.Combine(layout.InstallDir, "versions", "active", "game", "zone.utoc");
        Write(content, "existing package");
        failUnregister = true;
        Assert.Throws<IOException>(() => setup.Uninstall(false));
        Assert.Equal("existing package", File.ReadAllText(content));
        Assert.Equal("signed fixture 1", File.ReadAllText(layout.Target));
        Assert.True(File.Exists(layout.Shortcut));
        Assert.True(registry.ContainsKey(layout.RegistryPath));
        setup.Uninstall(false);
        Assert.False(Directory.Exists(layout.InstallDir));
    }

    [Fact]
    public void PendingUninstallCannotDeleteUserDataOrRemoveReinstalledVersion()
    {
        var layout = Layout();
        var setup = Engine(layout);
        Write(Source, "signed fixture");
        setup.Install(Source, "1");
        string save = Path.Combine(layout.UserData, "old.sav");
        Write(save, "saved");
        string id = Guid.NewGuid().ToString("N");
        setup.PrepareUninstall(id, false);
        Assert.Throws<InvalidOperationException>(() => setup.Uninstall(true, id));
        setup.Install(Source, "2");
        Assert.Throws<InvalidOperationException>(() => setup.Uninstall(false, id));
        Assert.True(File.Exists(layout.Target));
        Assert.Equal("saved", File.ReadAllText(save));
        setup.PrepareUninstall(id, true);
        setup.Uninstall(true, id);
        Assert.False(Directory.Exists(layout.UserData));
    }

    [Fact]
    public void UnownedDirectoryAndConcurrentUpdateArePreserved()
    {
        var layout = Layout();
        var setup = Engine(layout);
        Write(Source, "signed fixture");
        string unrelated = Path.Combine(layout.InstallDir, "my-file");
        Write(unrelated, "mine");
        Assert.Throws<IOException>(() => setup.Install(Source, "1"));
        Assert.Equal([unrelated], Directory.GetFiles(layout.InstallDir));
        Assert.Throws<InvalidOperationException>(() => setup.Uninstall(true));
        Assert.Equal([unrelated], Directory.GetFiles(layout.InstallDir));
        Assert.Equal("mine", File.ReadAllText(unrelated));
        File.Delete(unrelated);
        setup.Install(Source, "1");
        using var lockHeld = setup.LockUpdates();
        Assert.Throws<IOException>(() => setup.Uninstall(false));
        Assert.True(File.Exists(layout.Target));
    }

    [Fact]
    public void SetupFilenameAndSwitchesSelectTheRightModeWithoutWritingDuringPreview()
    {
        var command = SetupCommand.Parse(["--dry-run-install", "--quiet", "--channel", "test"], Source)!;
        Assert.True(command.DryRun);
        Assert.True(command.Quiet);
        Assert.False(command.Uninstall);
        Assert.Equal("test", command.Channel);
        Assert.Null(SetupCommand.Parse(["--offline"], "Lunden.exe"));
        Assert.True(SetupCommand.Parse(["--uninstall"], Source)!.Uninstall);
        Assert.Throws<ArgumentException>(() => SetupCommand.Parse(["--channel", "other"], Source));
        Assert.Throws<ArgumentException>(() => SetupCommand.Parse(["--install", "--uninstall"], Source));
        var layout = Layout("test");
        Assert.Contains(layout.Target, Setup.Describe(layout, false));
        Assert.Contains(layout.UserData, Setup.Describe(layout, true));
        Assert.Empty(Directory.EnumerateFileSystemEntries(temp));
    }
}
