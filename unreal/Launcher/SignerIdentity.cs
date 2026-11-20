using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Lunden.Launcher;

// The stable identity of the project's publisher (#2277), compiled into the launcher from the
// reviewed publisher-identity.json. Downloaded manifests have no authority to select a publisher.
// Azure Artifact Signing issues a new leaf certificate every 72 hours and Microsoft rotates
// the issuing CA, so trust is bound to what every leaf of the same validated identity shares:
// the subject's common name and organization, the Microsoft root that anchors the chain and
// the certificate profile's durable identity extended key usage. A leaf certificate is never pinned.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
internal sealed partial record SignerIdentity(string CommonName, string Organization, string RootSha256, string IdentityKeyUsage)
{
    internal const string CodeSigning = "1.3.6.1.5.5.7.3.3";
    const string CommonNameType = "2.5.4.3", OrganizationType = "2.5.4.10";
    const int MaxChainLength = 8;

    static SignerIdentity? compiled;
    internal static SignerIdentity Compiled => compiled ??= Load();

    static SignerIdentity Load()
    {
        using var input = typeof(SignerIdentity).Assembly.GetManifestResourceStream("Lunden.PublisherIdentity.json")
            ?? throw new InvalidDataException("Startprogrammets utgivaridentitet saknas.");
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) {
            PropertyNameCaseInsensitive = false, RespectRequiredConstructorParameters = true,
            RespectNullableAnnotations = true, AllowDuplicateProperties = false
        };
        var identity = JsonSerializer.Deserialize<SignerIdentity>(input, options)
            ?? throw new InvalidDataException("Startprogrammets utgivaridentitet saknas.");
        identity.Validate();
        return identity;
    }

    internal void Validate()
    {
        foreach (var name in new[] { CommonName, Organization }) {
            if (string.IsNullOrWhiteSpace(name) || name != name.Trim() || name.Any(char.IsControl))
                throw new InvalidDataException("Startprogrammet saknar den förväntade utgivarens namn.");
        }
        if (RootSha256 is not { Length: 64 } || !RootSha256.All(Uri.IsHexDigit))
            throw new InvalidDataException("Rotcertifikatets SHA-256-avtryck måste bestå av 64 hexadecimala tecken.");
        if (IdentityKeyUsage is null || !ObjectIdentifier().IsMatch(IdentityKeyUsage))
            throw new InvalidDataException("Utgivarens identitets-OID är ogiltig.");
    }

    // The chain Windows built and trusted for the signature: the signing leaf first, the root last.
    internal void Check(IReadOnlyList<X509Certificate2> chain, bool timestamped, string file)
    {
        Validate();
        if (!timestamped)
            throw new InvalidDataException($"Signaturen för {file} saknar tidsstämpel.");
        if (chain.Count < 2 || chain.Count > MaxChainLength)
            throw new InvalidDataException($"Signaturen för {file} har en ofullständig certifikatkedja.");
        for (int i = 0; i + 1 < chain.Count; i++) {
            if (!chain[i].IssuerName.RawData.AsSpan().SequenceEqual(chain[i + 1].SubjectName.RawData))
                throw new InvalidDataException($"Signaturen för {file} har en bruten certifikatkedja.");
        }
        var root = chain[^1];
        if (!root.SubjectName.RawData.AsSpan().SequenceEqual(root.IssuerName.RawData) ||
            !root.GetCertHashString(HashAlgorithmName.SHA256).Equals(RootSha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"Filen {file} är inte utfärdad under den förväntade rotutfärdaren.");
        var leaf = chain[0];
        if (SingleName(leaf, CommonNameType) != CommonName || SingleName(leaf, OrganizationType) != Organization)
            throw new InvalidDataException($"Filen {file} har en annan utgivare än den förväntade.");
        var usages = leaf.Extensions.OfType<X509EnhancedKeyUsageExtension>()
            .SelectMany(extension => extension.EnhancedKeyUsages.Cast<Oid>()).Select(oid => oid.Value).ToHashSet();
        if (!usages.Contains(CodeSigning) || !usages.Contains(IdentityKeyUsage))
            throw new InvalidDataException($"Utgivarcertifikatet för {file} saknar den förväntade profilidentiteten.");
    }

    // Exactly one, single-valued attribute of this type; anything else does not match.
    static string? SingleName(X509Certificate2 certificate, string type)
    {
        string? found = null;
        foreach (var name in certificate.SubjectName.EnumerateRelativeDistinguishedNames()) {
            if (name.HasMultipleElements) return null;
            if (name.GetSingleElementType().Value != type) continue;
            if (found != null) return null;
            found = name.GetSingleElementValue();
        }
        return found;
    }

    [GeneratedRegex(@"^[0-2](\.(0|[1-9][0-9]{0,9}))+$")]
    private static partial Regex ObjectIdentifier();
}
