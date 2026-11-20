using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;

namespace Lunden.Launcher;

internal static class CatalogSignature
{
    const uint CatalogChoice = 2; // WTD_CHOICE_CATALOG

    internal static void Verify(string path, string expectedLeafSha256)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Verifiering av Windows-katalogsignaturer kräver Windows.");
        string fullPath = Path.GetFullPath(path);
        using var file = File.Open(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        // Some installed Windows catalogs (including wd_mpextdeps.cat for DirectML) use
        // a SHA-1 member tag. StockRuntime independently pins the full file with SHA-256.
        if (VerifyMember(fullPath, file.SafeFileHandle, expectedLeafSha256, "SHA256", 32) ||
            VerifyMember(fullPath, file.SafeFileHandle, expectedLeafSha256, "SHA1", 20))
            return;
        throw new InvalidDataException($"Ingen betrodd installerad katalog med förväntad utgivare för {Path.GetFileName(path)}.");
    }

    static bool VerifyMember(string path, SafeFileHandle file, string signer, string algorithm, int hashSize)
    {
        if (!CryptCATAdminAcquireContext2(out var admin, IntPtr.Zero, algorithm, IntPtr.Zero, 0))
            return false;
        IntPtr catalog = IntPtr.Zero;
        try {
            byte[] hash = new byte[hashSize];
            uint length = (uint)hash.Length;
            if (!CryptCATAdminCalcHashFromFileHandle2(admin, file, ref length, hash, 0) || length != hash.Length)
                return false;

            string member = Convert.ToHexString(hash);
            while ((catalog = CryptCATAdminEnumCatalogFromHash(admin, hash, length, 0, ref catalog)) != IntPtr.Zero) {
                var info = new CatalogInfo { Size = (uint)Marshal.SizeOf<CatalogInfo>() };
                if (!CryptCATCatalogInfoFromContext(catalog, ref info, 0)) continue;
                // WinVerifyTrust verifies the actual member using its open handle and the
                // catalog's named tag. It obtains its own hash with the same admin context.
                var subject = new TrustCatalogInfo {
                    Size = (uint)Marshal.SizeOf<TrustCatalogInfo>(), CatalogPath = info.Path,
                    MemberTag = member, MemberPath = path, MemberFile = file.DangerousGetHandle(), Admin = admin
                };
                try {
                    Authenticode.VerifyTrust(path, signer, CatalogChoice, subject);
                    return true;
                } catch (InvalidDataException) {
                    // A member can occur in several catalogs with different signers.
                }
            }
            return false;
        } finally {
            // EnumCatalogFromHash releases the previous context when advancing.
            if (catalog != IntPtr.Zero) CryptCATAdminReleaseCatalogContext(admin, catalog, 0);
            CryptCATAdminReleaseContext(admin, 0);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct CatalogInfo
    {
        public uint Size;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Path;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct TrustCatalogInfo
    {
        public uint Size, Version;
        [MarshalAs(UnmanagedType.LPWStr)] public string CatalogPath, MemberTag, MemberPath;
        public IntPtr MemberFile, CalculatedHash;
        public uint HashSize;
        public IntPtr CatalogContext, Admin;
    }

    [DllImport("wintrust.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    static extern bool CryptCATAdminAcquireContext2(out IntPtr admin, IntPtr subsystem, string algorithm, IntPtr policy, uint flags);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    static extern bool CryptCATAdminCalcHashFromFileHandle2(IntPtr admin, SafeFileHandle file, ref uint size, [Out] byte[] hash, uint flags);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    static extern IntPtr CryptCATAdminEnumCatalogFromHash(IntPtr admin, byte[] hash, uint size, uint flags, ref IntPtr previous);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    static extern bool CryptCATCatalogInfoFromContext(IntPtr catalog, ref CatalogInfo info, uint flags);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    static extern bool CryptCATAdminReleaseCatalogContext(IntPtr admin, IntPtr catalog, uint flags);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    static extern bool CryptCATAdminReleaseContext(IntPtr admin, uint flags);
}
