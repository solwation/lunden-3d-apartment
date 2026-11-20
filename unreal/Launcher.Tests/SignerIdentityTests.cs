using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json.Nodes;
using Xunit;

namespace Lunden.Launcher.Tests;

// Trust in the project's publisher survives Artifact Signing's 72-hour leaf rotation (#2277).
public sealed class SignerIdentityTests
{
    // Observed on booster-ai's signed installers (public certificate data, docs/development/unreal.md).
    static readonly SignerIdentity Svep = new("Svep Design Center AB", "Svep Design Center AB",
        "5367F20C7ADE0E2BCA790915056D086B720C33C1FA2A2661ACF787E3292E1270",
        "1.3.6.1.4.1.311.97.113607477.134038250.983402513.388203704");

    const string Usage = "1.3.6.1.4.1.311.97.1111.2222.3333.4444";
    const string PublicTrust = "1.3.6.1.4.1.311.97.1.0";
    static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;

    sealed record Authority(X509Certificate2 Certificate, ECDsa Key);

    static Authority Root(string name = "Test Identity Root")
    {
        var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest($"CN={name}, O=Test Authority", key, HashAlgorithmName.SHA256);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        return new(request.CreateSelfSigned(Now.AddYears(-1), Now.AddYears(10)), key);
    }

