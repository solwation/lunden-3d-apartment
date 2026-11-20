using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class StockRuntimeTests
{
    const string Pak = "Lunden/Content/Paks/Lunden-Windows.pak";
    const string DirectML = "Engine/Binaries/Win64/DML/x64/DirectML.dll";
    static readonly Uri Source = new("https://example.invalid/update");
    static ReleaseFile FileEntry(string path) => new(path, Source, 1, new('0', 64));

    static ReleaseManifest Stock()
    {
        ReleaseFile[] files = StockRuntime.Inventory.Values
            .Select(vendor => FileEntry(vendor.Path) with { Sha256 = vendor.Sha256 }).ToArray();
        return new(1, "test", DateTimeOffset.UnixEpoch, new("0.2.0", "1", "0.2.0", files),
            new(1, "1", [new("paks", [FileEntry(Pak)])]), new("0.2.0", Source, 1, new('a', 64)));
    }

    static ReleaseManifest SignAndRead(ReleaseManifest manifest)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(manifest, ReleaseManifest.Json);
        return ReleaseManifest.Read(bytes, key.SignData(bytes, HashAlgorithmName.SHA256), key, "test");
    }

    [Fact]
    public void SignedStockManifestSelectsTheKnownEngineAndMountedProject()
    {
        var stock = SignAndRead(Stock());
        StockRuntime.Validate(stock);
        Assert.Equal(14, StockRuntime.Inventory.Count);
        Assert.Equal("F7B3FA0FD8CB4F4A12021E1E623F2FE7D8FB5BDF88BD1DCFB74C3F109340B3F2", StockRuntime.Inventory[DirectML].Sha256);
        Assert.Equal(DirectML, Assert.Single(StockRuntime.Inventory.Values, v => v.Type == "Catalog").Path);
        Assert.Equal(13, StockRuntime.Inventory.Values.Count(v => v.Type == "Authenticode"));
        Assert.Equal(ReleaseManifest.StockGameExe, stock.EntryPoint);
        var info = GameProcess.StartInfo("package root", stock.EntryPoint, "user data");
        Assert.Equal(Path.Combine("package root", ReleaseManifest.StockGameExe), info.FileName);
        Assert.Equal("package root", info.WorkingDirectory);
        Assert.Equal([@"..\..\..\Lunden\Lunden.uproject", "-UserDir=user data"], info.ArgumentList);
        Assert.False(info.UseShellExecute);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("moved")]
    [InlineData("changed")]
    [InlineData("extra")]
    [InlineData("missing-pak")]
    public void EvenASignedManifestCannotChangeTheVendorInventory(string change)
    {
        var stock = Stock();
        var app = stock.App.Files.ToList();
        int index = app.FindIndex(f => f.Path == DirectML);
        switch (change) {
            case "missing": app.RemoveAt(index); break;
            case "moved": app[index] = app[index] with { Path = "Lunden/DirectML.dll" }; break;
            case "changed": app[index] = app[index] with { Sha256 = new('a', 64) }; break;
            case "extra": app.Add(FileEntry("Engine/Unknown.dll")); break;
            case "missing-pak": stock = stock with { Content = stock.Content with { Packages = [] } }; break;
        }
        stock = SignAndRead(stock with { App = stock.App with { Files = app.ToArray() } });
        Assert.Throws<InvalidDataException>(() => StockRuntime.Validate(stock));
    }

    [Fact]
    public void ExistingProjectEntrypointsRetainLegacyTrustAndContentCannotSelectTheGame()
    {
        var stock = Stock();
        var legacy = FileEntry(ReleaseManifest.GameExe);
        var old = SignAndRead(stock with { App = stock.App with { Files = [legacy, .. stock.App.Files] } });
        Assert.Equal(ReleaseManifest.GameExe, old.EntryPoint);
        Assert.Throws<InvalidDataException>(() => SignAndRead(stock with {
            Content = stock.Content with { Packages = [new("extra", [legacy])] }
        }));
        stock = SignAndRead(stock with { App = stock.App with { Files = [legacy] } });
        StockRuntime.Validate(stock);
        Assert.Equal(ReleaseManifest.GameExe, stock.EntryPoint);
        Assert.Equal(["-UserDir=user data"], GameProcess.StartInfo("old", stock.EntryPoint, "user data").ArgumentList);
    }

    [Fact]
    public void AlteredVendorBytesFailBeforeTrustVerification()
    {
        var file = Stock().App.Files.Single(f => f.Path == DirectML);
        string temp = Path.GetTempFileName();
        try { Assert.Throws<InvalidDataException>(() => StockRuntime.Verify(temp, file, true, SignerIdentity.Compiled with { RootSha256 = new('0', 64) })); }
        finally { File.Delete(temp); }
    }

    sealed class WindowsFactAttribute : FactAttribute
    {
        public WindowsFactAttribute() {
            if (!OperatingSystem.IsWindows()) Skip = "Requires a visible Windows process image.";
        }
    }

    [WindowsFact]
    public void RemovalAndPruningWaitForEitherGameInTheirOwnInstallation()
    {
        string root = Directory.CreateTempSubdirectory("Lunden process test ").FullName;
        try {
            string other = Path.Combine(root, "other-install");
            using var client = new HttpClient();
            var store = new UpdateStore(root, client, (_, _, _) => throw new NotImplementedException());
            var active = new Installation(Guid.NewGuid().ToString("N"), new('a', 64), "1", 1, DateTimeOffset.UnixEpoch);
            var state = new InstallState("test", active);
            foreach (var entry in new[] { ReleaseManifest.StockGameExe, ReleaseManifest.GameExe }) {
                string obsolete = Path.Combine(root, "versions", Guid.NewGuid().ToString("N"));
                string image = Path.Combine(obsolete, "game", entry);
                Directory.CreateDirectory(Path.GetDirectoryName(image)!);
                File.Copy(Path.Combine(Environment.SystemDirectory, "cmd.exe"), image);
                var start = new ProcessStartInfo(image) {
                    UseShellExecute = false, RedirectStandardInput = true, CreateNoWindow = true,
                    ArgumentList = { "/d", "/q", "/k" }
                };
                using var game = Process.Start(start)!;
                try {
                    Assert.Throws<IOException>(() => Setup.EnsureGameStopped(root));
                    Setup.EnsureGameStopped(other);
                    store.Prune(state);
                    Assert.True(Directory.Exists(obsolete));
                } finally {
                    game.StandardInput.WriteLine("exit");
                    if (!game.WaitForExit(5000)) { game.Kill(); game.WaitForExit(); }
                }
                Setup.EnsureGameStopped(root);
                store.Prune(state);
                Assert.False(Directory.Exists(obsolete));
            }
        } finally { Directory.Delete(root, true); }
    }
}
