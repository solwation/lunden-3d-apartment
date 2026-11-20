# Run on Windows with a .NET SDK (9 or later). Test only copies in a fresh temporary directory.
[CmdletBinding()]
param([string]$SignedBinary = (Get-Command dotnet.exe -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../Launcher/Authenticode.cs'
$catalogSource = Join-Path $PSScriptRoot '../Launcher/CatalogSignature.cs'
$getFingerprint = Join-Path $PSScriptRoot '../../tools/unreal-engine/get-signer-fingerprint.ps1'
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
    if ((& $getFingerprint -Path signed.exe -ExpectedFileSha256 $fileHash) -ne $pin) {
        throw 'Release fingerprint did not match the trusted signing certificate.'
    }
    try {
        & $getFingerprint -Path signed.exe -ExpectedFileSha256 ('0' * 64)
        throw 'Expected checksum rejection.'
    } catch {
        if ($_.Exception.Message -notmatch 'differs from the published SHA-256') { throw }
    }
    Write-Output 'PASS release fingerprint and checksum rejection'

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
    Set-Content -LiteralPath Probe.csproj -Value @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net$major.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
"@
    Set-Content -LiteralPath Program.cs -Value @'
using Lunden.Launcher;

var pin = args[0];
Authenticode.Verify("signed.exe", pin.ToLowerInvariant());
Console.WriteLine("PASS trusted embedded signature with expected publisher");

void Reject(string file, string expected, string message)
{
    try { Authenticode.Verify(file, expected); }
    catch (InvalidDataException ex) when (ex.Message.Contains(message, StringComparison.Ordinal)) { return; }
    throw new Exception($"Unexpected verification outcome for {file}");
}

var wrong = (pin[0] == '0' ? "1" : "0") + pin[1..];
Reject("signed.exe", wrong, "annan utgivare");
Console.WriteLine("PASS trusted signature with wrong publisher rejected");

Reject(typeof(Authenticode).Assembly.Location, pin, "Windows kunde inte verifiera");
Console.WriteLine("PASS unsigned managed PE rejected");

var bytes = File.ReadAllBytes("signed.exe");
bytes[0x40] ^= 1; // Covered DOS stub byte. Preserve the PE headers and signature table.
File.WriteAllBytes("damaged.exe", bytes);
Reject("damaged.exe", pin, "Windows kunde inte verifiera");
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
    dotnet run --project Probe.csproj -- $pin $catalogPin
    if ($LASTEXITCODE -ne 0) { throw "Authenticode probe failed ($LASTEXITCODE)" }
    $damagedHash = (Get-FileHash -LiteralPath damaged.exe -Algorithm SHA256).Hash
    try {
        & $getFingerprint -Path damaged.exe -ExpectedFileSha256 $damagedHash
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