    static Authority Issue(Authority issuer, string subject, string[]? usages = null)
    {
        var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest(subject, key, HashAlgorithmName.SHA256);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(usages == null, false, 0, true));
        if (usages != null) {
            var collection = new OidCollection();
            foreach (var usage in usages) collection.Add(new Oid(usage));
            request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(collection, false));
        }
        // Short-lived like an Artifact Signing leaf; the signature's timestamp keeps it valid in Windows.
        var certificate = request.Create(issuer.Certificate.SubjectName, X509SignatureGenerator.CreateForECDsa(issuer.Key),
            Now.AddDays(-1), usages == null ? Now.AddYears(5) : Now.AddDays(2), RandomNumberGenerator.GetBytes(12));
        return new(certificate, key);
    }

    const string Publisher = "CN=Test Publisher AB, O=Test Publisher AB, L=Lund, S=Skåne, C=SE";
    static readonly string[] LeafUsages = [PublicTrust, SignerIdentity.CodeSigning, Usage];

    static SignerIdentity Identity(Authority root) => new("Test Publisher AB", "Test Publisher AB", root.Certificate.GetCertHashString(HashAlgorithmName.SHA256), Usage);

    static X509Certificate2[] Chain(Authority root, Authority intermediate, Authority leaf) =>
        [leaf.Certificate, intermediate.Certificate, root.Certificate];

    static void Rejected(SignerIdentity identity, IReadOnlyList<X509Certificate2> chain, string message, bool timestamped = true) =>
        Assert.Contains(message, Assert.Throws<InvalidDataException>(() => identity.Check(chain, timestamped, "Lunden.exe")).Message);

    [Fact]
    public void TwoLeavesOfTheSameIdentityFromDifferentIntermediatesAreAccepted()
    {
        var root = Root();
        var pca = Issue(root, "CN=Test Code Signing PCA, O=Test Authority");
        var aoc = Issue(pca, "CN=Test CS AOC CA 03, O=Test Authority");
        var eoc = Issue(pca, "CN=Test CS EOC CA 04, O=Test Authority");
        var monday = Issue(aoc, Publisher, LeafUsages);
        var thursday = Issue(eoc, Publisher, LeafUsages);
        Assert.NotEqual(monday.Certificate.GetCertHashString(HashAlgorithmName.SHA256), thursday.Certificate.GetCertHashString(HashAlgorithmName.SHA256));
        Identity(root).Check([monday.Certificate, aoc.Certificate, pca.Certificate, root.Certificate], true, "Lunden.exe");
        Identity(root).Check([thursday.Certificate, eoc.Certificate, pca.Certificate, root.Certificate], true, "Lunden.exe");
    }

    [Fact]
    public void AnotherPublisherIsRejectedEvenUnderTheSameRoot()
    {
        var root = Root();
        var ca = Issue(root, "CN=Test CS EOC CA 04, O=Test Authority");
        var identity = Identity(root);
        foreach (var subject in new[] {
            "CN=Other Publisher AB, O=Other Publisher AB, C=SE",
            "CN=Test Publisher AB, O=Other Publisher AB, C=SE",
            "CN=Other Publisher AB, O=Test Publisher AB, C=SE",
            "CN=Test Publisher AB, C=SE",
            "CN=Test Publisher AB, CN=Test Publisher AB, O=Test Publisher AB",
            "CN=test publisher ab, O=test publisher ab" })
            Rejected(identity, Chain(root, ca, Issue(ca, subject, LeafUsages)), "annan utgivare");
    }

    [Fact]
    public void TheSameNameUnderAnotherRootIsRejected()
    {
        var root = Root();
        var impostor = Root(); // Same names, different key and therefore a different root certificate.
        var ca = Issue(impostor, "CN=Test CS EOC CA 04, O=Test Authority");
        Rejected(Identity(root), Chain(impostor, ca, Issue(ca, Publisher, LeafUsages)), "rotutfärdaren");
        // A chain that stops at an intermediate is not anchored, even if that intermediate is genuine.
        var genuine = Issue(root, "CN=Test CS EOC CA 04, O=Test Authority");
        var leaf = Issue(genuine, Publisher, LeafUsages);
        Rejected(Identity(root) with { RootSha256 = genuine.Certificate.GetCertHashString(HashAlgorithmName.SHA256) },
            [leaf.Certificate, genuine.Certificate], "rotutfärdaren");
    }

    [Fact]
    public void ALeafWithoutTheIdentityOrCodeSigningUsageIsRejected()
    {
        var root = Root();
        var ca = Issue(root, "CN=Test CS EOC CA 04, O=Test Authority");
        string message = "profilidentiteten";
        Rejected(Identity(root), Chain(root, ca, Issue(ca, Publisher, [PublicTrust, SignerIdentity.CodeSigning])), message);
        Rejected(Identity(root), Chain(root, ca, Issue(ca, Publisher, [PublicTrust, SignerIdentity.CodeSigning, "1.3.6.1.4.1.311.97.9.9.9.9"])), message);
        Rejected(Identity(root), Chain(root, ca, Issue(ca, Publisher, [PublicTrust, Usage])), message);
    }

    [Fact]
    public void AnUntimestampedOrBrokenChainIsRejected()
    {
        var root = Root();
        var ca = Issue(root, "CN=Test CS EOC CA 04, O=Test Authority");
        var other = Issue(root, "CN=Test CS AOC CA 03, O=Test Authority");
        var leaf = Issue(ca, Publisher, LeafUsages);
        Rejected(Identity(root), Chain(root, ca, leaf), "tidsstämpel", timestamped: false);
        Rejected(Identity(root), Chain(root, other, leaf), "bruten");
        Rejected(Identity(root), [leaf.Certificate], "ofullständig");
        Rejected(Identity(root), [], "ofullständig");
    }

    [Fact]
    public void TheLauncherCompilesInTheReviewedIdentityAndNoLeaf()
    {
        Assert.Equal(Svep, SignerIdentity.Compiled);
        var json = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "publisher-identity.json")))!.AsObject();
        Assert.Equal(["commonName", "organization", "rootSha256", "identityKeyUsage"], json.Select(property => property.Key));
    }

    [Fact]
    public void AnIncompleteIdentityIsRejectedBeforeAnySignatureIsTrusted()
    {
        foreach (var identity in new[] {
            Svep with { CommonName = "" }, Svep with { CommonName = " Svep Design Center AB" }, Svep with { Organization = "\tSvep" },
            Svep with { RootSha256 = "" }, Svep with { RootSha256 = new('x', 64) }, Svep with { RootSha256 = new('a', 40) },
            Svep with { IdentityKeyUsage = "" }, Svep with { IdentityKeyUsage = "1.3.6.1.4.1.311.97.01" },
            Svep with { IdentityKeyUsage = "Svep" } })
            Assert.Throws<InvalidDataException>(identity.Validate);
        Svep.Validate();
    }

    // The real chains of two booster-ai releases signed by the same Artifact Signing profile days apart.
    [Fact]
    public void RealArtifactSigningLeavesFromDifferentDaysMatchTheObservedIdentity()
    {
        var certificates = new X509Certificate2Collection();
        certificates.ImportFromPemFile(Path.Combine(AppContext.BaseDirectory, "Fixtures", "artifact-signing-chains.pem"));
        X509Certificate2 Issuer(X509Certificate2 child) => certificates.Single(c => c.SubjectName.RawData.AsSpan().SequenceEqual(child.IssuerName.RawData));
        var leaves = certificates.Where(c => c.Subject.StartsWith("CN=Svep Design Center AB", StringComparison.Ordinal)).ToArray();
        Assert.Equal(2, leaves.Length);
        Assert.NotEqual(leaves[0].GetCertHashString(HashAlgorithmName.SHA256), leaves[1].GetCertHashString(HashAlgorithmName.SHA256));
        Assert.NotEqual(leaves[0].Issuer, leaves[1].Issuer);
        foreach (var leaf in leaves) {
            var chain = new List<X509Certificate2> { leaf };
            while (chain[^1].Subject != chain[^1].Issuer) chain.Add(Issuer(chain[^1]));
            Assert.Equal(4, chain.Count);
            Svep.Check(chain, true, "BoosterAI-Setup.exe");
            Rejected(Svep with { CommonName = "Svep Design Center" }, chain, "annan utgivare");
            Rejected(Svep with { Organization = "Svep Design Center" }, chain, "annan utgivare");
            Rejected(Svep with { RootSha256 = new('0', 64) }, chain, "rotutfärdaren");
            Rejected(Svep with { IdentityKeyUsage = "1.3.6.1.4.1.311.97.1.1" }, chain, "profilidentiteten");
            Rejected(Svep, chain, "tidsstämpel", timestamped: false);
        }
    }
}
