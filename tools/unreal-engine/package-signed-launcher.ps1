# Package only an embedded, timestamped signature from the stable publisher identity compiled into
# this launcher build (#2277). Artifact Signing replaces its leaf certificate every 72 hours, so the
# leaf is recorded for provenance but never pinned.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Launcher,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$ExpectedSubject,
    [Parameter(Mandatory)][ValidatePattern('^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')][string]$Version,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ManifestKeySha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Commit,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$PublisherIdentity = (Join-Path $PSScriptRoot '../../unreal/Launcher/publisher-identity.json')
)
$ErrorActionPreference = 'Stop'
$identity = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $PublisherIdentity).Path) | ConvertFrom-Json
$fields = @($identity.PSObject.Properties.Name)
if (($fields -join ',') -cne 'commonName,organization,rootSha256,identityKeyUsage') { throw 'Unexpected publisher identity fields.' }
# The protected profile's configured name must be the identity this launcher was built to trust.
if ($ExpectedSubject -cne $identity.commonName) { throw 'The configured publisher name differs from the launcher publisher identity.' }
function Assert-SignedLauncher([string]$Path, [string]$ExpectedHash) {
    $observed = & (Join-Path $PSScriptRoot 'get-signer-identity.ps1') -Path $Path -ExpectedFileSha256 $ExpectedHash `
        -ExpectedSubject $identity.commonName -ExpectedOrganization $identity.organization `
        -ExpectedRootSha256 $identity.rootSha256 -ExpectedIdentityKeyUsage $identity.identityKeyUsage
    ($observed | ConvertFrom-Json).leafSha256
}
$sdkBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signTool = Get-ChildItem -LiteralPath $sdkBin -Directory | Where-Object { $_.Name -match '^\d+(\.\d+){3}$' } |
    Sort-Object { [version]$_.Name } -Descending | ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
    Where-Object { [IO.File]::Exists($_) } | Select-Object -First 1
if (-not $signTool) { throw 'Windows SDK x64 SignTool is required to package a signed launcher.' }
$source = (Get-Item -LiteralPath $Launcher).FullName
$digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
$leaf = Assert-SignedLauncher $source $digest
& $signTool verify /pa /all /tw $source
if ($LASTEXITCODE -ne 0) { throw 'SignTool verification failed or reported a warning.' }
# Keep the final artifact directory absent on errors; a previous artifact cannot be overwritten.
$final = [IO.Path]::GetFullPath($OutputDirectory)
$parent = [IO.Path]::GetDirectoryName($final)
[void][IO.Directory]::CreateDirectory($parent)
$temp = Join-Path $parent ('.pack-launcher-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try {
    $names = @('Lunden.exe', "Kv-Lunden-Unreal-L1007-Setup-$Version-win-x64.exe")
    $lines = foreach ($name in $names) {
        $file = Join-Path $temp $name
        [IO.File]::Copy($source, $file)
        if ((Assert-SignedLauncher $file $digest) -ne $leaf) { throw 'The setup copy has a different signature.' }
        "$digest  $name"
    }
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $temp 'SHA256SUMS'), (($lines -join "`n") + "`n"), $utf8)
    $signer = [ordered]@{ commonName = $identity.commonName; organization = $identity.organization
        rootSha256 = $identity.rootSha256.ToUpperInvariant(); identityKeyUsage = $identity.identityKeyUsage; leafCertificateSha256 = $leaf }
    $record = [ordered]@{ tag = "v$Version"; commit = $Commit; signer = $signer
        manifestPublicKeySha256 = $ManifestKeySha256.ToLowerInvariant(); launcherSha256 = $digest }
    [IO.File]::WriteAllText((Join-Path $temp 'launcher-build.json'), ($record | ConvertTo-Json), $utf8)
    [IO.Directory]::Move($temp, $final)
} finally {
    if ([IO.Directory]::Exists($temp)) { [IO.Directory]::Delete($temp, $true) }
}
