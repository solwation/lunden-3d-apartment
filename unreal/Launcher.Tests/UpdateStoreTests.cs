using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lunden.Launcher;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class UpdateStoreTests : IAsyncLifetime
{
    readonly string temp = Directory.CreateTempSubdirectory("Lunden-update-").FullName;
    readonly ECDsa key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    readonly HttpClient http = new();
    readonly Dictionary<string, byte[]> assets = [];
    readonly List<(string Name, long Offset)> requests = [];
    WebApplication server = null!;
    Uri origin = null!;
    UpdateStore store = null!;
    bool cut, unsigned;
    readonly string[] paths = [ReleaseManifest.GameExe, "Lunden/Content/Paks/zone1.utoc", "Lunden/Content/Paks/zone2.ucas"];

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        server = builder.Build();
        server.MapGet("/{name}", async (string name, HttpContext ctx) => {
            if (!assets.TryGetValue(name, out byte[]? body)) {ctx.Response.StatusCode = 404; return;}
            var range = ctx.Request.GetTypedHeaders().Range?.Ranges.Single().From;
            int offset = (int)(range ?? 0);
            requests.Add((name, offset));
            if (range.HasValue) {
                ctx.Response.StatusCode = 206;
                ctx.Response.Headers.ContentRange = $"bytes {offset}-{body.Length - 1}/{body.Length}";
            }
            int length = cut && name == "zone2" ? Math.Max(0, body.Length / 2 - offset) : body.Length - offset;
            await ctx.Response.Body.WriteAsync(body.AsMemory(offset, length));
        });
        await server.StartAsync();
        origin = new Uri(server.Urls.Single());
        store = new(Path.Combine(temp, "install"), http, (file, _, stock) => {
            Assert.False(stock);
            Assert.EndsWith(".exe", file);
            if (unsigned) throw new InvalidDataException("Testutgivaren avvisade filen.");
        });
    }

    public async Task DisposeAsync() {
        await server.DisposeAsync();
        key.Dispose();
        http.Dispose();
        Directory.Delete(temp, true);
    }

    (ReleaseManifest Manifest, byte[] Bytes, byte[] Signature) Release(int version, string app, string abi,
        string zone1, string zone2)
    {
        ReleaseFile File(string name, string path, string text) {
            byte[] data = Encoding.UTF8.GetBytes(text);
            assets[name] = data;
            return new(path, new(origin, name), data.Length, Convert.ToHexString(SHA256.HashData(data)), false);
        }
        var manifest = new ReleaseManifest(1, "test", DateTimeOffset.UnixEpoch.AddDays(version),
            new(app, abi, "0.1.0", [File("app", paths[0], app)]),
            new(version, abi, [new("zone1", [File("zone1", paths[1], zone1)]), new("zone2", [File("zone2", paths[2], zone2)])]),
            new("0.1.0", new(origin, "launcher"), 10, new('0', 64)));
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(manifest, ReleaseManifest.Json);
        byte[] sig = key.SignData(bytes, HashAlgorithmName.SHA256);
        return (ReleaseManifest.Read(bytes, sig, key, "test"), bytes, sig);
    }

    Task<Installation> Apply((ReleaseManifest Manifest, byte[] Bytes, byte[] Signature) r, bool dryRun = false)
        => store.Apply(r.Manifest, r.Bytes, r.Signature, store.Load("test"), dryRun, default);

    [Fact]
    public async Task ChangedFilesOnlyAndAtomicRecovery()
    {
        using var owner = store.Lock();
        Assert.Throws<IOException>(() => store.Lock());
        string save = Path.Combine(temp, "Saved.dat");
        await System.IO.File.WriteAllTextAsync(save, "sparat");
        var v1 = Release(1, "0.1.0", "abi1", "gamla rum", "samma yta");
        await Apply(v1, dryRun: true);
        Assert.Empty(requests);
        Assert.Null(store.Load("test").Active);
        Installation original = await Apply(v1);
        store.Confirm(store.Load("test"));
        requests.Clear();

        var v2 = Release(2, "0.1.0", "abi1", "nya rum", "samma yta");
        Installation second = await Apply(v2);
        Assert.Equal([("zone1", 0L)], requests);
        Assert.Equal(original, store.Load("test").Previous);
        Assert.True(store.Load("test").Pending);
        store.Confirm(store.Load("test"));
        requests.Clear();

        var v3 = Release(3, "0.2.0", "abi2", "nya rum", "ändrad sista del");
        cut = true;
        await Assert.ThrowsAsync<EndOfStreamException>(() => Apply(v3));
        Assert.Equal(second, store.Load("test").Active);
        await store.VerifyInstalled(second, key, "test", default);
        requests.Clear();
        cut = false;
        var third = await Apply(v3);
        Assert.Equal([("zone2", (long)assets["zone2"].Length / 2)], requests);
        Assert.Equal("0.2.0", third.AppVersion);
        Assert.Equal(3, third.ContentVersion);
        Assert.Equal(second, store.Load("test").Previous);

        // Simulate an early failure, then remove the server altogether. Starting
        // offline can still validate the intact previous files and user save.
        var starts = new List<Installation>();
        Assert.Equal(0, await Program.RunInstalled(store, store.Load("test"), key, temp, (info, candidate, pending) => {
            Assert.Equal(["-UserDir=" + temp], info.ArgumentList);
            Assert.Equal(store.GameFile(candidate, ReleaseManifest.GameExe), info.FileName);
            starts.Add(candidate);
            return Task.FromResult(!pending);
        }));
        Assert.Equal([third, second], starts);
        Assert.Equal(second, store.Load("test").Active);
        await Assert.ThrowsAsync<InvalidDataException>(() => Apply(v3));
        await server.StopAsync();
        Assert.Equal(0, await Program.RunInstalled(store, store.Load("test"), key, temp, (_, candidate, _) => {
            Assert.Equal(second, candidate);
            return Task.FromResult(true);
        }));
        Assert.False(Directory.Exists(store.PathFor(original)));
        Assert.False(Directory.Exists(store.PathFor(third)));
        Assert.Equal("sparat", await System.IO.File.ReadAllTextAsync(save));
    }

    [Fact]
    public async Task InterruptedStateWritePreservesPreviousAndUnlistedFilesPreventLaunch()
    {
        var previous = await Apply(Release(1, "0.1.0", "old", "1", "2"));
        store.Confirm(store.Load("test"));
        var update = Release(2, "0.2.0", "new", "3", "4");
        // Make the destination for the atomic state write unavailable.
        string blocked = Path.Combine(temp, "install", "state.json.tmp");
        Directory.CreateDirectory(blocked);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => Apply(update));
        Assert.Equal(previous, store.Load("test").Active);
        await store.VerifyInstalled(previous, key, "test", default);
        Directory.Delete(blocked);
        var current = await Apply(update);
        string extra = store.GameFile(current, "unexpected.dll");
        await System.IO.File.WriteAllTextAsync(extra, "not part of this release");
        Assert.Equal(0, await Program.RunInstalled(store, store.Load("test"), key, temp, (_, install, _) => {
            Assert.Equal(previous, install);
            return Task.FromResult(true);
        }));
        Assert.Equal(previous, store.Load("test").Active);
    }

    [Theory]
    [InlineData("../escape.dll")]
    [InlineData("nested/CON.txt")]
    [InlineData("a\\b.dll")]
    [InlineData("/absolute")]
    public void RejectsInvalidWindowsPaths(string path) => Assert.False(ReleaseManifest.ValidPath(path));

    [Fact]
    public async Task RejectedUpdatesLeaveCurrentInstallationIntact()
    {
        var old = await Apply(Release(1, "0.1.0", "old", "1", "2"));
        store.Confirm(store.Load("test"));
        var update = Release(2, "0.2.0", "new", "3", "4");
        byte[] altered = [.. update.Bytes, 0x20];
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(altered, update.Signature, key, "test"));
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(update.Bytes, update.Signature, key, "stable"));
        var wrongAbi = update.Manifest with {Content = update.Manifest.Content with {RequiresAbi = "other"}};
        byte[] mismatch = JsonSerializer.SerializeToUtf8Bytes(wrongAbi, ReleaseManifest.Json);
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(mismatch, key.SignData(mismatch, HashAlgorithmName.SHA256), key, "test"));

        unsigned = true;
        await Assert.ThrowsAsync<InvalidDataException>(() => Apply(update));
        unsigned = false;
        assets["zone2"] = [(byte)'x'];
        await Assert.ThrowsAsync<InvalidDataException>(() => Apply(update));
        Assert.Equal(old, store.Load("test").Active);
        await store.VerifyInstalled(old, key, "test", default);
    }
}
