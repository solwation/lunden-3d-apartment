using System.Net;
using System.Security.Cryptography;
using System.Runtime.Versioning;
using System.Text.Json;
using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class LinuxReleaseTests
{
    sealed class LinuxFact : FactAttribute
    {
        public LinuxFact() {
            if (!OperatingSystem.IsLinux()) Skip = "Requires actual Linux Unix modes/update activation.";
        }
    }
    sealed class NodeLinuxFact : FactAttribute
    {
        public NodeLinuxFact() {
            if (Environment.GetEnvironmentVariable("LUNDEN_LINUX_SIGNED_MANIFEST_DIR") is null)
                Skip = "Requires the Linux Node draft/signature fixture.";
        }
    }

    [NodeLinuxFact]
    public void ActualNodeLinuxDraftSignatureIsReadByTheLauncher()
    {
        string dir = Environment.GetEnvironmentVariable("LUNDEN_LINUX_SIGNED_MANIFEST_DIR")!;
        using var key = ECDsa.Create();
        key.ImportFromPem(File.ReadAllText(Path.Combine(dir, "public.pem")));
        byte[] bytes = File.ReadAllBytes(Path.Combine(dir, "manifest.json"));
        byte[] sig = File.ReadAllBytes(Path.Combine(dir, "manifest.json.sig"));
        var manifest = ReleaseManifest.Read(bytes, sig, key, "test", "linux-x64");
        Assert.Equal(ReleaseManifest.LinuxGame, manifest.EntryPoint);
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(bytes, sig, key, "test"));
    }

    static readonly byte[] Elf = [127, 69, 76, 70, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 62, 0];
    static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes));

    static (ReleaseManifest Manifest, byte[] Bytes, byte[] Signature) Signed(ECDsa key, int version = 1)
    {
        ReleaseFile File(string path, byte[] bytes, bool executable = false) =>
            new(path, new Uri("http://127.0.0.1/" + Hash(bytes)), bytes.Length, Hash(bytes), Executable: executable);
        var manifest = new ReleaseManifest(1, "test", DateTimeOffset.UnixEpoch.AddDays(version),
            new("0.1.0", "linux-abi", "0.1.0", [File(ReleaseManifest.LinuxGame, Elf, true)]),
            new(version, "linux-abi", [new("zone", [File("Lunden/Content/Paks/Lunden-Linux.pak", [(byte)version])])]),
            new("0.1.0", new Uri("http://127.0.0.1/launcher"), Elf.Length, Hash(Elf)), "linux-x64");
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(manifest, ReleaseManifest.Json);
        return (manifest, bytes, key.SignData(bytes, HashAlgorithmName.SHA256));
    }

    [Fact]
    public void SignedPlatformsAreCheckedBeforePayloadRequestsAndCannotChangeWithTheSameSignature()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var r = Signed(key);
        Assert.Equal("linux-x64", ReleaseManifest.Read(r.Bytes, r.Signature, key, "test", "linux-x64").EffectivePlatform);
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(r.Bytes, r.Signature, key, "test"));
        var wrong = r.Manifest with { Platform = "win-x64" };
        byte[] tampered = JsonSerializer.SerializeToUtf8Bytes(wrong, ReleaseManifest.Json);
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(tampered, r.Signature, key, "test", "linux-x64"));
        Assert.Throws<InvalidDataException>(() => wrong.RequirePlatform("linux-x64"));
        var foreign = r.Manifest with { App = r.Manifest.App with { Files = [new(ReleaseManifest.GameExe,
            new Uri("http://127.0.0.1/win"), 20, Hash(Elf), Executable: true)] } };
        Assert.Throws<InvalidDataException>(() => foreign.RequirePlatform("linux-x64"));
        Assert.Equal("lunden-manifest-linux-x64-test.json", ReleasePlatform.ManifestName("linux-x64", "test"));
        Assert.Equal("lunden-manifest.json", ReleasePlatform.ManifestName("win-x64", "stable"));
    }

    sealed class Payloads : HttpMessageHandler
    {
        internal readonly Dictionary<string, byte[]> Bytes = [];
        internal readonly List<string> Requests = [];
        internal bool Corrupt;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            string name = request.RequestUri!.AbsolutePath[1..];
            Requests.Add(name);
            byte[] bytes = Bytes[name];
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) {
                Content = new ByteArrayContent(Corrupt && bytes.Length == 1 ? [(byte)99] : bytes)
            });
        }
    }

    [LinuxFact]
    [SupportedOSPlatform("linux")]
    public async Task LinuxUpdatesSetExecuteBitsRejectBadPayloadsAndPreservePreviousAndSaves()
    {
        string temp = Directory.CreateTempSubdirectory("Lunden-linux-update-").FullName;
        try {
            using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
            using var handler = new Payloads();
            using var http = new HttpClient(handler);
            var store = new UpdateStore(Path.Combine(temp, "install"), http,
                (_, _, _) => throw new Exception("Linux must never invoke Windows Authenticode"), "linux-x64");
            var v1 = Signed(key);
            handler.Bytes[Hash(Elf)] = Elf;
            handler.Bytes[Hash([1])] = [1];
            using var lease = store.Lock();
            var first = await store.Apply(ReleaseManifest.Read(v1.Bytes, v1.Signature, key, "test", "linux-x64"),
                v1.Bytes, v1.Signature, store.Load("test"), false, default);
            store.Confirm(store.Load("test"));
            string game = store.GameFile(first, ReleaseManifest.LinuxGame);
            Assert.True(File.GetUnixFileMode(game).HasFlag(UnixFileMode.UserExecute));
            Assert.Equal(ReleaseManifest.LinuxGame, await store.VerifyInstalled(first, key, "test", default));
            string saved = Path.Combine(temp, "Saved", "player.json");
            Directory.CreateDirectory(Path.GetDirectoryName(saved)!);
            File.WriteAllText(saved, "kept");
            var v2 = Signed(key, 2);
            handler.Bytes[Hash([2])] = [2];
            handler.Corrupt = true;
            await Assert.ThrowsAsync<InvalidDataException>(() => store.Apply(v2.Manifest, v2.Bytes, v2.Signature,
                store.Load("test"), false, default));
            Assert.Equal(first, store.Load("test").Active);
            handler.Corrupt = false;
            var second = await store.Apply(v2.Manifest, v2.Bytes, v2.Signature, store.Load("test"), false, default);
            Assert.Equal(first, store.Load("test").Previous);
            Assert.Equal("kept", File.ReadAllText(saved));
            store.Rollback(store.Load("test"));
            Assert.Equal(first, store.Load("test").Active);
            File.SetUnixFileMode(game, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            await Assert.ThrowsAsync<InvalidDataException>(() => store.VerifyInstalled(first, key, "test", default));
            int requests = handler.Requests.Count;
            await Assert.ThrowsAsync<InvalidDataException>(() => store.Apply(v2.Manifest with { Platform = "win-x64" },
                v2.Bytes, v2.Signature, store.Load("test"), false, default));
            Assert.Equal(requests, handler.Requests.Count);
        } finally { Directory.Delete(temp, true); }
    }

    [Fact]
    public void LinuxStartInfoKeepsUserDataSeparateAndElfRejectsWindowsOrWrongArchitecture()
    {
        string temp = Directory.CreateTempSubdirectory("Lunden-elf-").FullName;
        try {
            var info = GameProcess.StartInfo(temp, ReleaseManifest.LinuxGame, Path.Combine(temp, "saved profile"));
            Assert.False(info.UseShellExecute);
            Assert.Equal("../../../Lunden/Lunden.uproject", info.ArgumentList[0]);
            Assert.Contains("-UserDir=" + Path.Combine(temp, "saved profile"), info.ArgumentList);
            string file = Path.Combine(temp, "runtime");
            File.WriteAllBytes(file, Elf);
            ReleasePlatform.VerifyLinuxExecutable(file);
            byte[] arm = (byte[])Elf.Clone(); arm[18] = 183;
            File.WriteAllBytes(file, arm);
            Assert.Throws<InvalidDataException>(() => ReleasePlatform.VerifyLinuxExecutable(file));
            File.WriteAllBytes(file, new byte[20]);
            Assert.Throws<InvalidDataException>(() => ReleasePlatform.VerifyLinuxExecutable(file));
        } finally { Directory.Delete(temp, true); }
    }
}
