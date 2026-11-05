#Requires -Version 5.1
<#
.SYNOPSIS
    Startet, stoppt oder schaltet den selbst gehosteten GitHub-Actions-Runner von PartBuddy (ADR 0022).

.DESCRIPTION
    Der Runner lebt in der WSL2-Distribution "partbuddy-runner". Gestartet wird er von einem
    unsichtbaren wsl.exe-Prozess, der die Distribution so lange am Leben hält, wie der Runner läuft.
    Gestoppt wird er geordnet (SIGINT), danach wird die Distribution beendet, damit sie keinen
    Arbeitsspeicher mehr belegt. GitHub hält neue Läufe zurück, solange der Runner gestoppt ist.

    setup-runner.ps1 kopiert dieses Skript nach %LOCALAPPDATA%\PartBuddyRunner und legt die
    Desktop-Verknüpfung (Toggle) und den Autostart (Start -Quiet) an.

.PARAMETER Action
    Toggle (Standard): zeigt den Zustand und fragt, ob umgeschaltet werden soll.
    Start, Stop: ohne Rückfrage. Status: gibt den Zustand aus.

.PARAMETER Quiet
    Keine Dialoge, Fehler gehen nur in das Protokoll (für den Autostart).
#>
[CmdletBinding()]
param(
    [ValidateSet('Toggle', 'Start', 'Stop', 'Status')]
    [string]$Action = 'Toggle',
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Distro = 'partbuddy-runner'
$RunnerUser = 'runner'
$Title = 'PartBuddy-Runner'
$LogFile = Join-Path $env:LOCALAPPDATA 'PartBuddyRunner\control.log'
$Wsl = Join-Path $env:WINDIR 'System32\wsl.exe'

# wsl.exe schreibt sonst UTF-16, das in PowerShell 5.1 als Zeichensalat ankommt.
$env:WSL_UTF8 = '1'

function Write-Log([string]$Message) {
    $dir = Split-Path $LogFile -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

# Windows PowerShell 5.1 macht aus jeder stderr-Zeile eines nativen Programms einen Fehler, der mit
# ErrorActionPreference=Stop abbricht. Für wsl.exe gilt deshalb hier nur der Exit-Code.
function Invoke-WslQuiet([string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'
    & $Wsl @Arguments *> $null
    return $LASTEXITCODE
}

function Get-WslLines([string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'
    $output = & $Wsl @Arguments 2>$null
    foreach ($line in @($output)) {
        $clean = ([string]$line).Trim([char]0, ' ', "`r", "`t")
        if ($clean) { $clean }
    }
}

function Test-DistroInstalled {
    @(Get-WslLines @('--list', '--quiet')) -contains $Distro
}

function Test-DistroRunning {
    @(Get-WslLines @('--list', '--running', '--quiet')) -contains $Distro
}

# Fragt nur nach, wenn die Distribution schon läuft; ein Aufruf würde sie sonst erst starten.
function Test-InDistro([string]$Pattern) {
    if (-not (Test-DistroRunning)) { return $false }
    return ((Invoke-WslQuiet @('-d', $Distro, '-u', $RunnerUser, '--', 'pgrep', '-f', $Pattern)) -eq 0)
}

function Test-ListenerRunning { Test-InDistro 'Runner.Listener' }
function Test-JobRunning { Test-InDistro 'Runner.Worker' }

function Start-Runner {
    if (-not (Test-DistroInstalled)) {
        throw "Die WSL-Distribution '$Distro' fehlt. Bitte tools\runner\setup-runner.ps1 ausführen."
    }
    if (Test-ListenerRunning) { return }

    Start-Process -FilePath $Wsl -WindowStyle Hidden -ArgumentList @(
        '-d', $Distro, '-u', $RunnerUser, '--', "/home/$RunnerUser/start-listener.sh"
    ) | Out-Null

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-ListenerRunning) {
            Write-Log 'Runner gestartet.'
            return
        }
    }
    throw "Der Runner ist nicht angelaufen. Protokolle: \\wsl.localhost\$Distro\home\$RunnerUser\actions-runner-*.log"
}

function Stop-Runner {
    if (-not (Test-DistroRunning)) { return }

    [void](Invoke-WslQuiet @('-d', $Distro, '-u', $RunnerUser, '--', 'pkill', '-INT', '-f', 'Runner.Listener'))
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline -and (Test-ListenerRunning)) {
        Start-Sleep -Milliseconds 500
    }
    [void](Invoke-WslQuiet @('--terminate', $Distro))
    Write-Log 'Runner gestoppt.'
}

function Get-RunnerState {
    if (-not (Test-DistroInstalled)) { return 'nicht eingerichtet' }
    if (Test-JobRunning) { return 'läuft (Prüflauf aktiv)' }
    if (Test-ListenerRunning) { return 'läuft' }
    return 'gestoppt'
}

function Show-Message([string]$Text, [string]$Buttons = 'OK', [string]$Icon = 'Information') {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($Text, $Title, $Buttons, $Icon)
}

try {
    switch ($Action) {
        'Start' { Start-Runner }
        'Stop' { Stop-Runner }
        'Status' { Get-RunnerState }
        'Toggle' {
            if (Test-ListenerRunning) {
                $text = 'Der PartBuddy-Runner läuft.'
                if (Test-JobRunning) {
                    $text += "`n`nGerade läuft ein Prüflauf. Beim Stoppen wird er abgebrochen."
                }
                $text += "`n`nJetzt stoppen?"
                if ((Show-Message $text 'YesNo' 'Question') -eq 'Yes') {
                    Stop-Runner
                    Show-Message ("Der Runner ist gestoppt und belegt keinen Speicher mehr.`n`n" +
                        'Neue Prüfläufe warten bei GitHub, bis du ihn wieder startest.') | Out-Null
                }
            }
            else {
                $text = "Der PartBuddy-Runner ist gestoppt.`n`nJetzt starten?"
                if ((Show-Message $text 'YesNo' 'Question') -eq 'Yes') {
                    Start-Runner
                    Show-Message 'Der Runner läuft und nimmt Prüfläufe von GitHub an.' | Out-Null
                }
            }
        }
    }
}
catch {
    Write-Log "Fehler bei '$Action': $($_.Exception.Message)"
    if (-not $Quiet) {
        Show-Message $_.Exception.Message 'OK' 'Error' | Out-Null
    }
    exit 1
}
