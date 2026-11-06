#Requires -Version 7.4
<#
.SYNOPSIS
    Baut eine eigenständige Testversion von PartBuddy am Homeserver und liefert sie an den Gaming-PC.

.DESCRIPTION
    1. electron-vite build und electron-builder --dir (B10) mit der Version 0.1.0-test.<Datum>.<Nummer>.
    2. Ist der Gaming-PC per SSH erreichbar, wird das Ergebnis als tar dorthin kopiert und nach
       %USERPROFILE%\.partbuddy\test-app\app ausgepackt; die alte Fassung wird erst danach ersetzt.
       Ist er nicht erreichbar oder läuft dort die Testversion gerade, bleibt alles, wie es ist, und
       der nächste Aufruf liefert (Exit-Code 0, Meldung im Protokoll).
    3. Die Verknüpfung »PartBuddy (Test)« auf dem Desktop des PCs zeigt auf PartBuddy.exe.

    Nie nach AppData schreiben (MSIX-Umleitung): Protokoll und Zähler liegen in %USERPROFILE%\.partbuddy.
#>
[CmdletBinding()]
param(
    # user@host des PCs; ohne Angabe aus %USERPROFILE%\.partbuddy\test-pc.txt (Konto und Adresse
    # gehören nicht ins Repository).
    [string]$Target,
    [string]$KeyFile = (Join-Path $env:USERPROFILE '.ssh\gamingpc_ed25519'),
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Desktop = Join-Path $RepoRoot 'apps\desktop'
$Unpacked = Join-Path $Desktop 'dist\win-unpacked'
$StateDir = Join-Path $env:USERPROFILE '.partbuddy'
$LogFile = Join-Path $StateDir 'deliver-test-app.log'
$CounterFile = Join-Path $StateDir 'test-app-build-number.txt'
$SshArgs = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'LogLevel=ERROR')
if (-not $Target) { $Target = (Get-Content (Join-Path $StateDir 'test-pc.txt') -Raw).Trim() }
if ($Target -notmatch '^[\w.-]+@[\w.-]+$') { throw "Ungültiges Ziel '$Target' (erwartet user@host)." }

function Write-Log([string]$Message) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Host $line
}

function Assert-LastExit([string]$What) {
    if ($LASTEXITCODE -ne 0) { throw "$What ist fehlgeschlagen (Exit-Code $LASTEXITCODE)." }
}

# Führt ein PowerShell-Skript am PC aus (Windows PowerShell 5.1); -EncodedCommand umgeht jedes Quoting.
function Invoke-Pc([string]$Script) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("`$ProgressPreference='SilentlyContinue'`n" + $Script))
    & ssh @SshArgs $Target "powershell -NoProfile -NonInteractive -EncodedCommand $encoded" 2>&1 |
        Where-Object { "$_" -notmatch 'post-quantum|store now, decrypt|openssh\.com/pq' }
}

try {
    # --- Erreichbarkeit zuerst: ohne PC kein Build ----------------------------------------------
    & ssh @SshArgs $Target 'exit 0' 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Gaming-PC $Target nicht erreichbar, Lieferung beim nächsten Mal."
        exit 0
    }
    $running = Invoke-Pc "@(Get-CimInstance Win32_Process -Filter `"Name='PartBuddy.exe' OR Name='electron.exe'`" | ? { `$_.CommandLine -like '*\.partbuddy\test-app*' }).Count"
    if ([int]($running | Select-Object -Last 1) -gt 0) {
        Write-Log 'Testversion läuft am PC gerade, Lieferung beim nächsten Mal.'
        exit 0
    }

    # --- Build --------------------------------------------------------------------------------
    $number = if (Test-Path $CounterFile) { [int](Get-Content $CounterFile -Raw) + 1 } else { 39 }
    $version = '0.1.0-test.{0:yyyyMMdd}.{1}' -f (Get-Date), $number
    if (-not $SkipBuild) {
        Write-Log "Baue Testversion $version"
        Push-Location $Desktop
        try {
            & pnpm exec electron-vite build
            Assert-LastExit 'electron-vite build'
            & pnpm exec electron-builder --win --dir --publish never "-c.extraMetadata.name=partbuddy-test" "-c.extraMetadata.version=$version"
            Assert-LastExit 'electron-builder --dir'
        }
        finally { Pop-Location }
    }
    if (-not (Test-Path (Join-Path $Unpacked 'PartBuddy.exe'))) { throw "Kein Build unter $Unpacked." }

    # --- Kopieren -----------------------------------------------------------------------------
    $tar = Join-Path ([IO.Path]::GetTempPath()) 'partbuddy-test-app.tar'
    & tar -cf $tar -C $Unpacked .
    Assert-LastExit 'tar'
    Invoke-Pc "New-Item -ItemType Directory -Force `"`$env:USERPROFILE\.partbuddy\test-app`" | Out-Null" | Out-Null
    & scp @SshArgs -q $tar "${Target}:.partbuddy/test-app/incoming.tar"
    Assert-LastExit 'scp'
    Remove-Item $tar -Force

    # --- Auspacken und tauschen am PC ---------------------------------------------------------
    $swap = @'
$ErrorActionPreference = 'Stop'
$t = Join-Path $env:USERPROFILE '.partbuddy\test-app'
$new = Join-Path $t 'app-new'; $app = Join-Path $t 'app'; $old = Join-Path $t 'app-old'
foreach ($d in $new, $old) { if (Test-Path $d) { Get-ChildItem $d -Force | ? { $_.LinkType } | % { cmd /c rmdir "$($_.FullName)" }; Remove-Item $d -Recurse -Force } }
New-Item -ItemType Directory $new | Out-Null
tar -xf (Join-Path $t 'incoming.tar') -C $new
if ($LASTEXITCODE -ne 0) { throw 'tar -xf fehlgeschlagen' }
Remove-Item (Join-Path $t 'incoming.tar') -Force
if (Test-Path $app) {
    # Junctions (frühere Testversion: node_modules ins Repo) nur als Verweis entfernen, nie ihr Ziel.
    Get-ChildItem $app -Force | ? { $_.LinkType } | % { cmd /c rmdir "$($_.FullName)" }
    Rename-Item $app 'app-old'
}
Rename-Item $new 'app'
if (Test-Path $old) { Remove-Item $old -Recurse -Force }
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'PartBuddy (Test).lnk'))
$lnk.TargetPath = Join-Path $app 'PartBuddy.exe'; $lnk.Arguments = ''; $lnk.WorkingDirectory = $app
$ico = Join-Path $t 'partbuddy.ico'; if (Test-Path $ico) { $lnk.IconLocation = $ico }
$lnk.Save()
'geliefert: ' + (Get-Item (Join-Path $app 'PartBuddy.exe')).VersionInfo.ProductVersion
'@
    $result = Invoke-Pc $swap
    if (-not ($result -match '^geliefert')) { throw "Tausch am PC fehlgeschlagen: $($result -join ' | ')" }
    Set-Content -Path $CounterFile -Value $number -NoNewline
    Write-Log "Testversion $version an $Target geliefert ($($result | Select-Object -Last 1))."
}
catch {
    Write-Log "Fehler: $($_.Exception.Message)"
    exit 1
}
