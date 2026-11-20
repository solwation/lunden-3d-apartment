# No signing credentials or certificate store changes. Use a timestamped binary already on the runner.
[CmdletBinding()]
param([string]$Fixture = (Get-Command dotnet.exe -CommandType Application | Select-Object -First 1).Source)
$ErrorActionPreference = 'Stop'
$pack = Join-Path (Split-Path $PSScriptRoot -Parent) 'package-signed-launcher.ps1'
$getIdentity = Join-Path (Split-Path $PSScriptRoot -Parent) 'get-signer-identity.ps1'
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
    $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    # The fixture's own stable identity. A Microsoft product signature has no Artifact Signing
    # identity usage, so the test stands in the code-signing usage every Authenticode leaf has.
    $observed = & $getIdentity -Path $exe -ExpectedFileSha256 $hash | ConvertFrom-Json
    function Write-Identity([string]$Name, [hashtable]$Change = @{}) {
        $identity = [ordered]@{ commonName = $observed.subject; organization = $observed.organization
            rootSha256 = $observed.rootSha256; identityKeyUsage = '1.3.6.1.5.5.7.3.3' }
        foreach ($key in $Change.Keys) { $identity[$key] = $Change[$key] }
        $path = Join-Path $root "$Name-identity.json"
        [IO.File]::WriteAllText($path, ($identity | ConvertTo-Json))
        $path
    }
    $out = Join-Path $root 'out'
    $argsForPack = @{ Launcher = $exe; Version = '0.4.2'; ManifestKeySha256 = ('ab' * 32); ExpectedSubject = $observed.subject
        PublisherIdentity = (Write-Identity 'fixture'); Commit = ('a' * 40); OutputDirectory = $out }
    & $pack @argsForPack
    $sums = [IO.File]::ReadAllLines((Join-Path $out 'SHA256SUMS'))
    $setup = Join-Path $out 'Lunden-Setup-0.4.2-win-x64.exe'
    if ($sums.Count -ne 2 -or $sums[0] -cne "$hash  Lunden.exe" -or $sums[1] -cne "$hash  Lunden-Setup-0.4.2-win-x64.exe" -or
        (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne $hash) { throw 'Wrong post-signing file hashes.' }
    $record = Get-Content -Raw -LiteralPath (Join-Path $out 'launcher-build.json') | ConvertFrom-Json
    if ($record.signer.commonName -cne $observed.subject -or $record.signer.organization -cne $observed.organization -or
        $record.signer.rootSha256 -cne $observed.rootSha256 -or $record.signer.identityKeyUsage -cne '1.3.6.1.5.5.7.3.3' -or
        $record.signer.leafCertificateSha256 -cne $observed.leafSha256 -or $record.launcherSha256 -ne $hash -or $record.tag -cne 'v0.4.2') {
        throw 'Wrong signed artifact provenance.'
    }
    Write-Output 'PASS signed launcher, identical setup copy, post-signing checksums and publisher identity'
    $cases = [ordered]@{
        'configured subject' = @{ ExpectedSubject = 'Different publisher' }
        'common name' = @{ ExpectedSubject = 'Different publisher'; PublisherIdentity = (Write-Identity 'name' @{ commonName = 'Different publisher' }) }
        'organization' = @{ PublisherIdentity = (Write-Identity 'organization' @{ organization = 'Different organization' }) }
        'root' = @{ PublisherIdentity = (Write-Identity 'root' @{ rootSha256 = ('0' * 64) }) }
        'identity usage' = @{ PublisherIdentity = (Write-Identity 'usage' @{ identityKeyUsage = '1.3.6.1.4.1.311.97.1.0' }) }
        'altered' = @{}
        'unsigned' = @{}
    }
    foreach ($case in $cases.Keys) {
        $attempt = $argsForPack.Clone()
        foreach ($key in $cases[$case].Keys) { $attempt[$key] = $cases[$case][$key] }
        $attempt.OutputDirectory = Join-Path $root ($case -replace ' ', '-')
        if ($case -eq 'altered') {
            $bytes = [IO.File]::ReadAllBytes($exe)
            $bytes[64] = $bytes[64] -bxor 1
            [IO.File]::WriteAllBytes($exe, $bytes)
        }
        if ($case -eq 'unsigned') { [IO.File]::WriteAllBytes($exe, [byte[]](0x4d,0x5a,0,0)) }
        $failed = $false
        try { & $pack @attempt } catch { $failed = $true }
        if (-not $failed -or (Test-Path -LiteralPath $attempt.OutputDirectory)) { throw "Accepted $case input." }
        Write-Output "PASS rejected $case input without producing an artifact"
    }
} finally {
    if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}
