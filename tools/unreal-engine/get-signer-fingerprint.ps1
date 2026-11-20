# Outputs the SHA-256 of the signing certificate embedded in a known release.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedFileSha256
)

$ErrorActionPreference = 'Stop'
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
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        [BitConverter]::ToString($sha.ComputeHash($signature.SignerCertificate.RawData)).Replace('-', '')
    } finally { $sha.Dispose() }
} finally { $stream.Dispose() }
