using System;
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

    internal static void Verify(string path, string expectedSigner)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Authenticode-verifiering kräver Windows.");
        string fullPath = Path.GetFullPath(path);
        using var file = File.Open(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var info = new TrustFileInfo { Size = (uint)Marshal.SizeOf<TrustFileInfo>(), Path = fullPath, Handle = file.SafeFileHandle.DangerousGetHandle() };
        VerifyTrust(fullPath, expectedSigner, FileChoice, info);
    }

    internal static void VerifyTrust<T>(string path, string expectedSigner, uint choice, T subject) where T : struct
    {
        if (expectedSigner is null || expectedSigner.Length != 64 || !Array.TrueForAll(expectedSigner.ToCharArray(), Uri.IsHexDigit))
            throw new InvalidDataException("Utgivarens SHA-256-avtryck måste bestå av 64 hexadecimala tecken.");

        IntPtr infoPtr = Marshal.AllocHGlobal(Marshal.SizeOf<T>());
        Marshal.StructureToPtr(subject, infoPtr, false);
        var data = new TrustData
        {
            Size = (uint)Marshal.SizeOf<TrustData>(), UiChoice = NoUi, UnionChoice = choice,
            SubjectInfo = infoPtr, StateAction = VerifyState, ProviderFlags = CheckChainExceptRoot
        };
        try
        {
            int result = WinVerifyTrust(new IntPtr(-1), in VerifyV2, ref data);
            if (result != 0)
                throw new InvalidDataException($"Windows kunde inte verifiera signaturen för {Path.GetFileName(path)} (0x{result:X8}).");

            // Read the leaf from this exact successful verification, including its chosen signature
            // on multiply signed files. A timestamp countersigner does not identify the publisher.
            IntPtr provider = WTHelperProvDataFromStateData(data.State);
            IntPtr signer = provider == IntPtr.Zero ? IntPtr.Zero : WTHelperGetProvSignerFromChain(provider, 0, false, 0);
            IntPtr cert = signer == IntPtr.Zero ? IntPtr.Zero : WTHelperGetProvCertFromChain(signer, 0);
            IntPtr context = cert == IntPtr.Zero ? IntPtr.Zero : Marshal.PtrToStructure<ProviderCertHeader>(cert).Certificate;
            if (context == IntPtr.Zero)
                throw new InvalidDataException("Windows returnerade inget verifierat utgivarcertifikat.");
            using var leaf = new X509Certificate2(context);
            if (!string.Equals(leaf.GetCertHashString(HashAlgorithmName.SHA256), expectedSigner, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Filen {Path.GetFileName(path)} har en annan utgivare än den förväntade.");
        }
        finally
        {
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
