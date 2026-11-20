# Run on Windows with a .NET SDK (9 or later). Test only copies in a fresh temporary directory.
[CmdletBinding()]
param([string]$SignedBinary = (Get-Command dotnet.exe -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../Launcher/Authenticode.cs'
$catalogSource = Join-Path $PSScriptRoot '../Launcher/CatalogSignature.cs'
$identitySource = Join-Path $PSScriptRoot '../Launcher/SignerIdentity.cs'
$getIdentity = Join-Path $PSScriptRoot '../../tools/unreal-engine/get-signer-identity.ps1'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('Lunden-Authenticode-' + [Guid]::NewGuid().ToString('N'))
New-Item -Type Directory -Path $temp | Out-Null
Push-Location $temp
try {
    Copy-Item -LiteralPath $SignedBinary -Destination signed.exe
    $signature = Get-AuthenticodeSignature -LiteralPath .\signed.exe
    if ($signature.Status -ne 'Valid' -or $signature.SignatureType -ne 'Authenticode') {
        throw 'The positive fixture requires an embedded Windows-trusted signature.'
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $pin = [BitConverter]::ToString($sha.ComputeHash($signature.SignerCertificate.RawData)).Replace('-', '') }
    finally { $sha.Dispose() }

    $fileHash = (Get-FileHash -LiteralPath signed.exe -Algorithm SHA256).Hash
    $observed = & $getIdentity -Path signed.exe -ExpectedFileSha256 $fileHash | ConvertFrom-Json
    if ($observed.leafSha256 -ne $pin -or $observed.subject -cne $signature.SignerCertificate.GetNameInfo('SimpleName', $false) -or
        $observed.rootSha256 -notmatch '^[A-F0-9]{64}$' -or $observed.keyUsages -notcontains '1.3.6.1.5.5.7.3.3') {
        throw 'The release identity helper did not report the trusted signing certificate.'
    }
    $expected = @{ ExpectedSubject = $observed.subject; ExpectedOrganization = $observed.organization
        ExpectedRootSha256 = $observed.rootSha256; ExpectedIdentityKeyUsage = '1.3.6.1.5.5.7.3.3' }
    [void](& $getIdentity -Path signed.exe -ExpectedFileSha256 $fileHash @expected)
    foreach ($case in @(@{ ExpectedFileSha256 = ('0' * 64); Message = 'differs from the published SHA-256' },
            @{ ExpectedSubject = 'Different publisher'; Message = 'expected publisher subject' },
            @{ ExpectedOrganization = 'Different organization'; Message = 'expected publisher subject' },
            @{ ExpectedRootSha256 = ('0' * 64); Message = 'expected root certificate' },
            @{ ExpectedIdentityKeyUsage = '1.3.6.1.4.1.311.97.1.0'; Message = 'expected identity key usage' })) {
        $attempt = $expected.Clone(); $attempt.ExpectedFileSha256 = $fileHash
        foreach ($key in $case.Keys) { if ($key -ne 'Message') { $attempt[$key] = $case[$key] } }
        try {
            & $getIdentity -Path signed.exe @attempt
            throw 'Expected identity rejection.'
        } catch {
            if ($_.Exception.Message -notmatch $case.Message) { throw }
        }
    }
    Write-Output 'PASS release identity, checksum and identity mismatch rejection'

    # Use a file from the runner's own installed catalog. No SDK/vendor DLL is distributed.
    $os = [Environment]::SystemDirectory
    $catalogPin = $null
    foreach ($name in 'DirectML.dll', 'ntdll.dll', 'kernel32.dll', 'user32.dll', 'winhttp.dll', 'advapi32.dll', 'crypt32.dll', 'cmd.exe') {
        $candidate = Join-Path $os $name
        if (!(Test-Path -LiteralPath $candidate)) { continue }
        $member = Get-AuthenticodeSignature -LiteralPath $candidate
        if ($member.Status -eq 'Valid' -and $member.SignatureType -eq 'Catalog') {
            Copy-Item -LiteralPath $candidate -Destination catalog-member.dll
            $catalogPin = $member.SignerCertificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256)
            Write-Output "Windows catalog fixture: $name"
            break
        }
    }
    if (!$catalogPin) { throw "No Windows-trusted OS catalog member found in $os." }

    $major = [int]((dotnet --version).Split('.')[0])
    if ($major -lt 9) { throw 'Install a .NET SDK version 9 or later to run this test.' }
    Copy-Item -LiteralPath $source -Destination Authenticode.cs
    Copy-Item -LiteralPath $catalogSource -Destination CatalogSignature.cs
    Copy-Item -LiteralPath $identitySource -Destination SignerIdentity.cs
    Set-Content -LiteralPath Probe.csproj -Value @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net$major.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
"@
    Set-Content -LiteralPath Program.cs -Value @'
using Lunden.Launcher;

var pin = args[0];
// The fixture's stable identity: its subject names and root. A Microsoft product signature carries
// no Artifact Signing identity usage, so the code-signing usage stands in for it here.
var identity = new SignerIdentity(args[2], args[3], args[4], SignerIdentity.CodeSigning);
Authenticode.Verify("signed.exe", identity);
Console.WriteLine("PASS trusted embedded timestamped signature with expected publisher identity");
Authenticode.Verify("signed.exe", pin.ToLowerInvariant());
Console.WriteLine("PASS trusted embedded signature with expected vendor leaf");

void Reject(string file, SignerIdentity expected, string message)
{
    try { Authenticode.Verify(file, expected); }
    catch (InvalidDataException ex) when (ex.Message.Contains(message, StringComparison.Ordinal)) { return; }
    throw new Exception($"Unexpected verification outcome for {file}");
}

Reject("signed.exe", identity with { CommonName = "Different publisher" }, "annan utgivare");
Reject("signed.exe", identity with { Organization = "Different organization" }, "annan utgivare");
Console.WriteLine("PASS trusted signature with wrong publisher name rejected");
Reject("signed.exe", identity with { RootSha256 = new string('0', 64) }, "rotutfärdaren");
Console.WriteLine("PASS trusted signature under another root rejected");
Reject("signed.exe", identity with { IdentityKeyUsage = "1.3.6.1.4.1.311.97.1.0" }, "profilidentiteten");
Console.WriteLine("PASS trusted signature without the identity usage rejected");
try { Authenticode.Verify("signed.exe", (pin[0] == '0' ? "1" : "0") + pin[1..]); throw new Exception("Accepted wrong vendor leaf"); }
catch (InvalidDataException ex) when (ex.Message.Contains("annan utgivare", StringComparison.Ordinal)) { }
Console.WriteLine("PASS trusted signature with wrong vendor leaf rejected");

Reject(typeof(Authenticode).Assembly.Location, identity, "Windows kunde inte verifiera");
Console.WriteLine("PASS unsigned managed PE rejected");

var bytes = File.ReadAllBytes("signed.exe");
bytes[0x40] ^= 1; // Covered DOS stub byte. Preserve the PE headers and signature table.
File.WriteAllBytes("damaged.exe", bytes);
Reject("damaged.exe", identity, "Windows kunde inte verifiera");
Console.WriteLine("PASS altered signed PE rejected");

var catalogPin = args[1];
CatalogSignature.Verify("catalog-member.dll", catalogPin);
Console.WriteLine("PASS copied member of trusted installed catalog with expected publisher");

void RejectCatalog(string file, string expected)
{
    try { CatalogSignature.Verify(file, expected); }
    catch (InvalidDataException) { return; }
    throw new Exception($"Unexpected catalog acceptance for {file}");
}

var otherPin = (catalogPin[0] == '0' ? "1" : "0") + catalogPin[1..];
RejectCatalog("catalog-member.dll", otherPin);
Console.WriteLine("PASS catalog with unapproved publisher rejected");
RejectCatalog(typeof(CatalogSignature).Assembly.Location, catalogPin);
Console.WriteLine("PASS PE absent from installed catalogs rejected");

bytes = File.ReadAllBytes("catalog-member.dll");
bytes[0x40] ^= 1;
File.WriteAllBytes("catalog-member.dll", bytes);
RejectCatalog("catalog-member.dll", catalogPin);
Console.WriteLine("PASS altered catalog member rejected");
'@
    dotnet run --project Probe.csproj -- $pin $catalogPin $observed.subject $observed.organization $observed.rootSha256
    if ($LASTEXITCODE -ne 0) { throw "Authenticode probe failed ($LASTEXITCODE)" }
    $damagedHash = (Get-FileHash -LiteralPath damaged.exe -Algorithm SHA256).Hash
    try {
        & $getIdentity -Path damaged.exe -ExpectedFileSha256 $damagedHash
        throw 'Expected signature rejection.'
    } catch {
        if ($_.Exception.Message -notmatch 'Expected a valid, timestamped, embedded Authenticode signature') { throw }
    }
    Write-Output 'PASS damaged reference rejected even with a matching file hash'
}
finally {
    Pop-Location
    Remove-Item -LiteralPath $temp -Recurse -Force
}
