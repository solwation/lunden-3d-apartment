using System.Security.Cryptography;
using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class SelfUpdateTests : IDisposable
{
    readonly string root = Directory.CreateTempSubdirectory("lunden-launcher-fixture-").FullName;
    readonly string[] args = ["--channel", "test", "--manifest", "C:\\Example Folder\\manifest.json"];
    readonly List<(string Contents, string[] Args)> launches = [];
    string Target => Path.Combine(root, "Lunden.exe");
    string Operation => Path.Combine(root, ".launcher-update", "fixture");
    string Next => Path.Combine(Operation, "next.exe");
    static readonly byte[] Old = "old launcher fixture"u8.ToArray();
    static readonly byte[] New = "new launcher fixture"u8.ToArray();
    static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes));

    public SelfUpdateTests()
    {
        Directory.CreateDirectory(Operation);
        File.WriteAllBytes(Target, Old);
        File.WriteAllBytes(Next, New);
    }

    public void Dispose() => Directory.Delete(root, recursive: true);

    void Launch(string target, string[] restartArgs)
    {
        Assert.Equal(Target, target);
        launches.Add((File.ReadAllText(target), restartArgs));
    }

    int Apply(Action<string>? verify = null, Action<string, string[]>? launch = null) =>
        SelfUpdate.Activate(root, Operation, Hash(Old), Hash(New), verify ?? (_ => { }),
            args, launch ?? Launch, TimeSpan.Zero);

    [Fact]
    public void ActivatesVerifiedFileAndPassesRestartArgumentsWithoutShellQuoting()
    {
        var verified = new List<string>();
        Assert.Equal(0, Apply(verified.Add));
        Assert.Contains(Target, verified);
        Assert.Contains(Next, verified);
        Assert.Equal(("new launcher fixture", args), Assert.Single(launches));
        Assert.False(Directory.Exists(Operation));
    }

    [Theory]
    [InlineData("hash")]
    [InlineData("publisher")]
    [InlineData("stage-absent")]
    public void RejectedOrInterruptedStagingStartsPreviousLauncherOffline(string failure)
    {
        if (failure == "hash") File.WriteAllText(Next, "truncated download");
        if (failure == "stage-absent") File.Delete(Next);
        Assert.Equal(1, Apply(path =>
        {
            if (failure == "publisher" && path == Next) throw new InvalidDataException("unsigned fixture");
        }));
        var (contents, passed) = Assert.Single(launches);
        Assert.Equal("old launcher fixture", contents);
        Assert.Equal(args.Append("--offline"), passed);
        Assert.Equal(Old, File.ReadAllBytes(Target));
    }

    [Fact]
    public void LaunchErrorRestoresVerifiedPreviousFileBeforeOfflineRestart()
    {
        Assert.Equal(1, Apply(launch: (path, passed) =>
        {
            if (!passed.Contains("--offline")) throw new IOException("Cannot create process");
            Launch(path, passed);
        }));
        Assert.Equal("old launcher fixture", Assert.Single(launches).Contents);
        Assert.Equal(Old, File.ReadAllBytes(Target));
    }

    [Fact]
    public void StaleHelperCannotReplaceOrRestartAConcurrentInstallation()
    {
        File.WriteAllText(Target, "another installation");
        Assert.Throws<InvalidDataException>(() => Apply());
        Assert.Equal("another installation", File.ReadAllText(Target));
        Assert.Empty(launches);
    }

    [Fact]
    public void BusyInstallationLockLeavesBothImagesAlone()
    {
        using var busy = File.Open(Path.Combine(root, ".update.lock"), FileMode.OpenOrCreate,
            FileAccess.ReadWrite, FileShare.None);
        Assert.ThrowsAny<IOException>(() => Apply());
        Assert.Equal(Old, File.ReadAllBytes(Target));
        Assert.Equal(New, File.ReadAllBytes(Next));
        Assert.Empty(launches);
    }

    [Fact]
    public void RestartResolvesLocalManifestBeforeChangingWorkingDirectory()
    {
        string relative = Path.GetRelativePath(Environment.CurrentDirectory, Next);
        string[] input = ["--channel", "test", "--manifest", relative];
        Assert.Equal(Next, SelfUpdate.RestartArguments(input)[3]);
        Assert.Equal(relative, input[3]);
    }

    private sealed class WindowsFactAttribute : FactAttribute
    {
        public WindowsFactAttribute()
        {
            if (!OperatingSystem.IsWindows()) Skip = "Requires Windows file sharing semantics.";
        }
    }

    [WindowsFact]
    public void WindowsLockedImageStaysRunnableAtItsOriginalPath()
    {
        using var busy = File.Open(Target, FileMode.Open, FileAccess.Read, FileShare.Read);
        Assert.Equal(1, Apply());
        Assert.Equal(Old, File.ReadAllBytes(Target));
        Assert.Equal("old launcher fixture", Assert.Single(launches).Contents);
    }
}
