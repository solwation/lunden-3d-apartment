using System.Security.Cryptography;
using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

// Cross-checks tools/unreal-engine/sign-manifest.mjs: its .sig must pass the launcher's reader.
public sealed class NodeSignedManifestTests
{
    sealed class NodeSignedFixtureFact : FactAttribute
    {
        public NodeSignedFixtureFact()
        {
            if (Environment.GetEnvironmentVariable("LUNDEN_NODE_SIGNED_MANIFEST_DIR") is null)
                Skip = "Requires the sign-manifest Node fixture from the preceding CI step.";
        }
    }

    static ECDsa Key(string dir, string name)
    {
        var key = ECDsa.Create();
        key.ImportFromPem(File.ReadAllText(Path.Combine(dir, name)));
        return key;
    }

    [NodeSignedFixtureFact]
    public void NodeSignatureIsAcceptedOnlyForTheExactBytesAndKey()
    {
        string dir = Environment.GetEnvironmentVariable("LUNDEN_NODE_SIGNED_MANIFEST_DIR")!;
        byte[] bytes = File.ReadAllBytes(Path.Combine(dir, "lunden-manifest-test.json"));
        byte[] signature = File.ReadAllBytes(Path.Combine(dir, "lunden-manifest-test.json.sig"));
        using var key = Key(dir, "manifest-public.pem");
        using var other = Key(dir, "other-public.pem");
        Assert.Equal(64, signature.Length);
        Assert.Equal(3, ReleaseManifest.Read(bytes, signature, key, "test").Content.Version);
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(bytes, signature, other, "test"));
        byte[] tampered = (byte[])bytes.Clone();
        tampered[^2] ^= 1;
        Assert.Throws<InvalidDataException>(() => ReleaseManifest.Read(tampered, signature, key, "test"));
    }
}
