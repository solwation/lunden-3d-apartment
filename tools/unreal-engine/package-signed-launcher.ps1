# Package only an embedded, timestamped signature from the publisher pinned in this launcher build.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Launcher,
    [Parameter(Mandatory)][ValidatePattern('^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')][string]$Version,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$SignerSha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ManifestKeySha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Commit,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
function Assert-SignedLauncher([string]$Path, [string]$ExpectedHash) {
    $fingerprint = & (Join-Path $PSScriptRoot 'get-signer-fingerprint.ps1') -Path $Path -ExpectedFileSha256 $ExpectedHash
    if ($fingerprint -ne $SignerSha256) { throw 'The launcher was signed with a different certificate.' }
}
$sdkBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signTool = Get-ChildItem -LiteralPath $sdkBin -Directory | Where-Object { $_.Name -match '^\d+(\.\d+){3}$' } |
    Sort-Object { [version]$_.Name } -Descending | ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
    Where-Object { [IO.File]::Exists($_) } | Select-Object -First 1
if (-not $signTool) { throw 'Windows SDK x64 SignTool is required to package a signed launcher.' }
$source = (Get-Item -LiteralPath $Launcher).FullName
$digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
Assert-SignedLauncher $source $digest
& $signTool verify /pa /all /tw $source
if ($LASTEXITCODE -ne 0) { throw 'SignTool verification failed or reported a warning.' }
# Keep the final artifact directory absent on errors; a previous artifact cannot be overwritten.
$final = [IO.Path]::GetFullPath($OutputDirectory)
$parent = [IO.Path]::GetDirectoryName($final)
[void][IO.Directory]::CreateDirectory($parent)
$temp = Join-Path $parent ('.pack-launcher-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try {
    $names = @('Lunden.exe', "Lunden-Setup-$Version-win-x64.exe")
    $lines = foreach ($name in $names) {
        $file = Join-Path $temp $name
        [IO.File]::Copy($source, $file)
        Assert-SignedLauncher $file $digest
        "$digest  $name"
    }
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $temp 'SHA256SUMS'), (($lines -join "`n") + "`n"), $utf8)
    $record = [ordered]@{ tag = "app-v$Version"; commit = $Commit; signerCertificateSha256 = $SignerSha256.ToUpperInvariant()
        manifestPublicKeySha256 = $ManifestKeySha256.ToLowerInvariant(); launcherSha256 = $digest }
    [IO.File]::WriteAllText((Join-Path $temp 'launcher-build.json'), ($record | ConvertTo-Json), $utf8)
    [IO.Directory]::Move($temp, $final)
} finally {
    if ([IO.Directory]::Exists($temp)) { [IO.Directory]::Delete($temp, $true) }
}
