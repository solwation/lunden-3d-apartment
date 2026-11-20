<#
.SYNOPSIS
  Compatibility entry point for the Lunden content-only project.
#>
[CmdletBinding()]
param(
    [ValidateSet('Development', 'DebugGame')][string]$Configuration = 'Development',
    [string]$EngineDir
)
Write-Host 'Lunden is content-only. Open Lunden.uproject with the installed Epic editor; no project compilation is needed.'
exit 0
