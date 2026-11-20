using System.Diagnostics;
using System.Text.Json;

namespace Lunden.Launcher;

internal sealed record SetupLayout(string LocalData, string StartMenu, string Channel)
{
    internal string Name => Channel switch {
        "stable" => "Lunden", "test" => "Lunden-Test", _ => throw new ArgumentException("Okänd kanal.")
    };
    internal string DisplayName => Channel == "test" ? "Lunden (test)" : "Lunden";
    internal string LaunchArguments => Channel == "test" ? "--channel test" : "";
    internal string InstallDir => Path.Combine(LocalData, "Programs", Name);
    internal string Target => Path.Combine(InstallDir, "Lunden.exe");
    internal string UserData => Path.Combine(LocalData, Name);
    internal string Shortcut => Path.Combine(StartMenu, DisplayName + ".lnk");
    internal string RegistryPath => @"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + Name;
    internal string Receipt => Path.Combine(InstallDir, ".lunden-install.json");
    internal string Intent => Path.Combine(InstallDir, ".uninstall-request");

    internal static SetupLayout Current(string channel)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Installationen kräver Windows.");
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string menu = Environment.GetFolderPath(Environment.SpecialFolder.Programs, Environment.SpecialFolderOption.DoNotVerify);
        if (!Path.IsPathFullyQualified(local) || !Path.IsPathFullyQualified(menu))
            throw new InvalidOperationException("Windows användarmappar kunde inte hittas.");
        return new(local, menu, channel);
    }

    internal void CheckDirectories() {
        foreach (string path in new[] {Path.GetDirectoryName(InstallDir)!, InstallDir, UserData}) {
            if (Directory.Exists(path) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint))
                throw new IOException($"Installationen kan inte ändra en länkad mapp: {path}");
        }
    }

    // This short-lived lock lives outside the tree an uninstall removes. The
    // launcher's own update lock separately coordinates with older executables.
    internal FileStream MaintenanceLock() {
        CheckDirectories();
        string parent = Path.GetDirectoryName(InstallDir)!;
        Directory.CreateDirectory(parent);
        return new(Path.Combine(parent, "." + Name + ".maintenance.lock"), FileMode.OpenOrCreate,
            FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose);
    }
}

internal interface ISetupRegistration {
    void Register(SetupLayout layout, string version);
    void Unregister(SetupLayout layout);
}

internal sealed record SetupReceipt(string Name, string Version);

internal sealed class Setup(SetupLayout layout, ISetupRegistration shell, Action<string> verifyPublisher)
{
    internal static string Describe(SetupLayout layout, bool uninstall) => uninstall
        ? $"Avinstallera {layout.DisplayName}\nTa bort program och nedladdat innehåll i {layout.InstallDir}\nTa bort {layout.Shortcut}\nTa bort HKCU\\{layout.RegistryPath}\nSparfiler och inställningar i {layout.UserData} behålls som standard."
        : $"Installera {layout.DisplayName}\nKopiera startprogrammet till {layout.Target}\nSkapa {layout.Shortcut}\nRegistrera HKCU\\{layout.RegistryPath}\nSpelinnehållet hämtas vid första start. Sparfiler lagras i {layout.UserData}.";

    SetupReceipt? ReadReceipt()
    {
        if (!File.Exists(layout.Receipt)) return null;
        var receipt = JsonSerializer.Deserialize<SetupReceipt>(File.ReadAllBytes(layout.Receipt));
        if (receipt?.Name != layout.Name || string.IsNullOrWhiteSpace(receipt.Version))
            throw new InvalidDataException("Installationens kvitto är ogiltigt.");
        return receipt;
    }

    internal FileStream LockUpdates() => new(Path.Combine(layout.InstallDir, ".update.lock"),
        FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);

    internal void Install(string source, string version)
    {
        verifyPublisher(source);
        using var maintenance = layout.MaintenanceLock();
        bool created = !Directory.Exists(layout.InstallDir);
        Directory.CreateDirectory(layout.InstallDir);
        if (!File.Exists(layout.Target) && !File.Exists(layout.Receipt) && Directory.EnumerateFileSystemEntries(layout.InstallDir)
            .Any(p => Path.GetFileName(p) != ".update.lock"))
            throw new IOException("Installationsmappen innehåller redan andra filer.");
        try {
            using var updates = LockUpdates();
            InstallLocked(source, version);
        }
        finally {
            if (created && Directory.EnumerateFileSystemEntries(layout.InstallDir).All(p => Path.GetFileName(p) == ".update.lock")) {
                File.Delete(Path.Combine(layout.InstallDir, ".update.lock"));
                Directory.Delete(layout.InstallDir);
            }
        }
    }

