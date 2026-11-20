# Verifies a known release file's checksum and its valid, timestamped, embedded Authenticode signature,
# then outputs the signer's stable identity as one line of JSON (#2277). Artifact Signing replaces the
# leaf certificate every 72 hours, so the identity is the subject name (CN and O), the SHA-256 of the
# chain's root certificate and the durable identity key usage that every leaf of a certificate profile carries.
# With -ExpectedSubject (CN), -ExpectedOrganization (O), -ExpectedRootSha256 and -ExpectedIdentityKeyUsage it
# also requires that identity.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedFileSha256,
    [string]$ExpectedSubject = '',
    [string]$ExpectedOrganization = '',
    [ValidatePattern('^([a-fA-F0-9]{64})?$')][string]$ExpectedRootSha256 = '',
    [ValidatePattern('^([0-2](\.(0|[1-9][0-9]*))+)?$')][string]$ExpectedIdentityKeyUsage = ''
)

$ErrorActionPreference = 'Stop'
$codeSigning = '1.3.6.1.5.5.7.3.3'
$expected = @($ExpectedSubject, $ExpectedOrganization, $ExpectedRootSha256, $ExpectedIdentityKeyUsage) | Where-Object { $_ -ne '' }
if ($expected.Count -notin 0, 4) { throw 'Pass the expected subject, organization, root SHA-256 and identity key usage together.' }

function Get-Sha256([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-', '') } finally { $sha.Dispose() }
}

# Exactly one CN and one O attribute; a repeated or multi-valued name yields no match.
function Get-SingleName($Certificate, [string]$Type) {
    $flags = [Security.Cryptography.X509Certificates.X500DistinguishedNameFlags]'UseNewLines, DoNotUseQuotes'
    $values = @($Certificate.SubjectName.Decode($flags) -split "`r?`n" | Where-Object { $_.StartsWith("$Type=") } |
        ForEach-Object { $_.Substring($Type.Length + 1) })
    if ($values.Count -eq 1 -and $values[0] -notmatch ' \+ [A-Za-z.0-9]+=') { $values[0] } else { $null }
}

$file = Get-Item -LiteralPath $Path
# Keep the same file in place for both the checksum and the Authenticode check.
$stream = [System.IO.File]::OpenRead($file.FullName)
try {
    if ((Get-FileHash -InputStream $stream -Algorithm SHA256).Hash -ne $ExpectedFileSha256) {
        throw 'The file differs from the published SHA-256.'
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignatureType -ne 'Authenticode' -or
        $null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) {
        throw "Expected a valid, timestamped, embedded Authenticode signature (status $($signature.Status))."
    }
    $leaf = $signature.SignerCertificate
    # Windows has already trusted this signature. Rebuild its chain only to read the root; the
    # timestamp keeps the signature valid after its short-lived leaf expires.
    $chain = New-Object Security.Cryptography.X509Certificates.X509Chain
    try {
        $chain.ChainPolicy.RevocationMode = 'NoCheck'
        $chain.ChainPolicy.VerificationFlags = 'IgnoreNotTimeValid'
        if (-not $chain.Build($leaf)) {
            throw "Windows could not rebuild the signer's certificate chain ($(($chain.ChainStatus | ForEach-Object Status) -join ', '))."
        }
        $root = $chain.ChainElements[$chain.ChainElements.Count - 1].Certificate
        if ($chain.ChainElements.Count -lt 2 -or $root.Subject -ne $root.Issuer) { throw 'The signer chain does not end in a root certificate.' }
        $rootSha256 = Get-Sha256 $root.RawData
        $issuer = $chain.ChainElements[1].Certificate.GetNameInfo('SimpleName', $false)
        $rootName = $root.GetNameInfo('SimpleName', $false)
    } finally { if ($chain -is [IDisposable]) { $chain.Dispose() } }
    $usages = @($leaf.Extensions | Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } |
        ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
    $identity = [ordered]@{
        subject = Get-SingleName $leaf 'CN'
        organization = Get-SingleName $leaf 'O'
        rootSha256 = $rootSha256
        root = $rootName
        issuer = $issuer
        keyUsages = $usages
        leafSha256 = Get-Sha256 $leaf.RawData
        leafNotAfter = $leaf.NotAfter.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        timestamper = $signature.TimeStamperCertificate.GetNameInfo('SimpleName', $false)
    }
    if ($expected.Count -eq 4) {
        if ($identity.subject -cne $ExpectedSubject -or $identity.organization -cne $ExpectedOrganization) {
            throw 'The signer does not match the expected publisher subject.'
        }
        if ($rootSha256 -ne $ExpectedRootSha256) { throw 'The signature does not chain to the expected root certificate.' }
        if ($usages -notcontains $codeSigning -or $usages -notcontains $ExpectedIdentityKeyUsage) {
            throw 'The signing certificate lacks the expected identity key usage.'
        }
    }
    [pscustomobject]$identity | ConvertTo-Json -Compress
} finally { $stream.Dispose() }
