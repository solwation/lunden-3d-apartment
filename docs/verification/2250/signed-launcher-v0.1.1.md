# First signed launcher release (#2250), 2026-11-21

Conductor session `orkester: solwation-w11-opus-5.5-20261121`; user approval for tags/releases on #2250 (2026-11-21).

## Tags and Actions runs

| Tag | Commit | Run | Result |
| --- | --- | --- | --- |
| `v0.1.0` | `2dcabb34` | [44881999805](https://github.com/solwation/lunden-3d-apartment/actions/runs/44881999805) | build ok; sign **failed**: `AzureCliCredential authentication failed`. `exclude-environment-credential: true` removed the only credential that the action's `azure-client-secret` input feeds. No artifact was produced; the tag is kept (nothing was published from it). |
| `v0.1.1` | `85b80563` (fix) | [44882237973](https://github.com/solwation/lunden-3d-apartment/actions/runs/44882237973) | build 75 s, sign 89 s, both success |

`SIGNING_ENABLED=true` was set as a variable of the protected `signing` environment (2026-11-21 07:49 UTC).

## Signed artifact `signed-launcher-v0.1.1-1`

`launcher-build.json`: tag `v0.1.1`, commit `85b80563209722c2af562850947c17a580379d21`, signer CN/O
`Svep Design Center AB`, root `5367F20C…1270`, identity usage `1.3.6.1.4.1.311.97.113607477.134038250.983402513.388203704`,
leaf `E7CDD720…6991`, manifest key SHA-256 `e1af2471…0289`.

`SHA256SUMS` (computed by the sign job after signing) equals the local SHA-256 of the downloaded files:
`e6477a6a73e6ad67a0dd3d27821580b9510017e4cc971669c23e2a689e95dac2` for both `Lunden.exe` and `Lunden-Setup-0.1.1-win-x64.exe` (73,666,880 bytes).

The workflow signs exactly one file, `Lunden.exe`; the setup file is a byte-identical copy. The content-only game
ships Epic's stock signed runtime (14 inventoried vendor images, checked by the launcher), so there is no
project-owned game binary to sign and no `sign-files.txt`.

### Windows verification on the build PC (`Get-AuthenticodeSignature`)

```text
File          : Lunden-Setup-0.1.1-win-x64.exe
Status        : Valid
SignatureType : Authenticode
Subject       : CN=Svep Design Center AB, O=Svep Design Center AB, L=Lund, S=Skåne, C=SE
LeafSha256    : E7CDD7209BF94142DFB0767509FCA1C7284D1A3293226628298354156CB06991
LeafNotBefore : 2026-11-20 04:30:26Z
LeafNotAfter  : 2026-11-23 04:30:26Z
Issuer        : CN=Microsoft ID Verified CS EOC CA 04, O=Microsoft Corporation, C=US
TimeStamper   : CN=Microsoft Public RSA Time Stamping Authority, OU=nShield TSS ESN:7800-05E0-D947, OU=Microsoft America Operations, O=Microsoft Corporation, L=Redmond, S=Washington, C=US
FileSha256    : E6477A6A73E6AD67A0DD3D27821580B9510017E4CC971669C23E2A689E95DAC2
File          : Lunden.exe
Status        : Valid
SignatureType : Authenticode
Subject       : CN=Svep Design Center AB, O=Svep Design Center AB, L=Lund, S=Skåne, C=SE
LeafSha256    : E7CDD7209BF94142DFB0767509FCA1C7284D1A3293226628298354156CB06991
LeafNotBefore : 2026-11-20 04:30:26Z
LeafNotAfter  : 2026-11-23 04:30:26Z
Issuer        : CN=Microsoft ID Verified CS EOC CA 04, O=Microsoft Corporation, C=US
TimeStamper   : CN=Microsoft Public RSA Time Stamping Authority, OU=nShield TSS ESN:7800-05E0-D947, OU=Microsoft America Operations, O=Microsoft Corporation, L=Redmond, S=Washington, C=US
FileSha256    : E6477A6A73E6AD67A0DD3D27821580B9510017E4CC971669C23E2A689E95DAC2
```

`get-signer-identity.ps1` with `-ExpectedFileSha256`, `-ExpectedSubject`, `-ExpectedOrganization`, `-ExpectedRootSha256`
and `-ExpectedIdentityKeyUsage` (values from `publisher-identity.json`): exit 0 for both files, issuer
*Microsoft ID Verified CS EOC CA 04*, timestamper *Microsoft Public RSA Time Stamping Authority*.
Windows SDK `signtool verify /pa /all /tw Lunden.exe`: `Successfully verified`, index 0 sha256, RFC3161 timestamp.

## Per-user install and removal on this PC (test channel)

Windows Sandbox is not enabled on this PC (no `WindowsSandbox.exe`/`wsb.exe`), and no clean VM is available, so the clean
Windows 11 pilot was **not** run. Instead the signed setup was exercised on the build PC with the separate test
channel (`Lunden-Test`), which did not exist before and was removed afterwards; the stable `Lunden` install
location was never touched (no stable installation exists on this PC).

```text
## install (signed setup, --install --quiet --channel test) 2026-11-21T07:56:51Z
exit=0
total 71944
drwxrwxrwx 1 olof olof     4096 Nov 21  2026 .
drwxrwxrwx 1 olof olof     4096 Nov 21  2026 ..
-rwxrwxrwx 1 olof olof       40 Nov 21  2026 .lunden-install.json
-rwxrwxrwx 1 olof olof        0 Nov 21 08:56 .update.lock
-rwxrwxrwx 1 olof olof 73666880 Nov 21 08:56 Lunden.exe
e6477a6a73e6ad67a0dd3d27821580b9510017e4cc971669c23e2a689e95dac2  /mnt/c/Users/Olof/AppData/Local/Programs/Lunden-Test/Lunden.exe
-rwxrwxrwx 1 olof olof 1344 Nov 21 08:56 Lunden (test).lnk

HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\Lunden-Test
    DisplayName    REG_SZ    Lunden (test)
    DisplayVersion    REG_SZ    0.1.1
    DisplayIcon    REG_SZ    "C:\Users\Olof\AppData\Local\Programs\Lunden-Test\Lunden.exe",0
    InstallLocation    REG_SZ    C:\Users\Olof\AppData\Local\Programs\Lunden-Test
    UninstallString    REG_SZ    "C:\Users\Olof\AppData\Local\Programs\Lunden-Test\Lunden.exe" --uninstall --channel test
    QuietUninstallString    REG_SZ    "C:\Users\Olof\AppData\Local\Programs\Lunden-Test\Lunden.exe" --uninstall --channel test --quiet
    NoModify    REG_DWORD    0x1
    NoRepair    REG_DWORD    0x1


## seed fixture save, then --uninstall --quiet --channel test (signed setup copy) 2026-11-21T07:57:00Z
ls: cannot access '/mnt/c/Users/Olof/AppData/Local/Lunden-Test': No such file or directory
exit=0
ls: cannot access '/mnt/c/Users/Olof/AppData/Local/Programs/Lunden-Test': No such file or directory
no Start menu shortcut
ERROR: The system was unable to find the specified registry key or value.
saves kept:
fixture-save-2250

## reinstall, then QuietUninstallString (installed Lunden.exe --uninstall --channel test --quiet) 2026-11-21T07:57:08Z
install exit=0
uninstall exit=0
after 1s:
ls: cannot access '/mnt/c/Users/Olof/AppData/Local/Programs/Lunden-Test': No such file or directory
ERROR: The system was unable to find the specified registry key or value.
no Start menu shortcut
saves kept:
fixture-save-2250
```

No elevation prompt appeared; all commands ran non-interactively from a shell with no window. The fixture save
directory `%LOCALAPPDATA%\Lunden-Test` was deleted after the check.
