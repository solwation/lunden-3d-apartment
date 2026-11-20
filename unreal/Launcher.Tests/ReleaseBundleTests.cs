using System.Reflection;
using System.Runtime.Loader;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class ReleaseBundleTests
{
    sealed class PublishedLauncherFact : FactAttribute
    {
        public PublishedLauncherFact()
        {
            if (Environment.GetEnvironmentVariable("LUNDEN_PUBLISHED_LAUNCHER") == null)
                Skip = "Requires the tagged single-file publish and its public release inputs.";
        }
    }

    [PublishedLauncherFact]
    public void TaggedBundleContainsTheAssemblyWithTheExpectedPublicKeyAndSigner()
    {
        static string Input(string name) => Environment.GetEnvironmentVariable(name)
            ?? throw new InvalidOperationException($"Missing release input {name}.");
        var managedPath = Path.GetFullPath(Input("LUNDEN_PUBLISHED_ASSEMBLY"));
        var managedBytes = File.ReadAllBytes(managedPath);
        var bundle = File.ReadAllBytes(Input("LUNDEN_PUBLISHED_LAUNCHER"));
        // Single-file publishing leaves assemblies uncompressed in this workflow.
        Assert.True(managedBytes.Length > 0 && bundle.AsSpan().IndexOf(managedBytes) >= 0,
            "The launcher bundle does not contain the verified managed assembly.");
        var context = new AssemblyLoadContext("release-check", isCollectible: true);
        try
        {
            var assembly = context.LoadFromAssemblyPath(managedPath);
            Assert.Equal(Input("LUNDEN_RELEASE_VERSION"), assembly.GetName().Version!.ToString(3));
            var pin = assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
                .Single(attribute => attribute.Key == "LundenSignerSha256").Value;
            Assert.Equal(Input("LUNDEN_SIGNER_SHA256"), pin, ignoreCase: true);
            using var key = assembly.GetManifestResourceStream("Lunden.ManifestKey.pem")
                ?? throw new InvalidDataException("Missing bundled manifest verification key.");
            using var text = new StreamReader(key);
            Assert.Equal(File.ReadAllText(Input("LUNDEN_PUBLIC_PEM_PATH")), text.ReadToEnd());
        }
        finally { context.Unload(); }
    }
}
