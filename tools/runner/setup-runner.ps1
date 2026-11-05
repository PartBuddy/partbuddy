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
    5. runner-control.ps1 nach %LOCALAPPDATA%\PartBuddyRunner kopieren, Desktop-Verknüpfung und
       Autostart anlegen, Runner starten.

.PARAMETER Repository
    owner/name des Repositorys, für das der Runner Aufträge annimmt.

.PARAMETER NoAutostart
    Keine Verknüpfung im Autostart-Ordner anlegen.
#>
[CmdletBinding()]
param(
    [string]$Repository = 'ManuelStaggl/partbuddy',
    [string]$RunnerName = 'partbuddy-wsl',
    [string]$RunnerLabels = 'partbuddy',
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

$InstallRoot = Join-Path $env:LOCALAPPDATA 'PartBuddyRunner'
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
if (Test-Path $wslConfig) {
    Write-Warning ".wslconfig existiert schon und bleibt unverändert: $wslConfig"
}
else {
    @'
# Written by PartBuddy tools/runner/setup-runner.ps1 (ADR 0022). Applies to every WSL 2 distribution.
[wsl2]
# Upper limits for the CI runner, so a test run never takes the whole machine.
memory=16GB
processors=12
# Test servers in WSL stay inside WSL; nothing appears on Windows' localhost.
localhostForwarding=false
# No WSLg: Linux GUI programs (Electron under test) never open a window on the Windows desktop.
guiApplications=false

[experimental]
# Give freed disk space back to Windows; cached memory is reclaimed by default (dropCache).
sparseVhd=true
'@ | Set-Content -Path $wslConfig -Encoding utf8
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
$provision = (Get-Content -Raw (Join-Path $PSScriptRoot 'provision.sh')) -replace "`r`n", "`n"
$provision | & $Wsl -d $Distro -u root -- sh -c 'cat > /root/provision.sh && chmod 0700 /root/provision.sh'
Assert-LastExit 'Das Kopieren von provision.sh'
& $Wsl -d $Distro -u root -- /root/provision.sh
Assert-LastExit 'Die Provisionierung'
# wsl.conf (Abschottung von Windows) greift erst nach einem Neustart der Distribution.
& $Wsl --terminate $Distro

# --- 4. Registrierung -------------------------------------------------------------------------
& $Wsl -d $Distro -u $RunnerUser -- test -f "$RunnerHome/actions-runner/.runner" *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Step 'Runner ist schon registriert'
}
else {
    Write-Step "Registriere den Runner '$RunnerName' für $Repository"
    $token = & gh api -X POST "repos/$Repository/actions/runners/registration-token" --jq .token
    Assert-LastExit 'Das Anfordern des Registrierungs-Tokens'
    try {
        $token | & $Wsl -d $Distro -u $RunnerUser -- "$RunnerHome/register.sh" "https://github.com/$Repository" $RunnerName $RunnerLabels
        Assert-LastExit 'Die Registrierung des Runners'
    }
    finally {
        $token = $null
    }
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
Write-Host "Fertig. Runner-Protokoll: \\wsl.localhost\$Distro\home\$RunnerUser\runner.log"
