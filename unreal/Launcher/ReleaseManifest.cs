using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Lunden.Launcher;

// #2248's proposed v1 contract. The detached .sig is the raw 64-byte P-256
// signature (IEEE P1363) over the exact JSON bytes, using SHA-256.
internal sealed record ReleaseFile(string Path, Uri Url, long Size, string Sha256, bool Authenticode = false, bool Executable = false);
internal sealed record Package(string Id, ReleaseFile[] Files);
internal sealed record AppRelease(string Version, string ContentAbi, string MinLauncher, ReleaseFile[] Files);
internal sealed record ContentRelease(int Version, string RequiresAbi, Package[] Packages);
internal sealed record LauncherRelease(string Version, Uri Url, long Size, string Sha256);
internal sealed record ReleaseManifest(int FormatVersion, string Channel, DateTimeOffset Published,
    AppRelease App, ContentRelease Content, LauncherRelease Launcher, string? Platform = null)
{
    // Missing platform denotes the already published Windows v1 manifests only.
    internal string EffectivePlatform => Platform ?? "win-x64";
    internal const string LinuxGame = "Engine/Binaries/Linux/UnrealGame-Linux-Shipping";
    internal const string LinuxProjectGame = "Lunden/Binaries/Linux/Lunden-Linux-Shipping";
    internal const string GameExe = "Lunden/Binaries/Win64/Lunden-Win64-Shipping.exe";
    internal const string StockGameExe = "Engine/Binaries/Win64/UnrealGame-Win64-Shipping.exe";
    // A previously accepted package keeps its project launcher and Lunden-only publisher rule,
    // including when a second executable happens to have the stock engine's name.
    internal string EntryPoint => EffectivePlatform == "linux-x64"
        ? (App.Files.Any(f => f.Path == LinuxProjectGame) ? LinuxProjectGame : LinuxGame)
        : (App.Files.Any(f => f.Path == GameExe) ? GameExe : StockGameExe);
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) {
        PropertyNameCaseInsensitive = false, RespectRequiredConstructorParameters = true,
        RespectNullableAnnotations = true, AllowDuplicateProperties = false
    };

    internal IEnumerable<ReleaseFile> Files => App.Files.Concat(Content.Packages.SelectMany(p => p.Files));

    internal static ReleaseManifest Read(byte[] bytes, byte[] signature, ECDsa key, string channel, string platform = "win-x64")
    {
        if (key.ExportParameters(false).Curve.Oid.Value != ECCurve.NamedCurves.nistP256.Oid.Value
            || signature.Length != 64 || !key.VerifyData(bytes, signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
            throw new InvalidDataException("Manifestets signatur är ogiltig.");
        var manifest = JsonSerializer.Deserialize<ReleaseManifest>(bytes, Json)
            ?? throw new InvalidDataException("Tomt manifest.");
        manifest.RequirePlatform(platform);
        if (manifest.FormatVersion != 1 || manifest.Channel != channel || channel is not ("test" or "stable"))
            throw new InvalidDataException("Fel kanal eller manifestformat.");
        if (string.IsNullOrWhiteSpace(manifest.App.ContentAbi) || manifest.App.ContentAbi != manifest.Content.RequiresAbi)
            throw new InvalidDataException("Innehållet passar inte programmet.");
        if (!System.Version.TryParse(manifest.App.MinLauncher, out _) || !System.Version.TryParse(manifest.Launcher.Version, out _)
            || string.IsNullOrWhiteSpace(manifest.App.Version) || manifest.Content.Version < 0 || manifest.Published == default)
            throw new InvalidDataException("Ogiltig versionsinformation.");
        if (manifest.Content.Packages.Any(p => p == null || string.IsNullOrWhiteSpace(p.Id))
            || manifest.Content.Packages.Select(p => p.Id).Distinct(StringComparer.Ordinal).Count() != manifest.Content.Packages.Length)
            throw new InvalidDataException("Ogiltigt eller upprepat paket-ID.");
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in manifest.Files)
        {
            if (file is null || !ValidPath(file.Path) || !paths.Add(file.Path))
                throw new InvalidDataException("Ogiltig eller upprepad sökväg.");
            ValidateDownload(file.Url, file.Size, file.Sha256, channel);
        }
        if (!(manifest.EffectivePlatform == "linux-x64"
                ? manifest.App.Files.Any(f => f.Path == manifest.EntryPoint && f.Executable)
                : manifest.App.Files.Any(f => f.Path is GameExe or StockGameExe))
            || (manifest.EntryPoint == StockGameExe && paths.Contains(GameExe))
            || paths.Any(p => Ancestors(p).Any(paths.Contains)))
            throw new InvalidDataException("Programmets filträd är ogiltigt.");
        ValidateDownload(manifest.Launcher.Url, manifest.Launcher.Size, manifest.Launcher.Sha256, channel);
        return manifest;
    }

    internal void RequirePlatform(string platform)
    {
        if (platform is not ("win-x64" or "linux-x64") || EffectivePlatform != platform)
            throw new InvalidDataException("Uppdateringen gäller en annan plattform.");
        if (EffectivePlatform == "linux-x64" && Files.Any(f => f.Authenticode
            || f.Path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
            || f.Path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
            || f.Path.Split('/').Any(p => p is "Win64" or "Windows")))
            throw new InvalidDataException("Windows-filer får inte aktiveras på Linux.");
        if (EffectivePlatform == "win-x64" && Files.Any(f => f.Executable || f.Path.Split('/').Contains("Linux")))
            throw new InvalidDataException("Linux-filer får inte aktiveras på Windows.");
    }

    static IEnumerable<string> Ancestors(string path)
    {
        for (int i = path.IndexOf('/'); i >= 0; i = path.IndexOf('/', i + 1))
            yield return path[..i];
    }

    internal static bool ValidPath(string path) => !string.IsNullOrEmpty(path) && path.Split('/').All(s =>
        s.Length is > 0 and <= 255 && Regex.IsMatch(s, @"\A[A-Za-z0-9._ -]+\z")
        && !s.EndsWith('.') && !s.EndsWith(' ') && !Regex.IsMatch(s, @"\A(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", RegexOptions.IgnoreCase));

    static void ValidateDownload(Uri url, long size, string hash, string channel)
    {
        if (url is null || !url.IsAbsoluteUri || !AllowedUrl(url, channel) || size < 0
            || hash is not { Length: 64 } || !hash.All(Uri.IsHexDigit))
            throw new InvalidDataException("Felaktig filbeskrivning i manifestet.");
    }

    internal static bool AllowedUrl(Uri url, string channel) =>
        url.IsAbsoluteUri && (url.Scheme == "https" || (channel == "test" && url.Scheme == "http" && url.IsLoopback))
        && url.UserInfo.Length == 0 && url.Fragment.Length == 0;

    internal static bool NeedsSigning(ReleaseFile file) => file.Authenticode
        || file.Path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
        || file.Path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase);
}
