# No signing credentials or certificate store changes. Use a timestamped binary already on the runner.
[CmdletBinding()]
param([string]$Fixture = (Get-Command dotnet.exe -CommandType Application | Select-Object -First 1).Source)
$ErrorActionPreference = 'Stop'
$pack = Join-Path (Split-Path $PSScriptRoot -Parent) 'package-signed-launcher.ps1'
$root = Join-Path ([IO.Path]::GetTempPath()) ('lunden-signed-package-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
try {
    $exe = Join-Path $root 'Lunden.exe'
    [IO.File]::Copy($Fixture, $exe)
    (Get-Item -LiteralPath $exe).IsReadOnly = $false
    $signature = Get-AuthenticodeSignature -LiteralPath $exe
    if ($signature.Status -ne 'Valid' -or $null -eq $signature.TimeStamperCertificate) {
        throw 'A valid, timestamped signed Windows test fixture is required.'
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $pin = [BitConverter]::ToString($sha.ComputeHash($signature.SignerCertificate.RawData)).Replace('-', '') }
    finally { $sha.Dispose() }
    $out = Join-Path $root 'out'
    $argsForPack = @{ Launcher = $exe; Version = '0.4.2'; SignerSha256 = $pin; ManifestKeySha256 = ('ab' * 32)
        ExpectedPublisher = $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
        Commit = ('a' * 40); OutputDirectory = $out }
    & $pack @argsForPack
    $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    $sums = [IO.File]::ReadAllLines((Join-Path $out 'SHA256SUMS'))
    $setup = Join-Path $out 'Lunden-Setup-0.4.2-win-x64.exe'
    if ($sums.Count -ne 2 -or $sums[0] -cne "$hash  Lunden.exe" -or $sums[1] -cne "$hash  Lunden-Setup-0.4.2-win-x64.exe" -or
        (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne $hash) { throw 'Wrong post-signing file hashes.' }
    $record = Get-Content -Raw -LiteralPath (Join-Path $out 'launcher-build.json') | ConvertFrom-Json
    if ($record.signerCertificateSha256 -ne $pin -or $record.launcherSha256 -ne $hash -or $record.tag -cne 'v0.4.2') {
        throw 'Wrong signed artifact provenance.'
    }
    Write-Output 'PASS signed launcher, identical setup copy and post-signing checksums'
    foreach ($case in 'subject', 'publisher', 'altered', 'unsigned') {
        $argsForPack.ExpectedPublisher = $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
        if ($case -eq 'subject') { $argsForPack.ExpectedPublisher = 'Different publisher' }
        $argsForPack.SignerSha256 = $pin
        $argsForPack.OutputDirectory = Join-Path $root $case
        if ($case -eq 'publisher') { $argsForPack.SignerSha256 = '0' * 64 }
        if ($case -eq 'altered') {
            $bytes = [IO.File]::ReadAllBytes($exe)
            $bytes[64] = $bytes[64] -bxor 1
            [IO.File]::WriteAllBytes($exe, $bytes)
        }
        if ($case -eq 'unsigned') { [IO.File]::WriteAllBytes($exe, [byte[]](0x4d,0x5a,0,0)) }
        $failed = $false
        try { & $pack @argsForPack } catch { $failed = $true }
        if (-not $failed -or (Test-Path -LiteralPath $argsForPack.OutputDirectory)) { throw "Accepted $case input." }
        Write-Output "PASS rejected $case input without producing an artifact"
    }
} finally {
    if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}
