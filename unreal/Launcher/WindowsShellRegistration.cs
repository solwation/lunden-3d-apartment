using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Lunden.Launcher;

internal sealed class WindowsShellRegistration : ISetupRegistration
{
    readonly Action<string, IReadOnlyDictionary<string, object>> writeEntry;
    readonly Action<string> deleteEntry;
    readonly Action<string, SetupLayout> writeShortcut;

    internal WindowsShellRegistration() : this(WriteEntry, DeleteEntry, WriteShortcut) { }

    internal WindowsShellRegistration(Action<string, IReadOnlyDictionary<string, object>> writeEntry,
        Action<string> deleteEntry, Action<string, SetupLayout> writeShortcut)
    {
        this.writeEntry = writeEntry;
        this.deleteEntry = deleteEntry;
        this.writeShortcut = writeShortcut;
    }

    public void Register(SetupLayout layout, string version)
    {
        string directory = Path.GetDirectoryName(layout.Shortcut)!;
        Directory.CreateDirectory(directory);
        // WSH chooses the shortcut format by extension. Save to a sibling first
        // so an interrupted write cannot truncate the existing Start menu link.
        string staged = Path.Combine(directory, $".lunden-{Guid.NewGuid():N}.lnk");
        try
        {
            writeShortcut(staged, layout);
            File.Move(staged, layout.Shortcut, overwrite: true);
            string uninstall = $"\"{layout.Target}\" --uninstall";
            if (layout.LaunchArguments.Length != 0) uninstall += " " + layout.LaunchArguments;
            writeEntry(layout.RegistryPath, new Dictionary<string, object>
            {
                ["DisplayName"] = layout.DisplayName,
                ["DisplayVersion"] = version,
                ["DisplayIcon"] = $"\"{layout.Target}\",0",
                ["InstallLocation"] = layout.InstallDir,
                ["UninstallString"] = uninstall,
                ["QuietUninstallString"] = uninstall + " --quiet",
                ["NoModify"] = 1,
                ["NoRepair"] = 1
            });
        }
        finally { File.Delete(staged); }
    }

    public void Unregister(SetupLayout layout)
    {
        try { File.Delete(layout.Shortcut); }
        catch (DirectoryNotFoundException) { /* No Start menu entry exists. */ }
        deleteEntry(layout.RegistryPath);
    }

    static void WriteEntry(string path, IReadOnlyDictionary<string, object> values)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        using var key = Registry.CurrentUser.CreateSubKey(path);
        foreach (var (name, value) in values)
            key.SetValue(name, value, value is int ? RegistryValueKind.DWord : RegistryValueKind.String);
    }

    static void DeleteEntry(string path)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        Registry.CurrentUser.DeleteSubKey(path, throwOnMissingSubKey: false);
    }

    internal static void WriteShortcut(string path, SetupLayout layout)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        var type = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new IOException("Windows Script Host kunde inte skapa Start-menygenvägen.");
        object? shell = null;
        object? shortcut = null;
        try
        {
            shell = Activator.CreateInstance(type)!;
            shortcut = ((dynamic)shell).CreateShortcut(path);
            dynamic link = shortcut;
            link.TargetPath = layout.Target;
            link.WorkingDirectory = layout.InstallDir;
            link.Arguments = layout.LaunchArguments;
            link.Description = layout.DisplayName;
            link.Save();
        }
        catch (COMException ex) { throw new IOException("Windows kunde inte spara Start-menygenvägen.", ex); }
        finally
        {
            if (shortcut != null) Marshal.FinalReleaseComObject(shortcut);
            if (shell != null) Marshal.FinalReleaseComObject(shell);
        }
    }
}