    void InstallLocked(string source, string version)
    {
        var receipt = ReadReceipt();
        bool exists = File.Exists(layout.Target);
        if (exists) verifyPublisher(layout.Target);
        bool same = Path.GetFullPath(source).Equals(Path.GetFullPath(layout.Target), StringComparison.OrdinalIgnoreCase);
        string id = Guid.NewGuid().ToString("N");
        string staged = Path.Combine(layout.InstallDir, "." + id + ".new");
        string backup = staged + ".old";
        string nextReceipt = staged + ".json";
        bool swapped = false, registrationStarted = false;
        try {
            if (!same) {
                File.Copy(source, staged);
                verifyPublisher(staged);
            }
            File.WriteAllBytes(nextReceipt, JsonSerializer.SerializeToUtf8Bytes(new SetupReceipt(layout.Name, version)));
            // A reinstall supersedes a pending request from an older installer.
            File.Delete(layout.Intent);
            if (!same) {
                if (exists) File.Replace(staged, layout.Target, backup);
                else File.Move(staged, layout.Target);
                swapped = true;
            }
            registrationStarted = true;
            shell.Register(layout, version);
            File.Move(nextReceipt, layout.Receipt, true);
        }
        catch {
            if (swapped) {
                if (exists) File.Move(backup, layout.Target, true);
                else File.Delete(layout.Target);
            }
            if (registrationStarted) {
                if (receipt == null) shell.Unregister(layout);
                else shell.Register(layout, receipt.Version);
            }
            throw;
        }
        finally {
            File.Delete(staged);
            File.Delete(nextReceipt);
        }
        File.Delete(backup);
    }

    internal void PrepareUninstall(string id, bool deleteData) {
        if (ReadReceipt() == null) throw new InvalidOperationException("Programmet har inget installationskvitto.");
        File.WriteAllText(layout.Intent, Request(id, deleteData));
    }

    static string Request(string id, bool deleteData) => id + (deleteData ? ":delete" : ":keep");

    internal void Uninstall(bool deleteData, string? expectedRequest = null)
    {
        using var maintenance = layout.MaintenanceLock();
        if (!Directory.Exists(layout.InstallDir)) return;
        var receipt = ReadReceipt() ?? throw new InvalidOperationException("Programmet har inget installationskvitto.");
        using (LockUpdates()) {
            if (expectedRequest != null && (!File.Exists(layout.Intent) || File.ReadAllText(layout.Intent) != Request(expectedRequest, deleteData)))
                throw new InvalidOperationException("Begäran har ersatts av en ny installation.");
            EnsureGameStopped();
            try {
                // A shell-registration failure leaves all package and user files intact.
                shell.Unregister(layout);
                string versions = Path.Combine(layout.InstallDir, "versions");
                if (!deleteData && Directory.Exists(versions)) PreserveLocalSaves(versions);
                foreach (string name in new[] {"versions", "staging", ".launcher-update"}) {
                    string dir = Path.Combine(layout.InstallDir, name);
                    if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
                }
                foreach (string file in new[] {"state.json", "state.json.tmp"})
                    File.Delete(Path.Combine(layout.InstallDir, file));
                if (deleteData && Directory.Exists(layout.UserData)) Directory.Delete(layout.UserData, recursive: true);
                // Keep the installed uninstaller available until package cleanup completes.
                File.Delete(layout.Target);
            }
            catch {
                shell.Register(layout, receipt.Version);
                throw;
            }
            File.Delete(layout.Intent);
            File.Delete(layout.Receipt);
        }
        File.Delete(Path.Combine(layout.InstallDir, ".update.lock"));
        if (!Directory.EnumerateFileSystemEntries(layout.InstallDir).Any()) Directory.Delete(layout.InstallDir);
    }

    void PreserveLocalSaves(string versions)
    {
        static void CheckFolder(string dir) {
            if (File.GetAttributes(dir).HasFlag(FileAttributes.ReparsePoint))
                throw new IOException($"Kan inte flytta sparfiler genom en länk: {dir}");
        }
        CheckFolder(versions);
        foreach (string version in Directory.EnumerateDirectories(versions)) {
            CheckFolder(version);
            string dir = version;
            foreach (string part in new[] {"game", "Lunden", "Saved"}) {
                dir = Path.Combine(dir, part);
                if (!Directory.Exists(dir)) break;
                CheckFolder(dir);
            }
            if (Path.GetFileName(dir) != "Saved" || !Directory.Exists(dir)) continue;
            string recovery = Path.Combine(layout.UserData, "Recovered");
            Directory.CreateDirectory(recovery);
            CheckFolder(recovery);
            Directory.Move(dir, Path.Combine(recovery, Guid.NewGuid().ToString("N")));
        }
    }

    internal static void EnsureGameStopped()
    {
        var games = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(ReleaseManifest.GameExe));
        foreach (var process in games) process.Dispose();
        if (games.Length != 0) throw new IOException("Stäng spelet och försök igen.");
    }
}
