using System.Security.Cryptography;
using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class GeneratedManifestTests
{
    sealed class GeneratedFixtureFact : FactAttribute
    {
        public GeneratedFixtureFact()
        {
            if (Environment.GetEnvironmentVariable("LUNDEN_GENERATED_TEST_MANIFEST") is null)
                Skip = "Requires the make-manifest Node fixture from the preceding CI step.";
        }
    }

    [GeneratedFixtureFact]
    public void ActualNodeDraftIsAcceptedByTheSignedManifestReaderAndStockRuntime()
    {
        byte[] bytes = File.ReadAllBytes(Environment.GetEnvironmentVariable("LUNDEN_GENERATED_TEST_MANIFEST")!);
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        byte[] signature = key.SignData(bytes, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        var release = ReleaseManifest.Read(bytes, signature, key, "test");
        StockRuntime.Validate(release);
        Assert.Equal(ReleaseManifest.StockGameExe, release.EntryPoint);
        Assert.Equal(14, release.App.Files.Count(f => f.Authenticode));
        Assert.Equal(["chunk-0", "chunk-1", "chunk-2", "global"], release.Content.Packages.Select(p => p.Id));
        Assert.Equal(release.App.ContentAbi, release.Content.RequiresAbi);
    }
}
