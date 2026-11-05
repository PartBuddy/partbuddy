#Requires -Version 7.4
<#
.SYNOPSIS
    Richtet den selbst gehosteten GitHub-Actions-Runner von PartBuddy in WSL2 ein (ADR 0022).

.DESCRIPTION
    Voraussetzung: WSL ist installiert (einmalig als Administrator: wsl --install --no-distribution,
    danach Neustart). Das Skript selbst braucht keine Administratorrechte und darf mehrfach laufen:

    1. %USERPROFILE%\.wslconfig anlegen (Obergrenzen für CPU und Speicher), falls sie fehlt.
    2. Ubuntu 24.04 als eigene Distribution "partbuddy-runner" importieren (Prüfsumme geprüft).
    3. provision.sh darin als root ausführen (Pakete, Benutzer "runner", Runner, Abschottung).
    4. Den Runner beim Repository registrieren (Token über gh, nie auf einer Befehlszeile).
    5. runner-control.ps1 nach %USERPROFILE%\.partbuddy\runner kopieren, Desktop-Verknüpfung und
       Autostart anlegen, Runner starten.

.PARAMETER Repository
    owner/name des Repositorys, für das der Runner Aufträge annimmt.

.PARAMETER RunnerCount
    Anzahl paralleler Runner-Instanzen (Standard 4). Sie heißen <RunnerName>-1 bis -n.

.PARAMETER NoAutostart
    Keine Verknüpfung im Autostart-Ordner anlegen.
#>
[CmdletBinding()]
param(
    [string]$Repository = 'ManuelStaggl/partbuddy',
    [string]$RunnerName = 'partbuddy-wsl',
    [string]$RunnerLabels = 'partbuddy',
    [ValidateRange(1, 8)]
    [int]$RunnerCount = 4,
    [switch]$NoAutostart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Distro = 'partbuddy-runner'
$RunnerUser = 'runner'
$RunnerHome = "/home/$RunnerUser"
$RootfsUrl = 'https://cloud-images.ubuntu.com/wsl/releases/24.04/20240423/ubuntu-noble-wsl-amd64-24.04lts.rootfs.tar.gz'
$RootfsSha256 = '2a790896740b14d637dbdc583cce1ba081ac53b9e9cdb46dc09a2f73abbd9934'

# Nicht unter AppData: Startet ein MSIX-Paket (etwa die Claude-App) dieses Skript, leitet Windows
# Schreibzugriffe in AppData in den privaten Paketordner um; Explorer und Verknüpfungen fänden die
# Dateien dann nicht. Das Benutzerprofil außerhalb von AppData wird nicht umgeleitet.
$InstallRoot = Join-Path $env:USERPROFILE '.partbuddy\runner'
$DistroDir = Join-Path $InstallRoot 'wsl'
$ControlScript = Join-Path $InstallRoot 'runner-control.ps1'
$Wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
$env:WSL_UTF8 = '1'

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }

# Bricht ab, wenn der letzte native Befehl (wsl, gh) fehlgeschlagen ist.
function Assert-LastExit([string]$What) {
    if ($LASTEXITCODE -ne 0) { throw "$What ist fehlgeschlagen (Exit-Code $LASTEXITCODE)." }
}

function Get-WslLines([string[]]$Arguments) {
    $output = & $Wsl @Arguments 2>$null
    foreach ($line in @($output)) {
        $clean = ([string]$line).Trim([char]0, ' ', "`r", "`t")
        if ($clean) { $clean }
    }
}

# --- 0. Voraussetzungen -----------------------------------------------------------------------
Write-Step 'Prüfe WSL'
& $Wsl --status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'WSL ist nicht installiert. Einmalig als Administrator ausführen: wsl --install --no-distribution (danach neu starten).'
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Die GitHub CLI (gh) fehlt.' }
& gh auth status *> $null
Assert-LastExit 'Die Anmeldung der GitHub CLI (gh auth status)'

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null

# --- 1. .wslconfig ----------------------------------------------------------------------------
Write-Step 'Prüfe .wslconfig'
$wslConfig = Join-Path $env:USERPROFILE '.wslconfig'
$wslConfigMarker = '# Written by PartBuddy tools/runner/setup-runner.ps1'
$wslConfigContent = @"
$wslConfigMarker (ADR 0022). Applies to every WSL 2 distribution.
[wsl2]
# Upper limits for the CI runners ($RunnerCount jobs in parallel), so test runs never take the whole
# machine (28 logical processors, 64 GB).
memory=20GB
processors=16
# Test servers in WSL stay inside WSL; nothing appears on Windows' localhost.
localhostForwarding=false
# No WSLg: Linux GUI programs (Electron under test) never open a window on the Windows desktop.
guiApplications=false

[experimental]
# Give freed disk space back to Windows; cached memory is reclaimed by default (dropCache).
sparseVhd=true
"@
$current = if (Test-Path $wslConfig) { Get-Content -Raw $wslConfig } else { $null }
if ($current -and -not $current.StartsWith($wslConfigMarker)) {
    Write-Warning ".wslconfig stammt nicht von diesem Skript und bleibt unverändert: $wslConfig"
}
elseif ($current -ne $wslConfigContent) {
    Set-Content -Path $wslConfig -Value $wslConfigContent -Encoding utf8 -NoNewline
    # Die neuen Grenzen gelten erst nach einem Neustart der WSL-VM.
    & $Wsl --shutdown
}

