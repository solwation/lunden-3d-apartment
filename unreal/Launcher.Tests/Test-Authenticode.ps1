# Run on Windows with a .NET SDK (9 or later). Test only copies in a fresh temporary directory.
[CmdletBinding()]
param([string]$SignedBinary = (Get-Command dotnet.exe -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../Launcher/Authenticode.cs'
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

    $major = [int]((dotnet --version).Split('.')[0])
    if ($major -lt 9) { throw 'Install a .NET SDK version 9 or later to run this test.' }
    Copy-Item -LiteralPath $source -Destination Authenticode.cs
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
'@
    dotnet run --project Probe.csproj -- $pin
    if ($LASTEXITCODE -ne 0) { throw "Authenticode probe failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
    Remove-Item -LiteralPath $temp -Recurse -Force
}
