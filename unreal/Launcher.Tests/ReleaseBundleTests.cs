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
    public void TaggedBundleContainsTheAssemblyWithTheExpectedPublicKeyAndPublisherIdentity()
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
            // The stable publisher identity from this checkout, never a short-lived leaf certificate (#2277).
            using (var identity = assembly.GetManifestResourceStream("Lunden.PublisherIdentity.json")
                ?? throw new InvalidDataException("Missing bundled publisher identity."))
            using (var identityText = new StreamReader(identity))
                Assert.Equal(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "publisher-identity.json")), identityText.ReadToEnd());
            Assert.DoesNotContain(assembly.GetCustomAttributes<AssemblyMetadataAttribute>(), attribute => attribute.Key == "LundenSignerSha256");
            using var key = assembly.GetManifestResourceStream("Lunden.ManifestKey.pem")
                ?? throw new InvalidDataException("Missing bundled manifest verification key.");
            using var text = new StreamReader(key);
            Assert.Equal(File.ReadAllText(Input("LUNDEN_PUBLIC_PEM_PATH")), text.ReadToEnd());
        }
        finally { context.Unload(); }
    }
}
