using System.ComponentModel;
using System.Diagnostics;

namespace Lunden.Launcher;

internal static class GameProcess
{
    internal static ProcessStartInfo StartInfo(string gameRoot, string entryPoint, string userData)
    {
        if (entryPoint is not (ReleaseManifest.GameExe or ReleaseManifest.StockGameExe))
            throw new InvalidDataException("Okänd startfil för spelet.");
        string path = Path.Combine(gameRoot, entryPoint);
        var info = new ProcessStartInfo(path) { UseShellExecute = false, WorkingDirectory = gameRoot };
        if (entryPoint == ReleaseManifest.StockGameExe) {
            // The project descriptor is mounted from the pak by Unreal, so it is not a loose file.
            info.ArgumentList.Add(@"..\..\..\Lunden\Lunden.uproject");
        }
        info.ArgumentList.Add("-UserDir=" + userData);
        return info;
    }

    internal static bool IsRunning(string installRoot)
    {
        foreach (string entry in new[] { ReleaseManifest.GameExe, ReleaseManifest.StockGameExe }) {
            var games = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(entry));
            try {
                foreach (var game in games) {
                    try {
                        string? path = game.MainModule?.FileName;
                        if (path == null || IsInstalledProcess(installRoot, path, entry)) return true;
                    }
                    catch (InvalidOperationException) when (game.HasExited) { }
                    catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or UnauthorizedAccessException) {
                        // Removal and pruning can wait if Windows refuses to identify a running image.
                        return true;
                    }
                }
            }
            finally { foreach (var game in games) game.Dispose(); }
        }
        return false;
    }

    internal static bool IsInstalledProcess(string installRoot, string image, string entry)
    {
        string relative = Path.GetRelativePath(Path.Combine(installRoot, "versions"), image).Replace(Path.DirectorySeparatorChar, '/');
        int slash = relative.IndexOf('/');
        return slash > 0 && Guid.TryParseExact(relative[..slash], "N", out _)
            && relative[(slash + 1)..].Equals("game/" + entry, StringComparison.OrdinalIgnoreCase);
    }
}
