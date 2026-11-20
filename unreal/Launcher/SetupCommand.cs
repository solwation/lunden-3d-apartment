using System.Diagnostics;
using System.Globalization;

namespace Lunden.Launcher;

internal sealed record SetupCommand(bool Uninstall, bool Quiet, bool DryRun, string Channel)
{
    internal static SetupCommand? Parse(string[] args, string image)
    {
        bool namedSetup = Path.GetFileNameWithoutExtension(image).StartsWith("Lunden-Setup", StringComparison.OrdinalIgnoreCase);
        if (!namedSetup && !args.Any(a => a is "--install" or "--uninstall" or "--dry-run-install")) return null;
        bool install = false, uninstall = false, quiet = false, dry = false;
        string channel = "stable";
        for (int i = 0; i < args.Length; i++) {
            switch (args[i]) {
                case "--install": install = true; break;
                case "--uninstall": uninstall = true; break;
                case "--quiet": quiet = true; break;
                case "--dry-run-install": dry = true; break;
                case "--channel" when i + 1 < args.Length: channel = args[++i]; break;
                default: throw new ArgumentException("Okänt installationsargument: " + args[i]);
            }
        }
        if (install && uninstall || channel is not ("stable" or "test"))
            throw new ArgumentException("Välj en installationsåtgärd och kanalen stable eller test.");
        return new(uninstall, quiet, dry, channel);
    }

    internal int Run(string image, SignerIdentity signer, string version)
    {
        var layout = OperatingSystem.IsWindows() ? SetupLayout.Current(Channel) :
            new SetupLayout("%LOCALAPPDATA%", @"%APPDATA%\Microsoft\Windows\Start Menu\Programs", Channel);
        if (DryRun) {
            Console.WriteLine(Setup.Describe(layout, Uninstall).Replace('/', '\\'));
            return 0;
        }
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Installationen kräver Windows.");
        var setup = new Setup(layout, new WindowsShellRegistration(), file => Authenticode.Verify(file, signer));
        bool interactive = !Quiet && !Console.IsInputRedirected && !Console.IsOutputRedirected;
        bool removeData = false;
        if (interactive) {
            Console.WriteLine(Setup.Describe(layout, Uninstall));
            Console.Write(Uninstall ? "Avinstallera? [j/N] " : "Installera? [J/n] ");
            string? answer = Console.ReadLine()?.Trim().ToLowerInvariant();
            if (answer is not ("j" or "ja") && (Uninstall || answer != "")) return 0;
            if (Uninstall) {
                Console.Write("Ta även bort sparfiler och inställningar? [j/N] ");
                removeData = Console.ReadLine()?.Trim().ToLowerInvariant() is "j" or "ja";
            }
        }
        if (!Uninstall) {
            if (typeof(Program).Assembly.GetManifestResourceInfo("Lunden.ManifestKey.pem") == null)
                throw new InvalidDataException("Startprogrammet saknar den inbyggda publika manifestnyckeln.");
            setup.Install(image, version);
            if (!Quiet) Console.WriteLine($"Installationen är klar. Starta {layout.DisplayName} från Start-menyn.");
        }
        else if (image.Equals(layout.Target, StringComparison.OrdinalIgnoreCase)) {
            UninstallHelper.Start(layout, setup, signer, removeData);
            if (!Quiet) Console.WriteLine("Avinstallationen har startat.");
        }
        else {
            Authenticode.Verify(image, signer);
            setup.Uninstall(removeData);
            if (!Quiet) Console.WriteLine("Avinstallationen är klar.");
        }
        return 0;
    }
}

// Windows locks a running executable. A verified copy in a unique temporary
// directory performs removal after the original process releases its image.
internal static class UninstallHelper
{
    internal const string Switch = "--finish-uninstall";
    const string Image = "Cleanup.exe";
    static string Work(string id) => Path.Combine(Path.GetTempPath(), "Lunden-Uninstall-" + id);

    internal static void Start(SetupLayout layout, Setup setup, SignerIdentity signer, bool removeData)
    {
        using var maintenance = layout.MaintenanceLock();
        using var updates = setup.LockUpdates();
        Setup.EnsureGameStopped(layout.InstallDir);
        string id = Guid.NewGuid().ToString("N");
        string dir = Work(id);
        string helper = Path.Combine(dir, Image);
        Directory.CreateDirectory(dir);
        Process? wrapper = null;
        try {
            File.Copy(layout.Target, helper);
            Authenticode.Verify(helper, signer);
            setup.PrepareUninstall(id, removeData);
            using var parent = Process.GetCurrentProcess();
            long ticks = parent.StartTime.ToUniversalTime().Ticks;
            // All command tokens are fixed names, numbers, a generated GUID or validated
            // enum values. Windows supplies the temporary working directory separately.
            // cmd waits for our console helper, then removes its now-unlocked image.
            string command = FormattableString.Invariant(
                $"/d /v:off /q /c .\\{Image} {Switch} {id} {parent.Id} {ticks} {layout.Channel} {(removeData ? "delete" : "keep")} & del /q {Image} ready 2>nul & cd .. & rd Lunden-Uninstall-{id}");
            var info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "cmd.exe"), command) {
                WorkingDirectory = dir, UseShellExecute = false
            };
            wrapper = Process.Start(info) ?? throw new IOException("Avinstallationen kunde inte startas.");
            var timer = Stopwatch.StartNew();
            while (!File.Exists(Path.Combine(dir, "ready"))) {
                if (wrapper.WaitForExit(100) || timer.Elapsed > TimeSpan.FromSeconds(30))
                    throw new IOException("Windows kunde inte starta den verifierade avinstalleraren.");
            }
        }
        catch {
            File.Delete(layout.Intent);
            if (wrapper == null && Directory.Exists(dir)) {
                File.Delete(helper);
                Directory.Delete(dir);
            }
            throw;
        }
        finally { wrapper?.Dispose(); }
    }

    internal static int Finish(string[] args, string image, SignerIdentity signer)
    {
        if (!OperatingSystem.IsWindows() || args.Length != 6 || !Guid.TryParseExact(args[1], "N", out _)
            || !int.TryParse(args[2], NumberStyles.None, CultureInfo.InvariantCulture, out int pid) || pid <= 0
            || !long.TryParse(args[3], NumberStyles.None, CultureInfo.InvariantCulture, out long ticks)
            || args[4] is not ("stable" or "test") || args[5] is not ("keep" or "delete")
            || !image.Equals(Path.Combine(Work(args[1]), Image), StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Ogiltig begäran om avinstallation.");
        Authenticode.Verify(image, signer);
        File.WriteAllText(Path.Combine(Work(args[1]), "ready"), "");
        SelfUpdate.WaitForParent(pid, ticks);
        var layout = SetupLayout.Current(args[4]);
        var setup = new Setup(layout, new WindowsShellRegistration(), file => Authenticode.Verify(file, signer));
        setup.Uninstall(args[5] == "delete", args[1]);
        return 0;
    }
}
