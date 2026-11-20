using System.Text.Json;

namespace Lunden.Launcher;

// Compiled into the launcher. Downloaded manifests have no authority to select a publisher.
internal static class StockRuntime
{
    internal sealed record Vendor(string Path, string Sha256, string Fingerprint, string Type);
    internal static readonly IReadOnlyDictionary<string, Vendor> Inventory = Load();

    static Dictionary<string, Vendor> Load()
    {
        using var input = typeof(StockRuntime).Assembly.GetManifestResourceStream("Lunden.Unreal-5.8.4-win64.json")
            ?? throw new InvalidDataException("Startprogrammets Unreal-inventering saknas.");
        return JsonSerializer.Deserialize<Vendor[]>(input, ReleaseManifest.Json)!
            .ToDictionary(item => item.Path, StringComparer.Ordinal);
    }

    internal static void Validate(ReleaseManifest release)
    {
        if (release.EntryPoint != ReleaseManifest.StockGameExe) return;
        var app = release.App.Files.ToDictionary(file => file.Path, StringComparer.Ordinal);
        foreach (var vendor in Inventory.Values) {
            if (!app.TryGetValue(vendor.Path, out var file) ||
                !vendor.Sha256.Equals(file.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Unreal-filen {vendor.Path} saknas eller har en annan kontrollsumma.");
        }
        foreach (var file in release.Files.Where(ReleaseManifest.NeedsSigning)) {
            if (!Inventory.ContainsKey(file.Path) && !file.Path.StartsWith("Lunden/", StringComparison.Ordinal))
                throw new InvalidDataException($"Okänd programfil i Unreal-paketet: {file.Path}.");
        }
        if (!release.Files.Any(file => file.Path.StartsWith("Lunden/Content/Paks/", StringComparison.Ordinal) &&
            file.Path.EndsWith(".pak", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException("Projektets pak-fil saknas.");
    }

    internal static void Verify(string path, ReleaseFile file, bool stock, string lundenSigner)
    {
        // Keep these bytes in place across the hash and signature checks, including
        // files reused from an installed version or from a prior staging attempt.
        using var stream = File.OpenRead(path);
        string actual = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(stream));
        if (!actual.Equals(file.Sha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"Fel kontrollsumma för {file.Path}.");
        if (stock && Inventory.TryGetValue(file.Path, out var vendor)) {
            if (!actual.Equals(vendor.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Filen avviker från den godkända Unreal-versionen: {file.Path}.");
            switch (vendor.Type) {
                case "Authenticode": Authenticode.Verify(path, vendor.Fingerprint); return;
                case "Catalog": CatalogSignature.Verify(path, vendor.Fingerprint); return;
                default: throw new InvalidDataException("Okänd form av leverantörssignatur.");
            }
        }
        Authenticode.Verify(path, lundenSigner);
    }
}
