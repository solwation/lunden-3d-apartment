using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace Lunden.Launcher;

internal static class Authenticode
{
    // WINTRUST_ACTION_GENERIC_VERIFY_V2 applies the Windows Authenticode policy to a PE file.
    private static readonly Guid VerifyV2 = new("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");
    private const uint NoUi = 2, FileChoice = 1, VerifyState = 1, CloseState = 2;
    private const uint CheckChainExceptRoot = 0x80;

    // The project's own executables: any leaf of the compiled-in, stable publisher identity.
    internal static void Verify(string path, SignerIdentity expected)
    {
        expected.Validate();
        VerifyFile(path, (chain, timestamped) => expected.Check(chain, timestamped, Path.GetFileName(path)));
    }

    // Reviewed vendor images with fixed bytes keep the exact leaf they were signed with.
    internal static void Verify(string path, string expectedLeafSha256)
    {
        RequireSha256(expectedLeafSha256);
        VerifyFile(path, (chain, _) => CheckLeaf(chain[0], expectedLeafSha256, path));
    }

    internal static void RequireSha256(string? value)
    {
        if (value is null || value.Length != 64 || !Array.TrueForAll(value.ToCharArray(), Uri.IsHexDigit))
            throw new InvalidDataException("Utgivarens SHA-256-avtryck måste bestå av 64 hexadecimala tecken.");
    }

    internal static void CheckLeaf(X509Certificate2 leaf, string expectedLeafSha256, string path)
    {
        if (!string.Equals(leaf.GetCertHashString(HashAlgorithmName.SHA256), expectedLeafSha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"Filen {Path.GetFileName(path)} har en annan utgivare än den förväntade.");
    }

    static void VerifyFile(string path, Action<IReadOnlyList<X509Certificate2>, bool> accept)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Authenticode-verifiering kräver Windows.");
        string fullPath = Path.GetFullPath(path);
        using var file = File.Open(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var info = new TrustFileInfo { Size = (uint)Marshal.SizeOf<TrustFileInfo>(), Path = fullPath, Handle = file.SafeFileHandle.DangerousGetHandle() };
        VerifyTrust(fullPath, FileChoice, info, accept);
    }

    // accept receives the chain Windows verified for the primary signature (leaf first, root last)
    // and whether that signature carries a verified timestamp countersignature.
    internal static void VerifyTrust<T>(string path, uint choice, T subject, Action<IReadOnlyList<X509Certificate2>, bool> accept) where T : struct
    {
        IntPtr infoPtr = Marshal.AllocHGlobal(Marshal.SizeOf<T>());
        Marshal.StructureToPtr(subject, infoPtr, false);
        var data = new TrustData
        {
            Size = (uint)Marshal.SizeOf<TrustData>(), UiChoice = NoUi, UnionChoice = choice,
            SubjectInfo = infoPtr, StateAction = VerifyState, ProviderFlags = CheckChainExceptRoot
        };
        var chain = new List<X509Certificate2>();
        try
        {
            int result = WinVerifyTrust(new IntPtr(-1), in VerifyV2, ref data);
            if (result != 0)
                throw new InvalidDataException($"Windows kunde inte verifiera signaturen för {Path.GetFileName(path)} (0x{result:X8}).");

            // Read the chain from this exact successful verification, including its chosen signature
            // on multiply signed files. A timestamp countersigner does not identify the publisher.
            IntPtr provider = WTHelperProvDataFromStateData(data.State);
            IntPtr signer = provider == IntPtr.Zero ? IntPtr.Zero : WTHelperGetProvSignerFromChain(provider, 0, false, 0);
            for (uint index = 0; signer != IntPtr.Zero && index < 16; index++)
            {
                IntPtr cert = WTHelperGetProvCertFromChain(signer, index);
                IntPtr context = cert == IntPtr.Zero ? IntPtr.Zero : Marshal.PtrToStructure<ProviderCertHeader>(cert).Certificate;
                if (context == IntPtr.Zero) break;
                chain.Add(new X509Certificate2(context));
            }
            if (chain.Count == 0)
                throw new InvalidDataException("Windows returnerade inget verifierat utgivarcertifikat.");
            bool timestamped = WTHelperGetProvSignerFromChain(provider, 0, true, 0) != IntPtr.Zero;
            accept(chain, timestamped);
        }
        finally
        {
            foreach (var certificate in chain) certificate.Dispose();
            if (data.State != IntPtr.Zero)
            {
                data.StateAction = CloseState;
                WinVerifyTrust(new IntPtr(-1), in VerifyV2, ref data);
            }
            Marshal.DestroyStructure<T>(infoPtr);
            Marshal.FreeHGlobal(infoPtr);
        }
    }

    // Native wintrust.h layouts. WINTRUST_DATA's union contains one pointer.
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct TrustFileInfo
    {
        public uint Size;
        [MarshalAs(UnmanagedType.LPWStr)] public string Path;
        public IntPtr Handle, KnownSubject;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TrustData
    {
        public uint Size;
        public IntPtr PolicyCallbackData, SipClientData;
        public uint UiChoice, RevocationChecks, UnionChoice;
        public IntPtr SubjectInfo;
        public uint StateAction;
        public IntPtr State, UrlReference;
        public uint ProviderFlags, UiContext;
        public IntPtr SignatureSettings;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProviderCertHeader
    {
        public uint Size;
        public IntPtr Certificate;
    }

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern int WinVerifyTrust(IntPtr window, in Guid action, ref TrustData data);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern IntPtr WTHelperProvDataFromStateData(IntPtr state);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern IntPtr WTHelperGetProvSignerFromChain(IntPtr provider, uint signer, [MarshalAs(UnmanagedType.Bool)] bool counterSigner, uint counter);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern IntPtr WTHelperGetProvCertFromChain(IntPtr signer, uint certificate);
}
