using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;

namespace Lunden.Launcher;

internal static class SelfUpdate
{
    const string Switch = "--finish-launcher-update";
    const string Work = ".launcher-update";
    const string Helper = "Swap.exe";
    const string Launcher = "Lunden.exe";
    static readonly TimeSpan RetryWindow = TimeSpan.FromSeconds(8);

    internal static bool IsHelper(string[] args) => args.Length > 0 && args[0] == Switch;

    // Called under the installation lock. The independently running helper acquires
    // that same lock after this process exits and Windows releases the image.
    internal static void Start(string installRoot, string stagedLauncher, string expectedSha256,
        string expectedSigner, string[]? restartArgs = null)
    {
        string target = Path.GetFullPath(Path.Combine(installRoot, Launcher));
        if (!OperatingSystem.IsWindows() || !target.Equals(Environment.ProcessPath, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Självuppdatering kräver att den installerade Lunden.exe körs.");
        string work = Path.Combine(installRoot, Work);
        Directory.CreateDirectory(work);
        string helper = Path.Combine(work, Helper);
        string id = Guid.NewGuid().ToString("N");
        string operation = Path.Combine(work, id);
        Directory.CreateDirectory(operation);
        try
        {
            string oldHash = Digest(target);
            string stagedHelper = Path.Combine(operation, Helper);
            CopyDurably(target, stagedHelper);
            Verify(stagedHelper, oldHash, path => Authenticode.Verify(path, expectedSigner));
            File.Move(stagedHelper, helper, overwrite: true);

            string next = Path.Combine(operation, "next.exe");
            CopyDurably(stagedLauncher, next);
            Verify(next, expectedSha256, path => Authenticode.Verify(path, expectedSigner));
            using var parent = Process.GetCurrentProcess();
            Launch(helper, [Switch, id, parent.Id.ToString(CultureInfo.InvariantCulture),
                parent.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture),
                oldHash, expectedSha256, .. RestartArguments(restartArgs ?? [])]);
        }
        catch
        {
            RemoveOperation(operation);
            throw;
        }
    }

    // The replacement starts from its install directory. Resolve a local manifest
    // while the original working directory is still available.
    internal static string[] RestartArguments(string[] args)
    {
        string[] result = [.. args];
        for (int i = 0; i + 1 < result.Length; i++)
        {
            if (result[i] == "--manifest" && File.Exists(result[i + 1]))
                result[i + 1] = Path.GetFullPath(result[i + 1]);
        }
        return result;
    }

    internal static int Finish(string[] args, string expectedSigner)
    {
        try
        {
            var image = new FileInfo(Environment.ProcessPath!);
            if (!OperatingSystem.IsWindows() || !image.Name.Equals(Helper, StringComparison.OrdinalIgnoreCase)
                || image.Directory?.Name != Work || image.Directory.Parent is not { } root
                || !IsHelper(args) || args.Length < 6 || !Guid.TryParseExact(args[1], "N", out _)
                || !int.TryParse(args[2], out int pid) || pid <= 0
                || !long.TryParse(args[3], out long ticks) || !ValidDigest(args[4]) || !ValidDigest(args[5]))
                throw new InvalidDataException("Ogiltig begäran om självuppdatering.");

            WaitForParent(pid, ticks);
            return Activate(root.FullName, Path.Combine(image.Directory.FullName, args[1]),
                args[4], args[5], path => Authenticode.Verify(path, expectedSigner), args[6..], Launch, RetryWindow);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Kunde inte uppdatera startprogrammet: {ex.Message}");
            return 1;
        }
    }

    static void WaitForParent(int pid, long ticks)
    {
        Process parent;
        try { parent = Process.GetProcessById(pid); }
        catch (ArgumentException) { return; }  // Already exited.
        using (parent)
        {
            try
            {
                if (parent.StartTime.ToUniversalTime().Ticks == ticks && !parent.WaitForExit(30000))
                    throw new TimeoutException("Det tidigare startprogrammet körs fortfarande.");
            }
            catch (InvalidOperationException) when (parent.HasExited) { }
        }
    }

    internal static int Activate(string root, string operation, string oldHash, string newHash,
        Action<string> verifyPublisher, string[] restartArgs, Action<string, string[]> launch, TimeSpan retryWindow)
    {
        string target = Path.Combine(root, Launcher);
        string next = Path.Combine(operation, "next.exe");
        string previous = Path.Combine(operation, "previous.exe");
        FileStream Lock() => Retry(() => new FileStream(Path.Combine(root, ".update.lock"),
            FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None), retryWindow);
        void Replace(string source) => Retry(() => { File.Move(source, target, overwrite: true); return true; }, retryWindow);
        bool installed = false;
        try
        {
            using (Lock())
            {
                Verify(target, oldHash, verifyPublisher);
                Verify(next, newHash, verifyPublisher);
                CopyDurably(target, previous);
                Verify(previous, oldHash, verifyPublisher);
                Replace(next); // Same-volume atomic replacement. The entry point always exists.
                installed = true;
            }
            launch(target, restartArgs);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Startprogrammet kunde inte bytas eller startas: {ex.Message}");
            // If another process has installed a different version, neither overwrite
            // nor restart it. If rollback fails, preserve the verified recovery copy.
            using (Lock())
            {
                if (installed)
                {
                    Verify(target, newHash, verifyPublisher);
                    Verify(previous, oldHash, verifyPublisher);
                    Replace(previous);
                }
                Verify(target, oldHash, verifyPublisher);
            }
            launch(target, restartArgs.Contains("--offline") ? restartArgs : [.. restartArgs, "--offline"]);
            RemoveOperation(operation);
            return 1;
        }
        RemoveOperation(operation);
        return 0;
    }

    static void Launch(string exe, string[] args)
    {
        var info = new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe)! };
        foreach (string arg in args) info.ArgumentList.Add(arg);
        using var process = Process.Start(info) ?? throw new IOException("Processen kunde inte startas.");
    }

    static T Retry<T>(Func<T> action, TimeSpan window)
    {
        var timer = Stopwatch.StartNew();
        while (true)
        {
            try { return action(); }
            catch (Exception ex) when ((ex is IOException or UnauthorizedAccessException) && timer.Elapsed < window)
            {
                Thread.Sleep(150);
            }
        }
    }

    static void CopyDurably(string source, string path)
    {
        using var input = File.OpenRead(source);
        using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        input.CopyTo(output);
        output.Flush(flushToDisk: true);
    }

    static bool ValidDigest(string hash) => hash.Length == 64 && hash.All(Uri.IsHexDigit);

    static string Digest(string path)
    {
        using var input = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(input));
    }

    static void Verify(string path, string hash, Action<string> verifyPublisher)
    {
        if (!ValidDigest(hash) || !Digest(path).Equals(hash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"Fel SHA-256 för {Path.GetFileName(path)}.");
        verifyPublisher(path);
    }

    static void RemoveOperation(string directory)
    {
        try
        {
            foreach (string name in new[] { "next.exe", "previous.exe", Helper })
                File.Delete(Path.Combine(directory, name));
            Directory.Delete(directory);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
