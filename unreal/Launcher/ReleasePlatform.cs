using System.Runtime.InteropServices;

namespace Lunden.Launcher;

internal static class ReleasePlatform
{
    internal static string Current => RuntimeInformation.ProcessArchitecture != Architecture.X64
        ? throw new PlatformNotSupportedException("Lunden kräver x86_64.")
        : OperatingSystem.IsWindows() ? "win-x64" : OperatingSystem.IsLinux() ? "linux-x64"
        : throw new PlatformNotSupportedException("Lunden stöder Windows och Linux.");

    internal static string ManifestName(string platform, string channel) =>
        "lunden-manifest" + (platform == "linux-x64" ? "-linux-x64" : "") + (channel == "test" ? "-test" : "") + ".json";

    internal static void VerifyLinuxExecutable(string path)
    {
        using var input = File.OpenRead(path);
        Span<byte> header = stackalloc byte[20];
        input.ReadExactly(header);
        if (!header[..7].SequenceEqual(new byte[] { 0x7f, 0x45, 0x4c, 0x46, 2, 1, 1 })
            || header[18] != 62 || header[19] != 0)
            throw new InvalidDataException("Programfilen är inte ELF x86_64 för Linux.");
    }

    internal static void ApplyMode(string path, ReleaseFile file, string platform)
    {
        if (platform != "linux-x64") return;
        if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("Linux-paket installeras på Linux.");
        // Downloaded bytes have no executable bit. Apply only the signed manifest's declaration,
        // also to reused/staged files, before the installation can become active.
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite
            | UnixFileMode.GroupRead | UnixFileMode.OtherRead | (file.Executable
                ? UnixFileMode.UserExecute | UnixFileMode.GroupExecute | UnixFileMode.OtherExecute : 0));
    }
}