# --- 2. Distribution --------------------------------------------------------------------------
if (@(Get-WslLines @('--list', '--quiet')) -contains $Distro) {
    Write-Step "Distribution '$Distro' ist schon vorhanden"
}
else {
    Write-Step 'Lade Ubuntu 24.04 (WSL-Abbild) und prüfe die Prüfsumme'
    $download = Join-Path $InstallRoot 'download'
    New-Item -ItemType Directory -Path $download -Force | Out-Null
    $archive = Join-Path $download 'ubuntu-noble-wsl-amd64-24.04lts.rootfs.tar.gz'
    if (-not (Test-Path $archive) -or (Get-FileHash $archive -Algorithm SHA256).Hash -ne $RootfsSha256) {
        Invoke-WebRequest -Uri $RootfsUrl -OutFile $archive
    }
    $hash = (Get-FileHash $archive -Algorithm SHA256).Hash
    if ($hash -ne $RootfsSha256) {
        Remove-Item $archive -Force
        throw "Prüfsumme des Ubuntu-Abbilds stimmt nicht ($hash)."
    }

    Write-Step "Importiere Distribution '$Distro'"
    New-Item -ItemType Directory -Path $DistroDir -Force | Out-Null
    & $Wsl --import $Distro $DistroDir $archive --version 2
    Assert-LastExit 'Der Import der Distribution'
    Remove-Item $archive -Force
}

# --- 3. Provisionierung -----------------------------------------------------------------------
Write-Step 'Richte die Distribution ein (dauert beim ersten Mal einige Minuten)'
# PowerShell hängt beim Weiterreichen an native Programme ein CRLF an; tr entfernt jedes CR.
$provision = Get-Content -Raw (Join-Path $PSScriptRoot 'provision.sh')
$provision | & $Wsl -d $Distro -u root -- sh -c 'tr -d "\r" > /root/provision.sh && chmod 0700 /root/provision.sh'
Assert-LastExit 'Das Kopieren von provision.sh'
& $Wsl -d $Distro -u root -- env "RUNNER_COUNT=$RunnerCount" /root/provision.sh
Assert-LastExit 'Die Provisionierung'
# wsl.conf (Abschottung von Windows) greift erst nach einem Neustart der Distribution.
& $Wsl --terminate $Distro

# --- 4. Registrierung -------------------------------------------------------------------------
$token = $null
try {
    foreach ($i in 1..$RunnerCount) {
        $dir = "actions-runner-$i"
        $name = "$RunnerName-$i"
        & $Wsl -d $Distro -u $RunnerUser -- test -f "$RunnerHome/$dir/.runner" *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Step "Runner '$name' ist schon registriert"
            continue
        }
        Write-Step "Registriere den Runner '$name' für $Repository"
        if (-not $token) {
            # Ein Registrierungs-Token gilt eine Stunde und für mehrere Runner.
            $token = & gh api -X POST "repos/$Repository/actions/runners/registration-token" --jq .token
            Assert-LastExit 'Das Anfordern des Registrierungs-Tokens'
        }
        $token | & $Wsl -d $Distro -u $RunnerUser -- "$RunnerHome/register.sh" $dir "https://github.com/$Repository" $name $RunnerLabels
        Assert-LastExit "Die Registrierung von '$name'"
    }
}
finally {
    $token = $null
}

# --- 5. Steuerung, Verknüpfungen, Start -------------------------------------------------------
Write-Step 'Lege Steuerskript und Verknüpfungen an'
# PowerShell 5.1 liest Skripte ohne BOM als ANSI; mit BOM bleiben die Umlaute in den Dialogen heil.
$control = Get-Content -Raw (Join-Path $PSScriptRoot 'runner-control.ps1')
Set-Content -Path $ControlScript -Value $control -Encoding utf8BOM -NoNewline

$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$Path, [string]$Arguments, [string]$Description) {
    $link = $shell.CreateShortcut($Path)
    $link.TargetPath = $powershell
    $link.Arguments = "-NoProfile -WindowStyle Hidden -File `"$ControlScript`" $Arguments"
    $link.WorkingDirectory = $InstallRoot
    $link.WindowStyle = 7
    $link.IconLocation = "$env:WINDIR\System32\imageres.dll,109"
    $link.Description = $Description
    $link.Save()
}

$desktop = [Environment]::GetFolderPath('Desktop')
New-Shortcut (Join-Path $desktop 'PartBuddy-Runner.lnk') '-Action Toggle' `
    'PartBuddy-CI-Runner starten oder stoppen'

$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'PartBuddy-Runner.lnk'
if ($NoAutostart) {
    Remove-Item $startupLink -Force -ErrorAction SilentlyContinue
}
else {
    New-Shortcut $startupLink '-Action Start -Quiet' 'PartBuddy-CI-Runner bei der Anmeldung starten'
}

Write-Step 'Starte den Runner'
& $powershell -NoProfile -File $ControlScript -Action Start -Quiet
Assert-LastExit 'Der Start des Runners'
& $powershell -NoProfile -File $ControlScript -Action Status

Write-Host ''
Write-Host "Fertig. Protokolle: \\wsl.localhost\$Distro\home\$RunnerUser\actions-runner-*.log"
