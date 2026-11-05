#Requires -Version 5.1
<#
.SYNOPSIS
    Startet, stoppt oder schaltet den selbst gehosteten GitHub-Actions-Runner von PartBuddy (ADR 0022).

.DESCRIPTION
    Der Runner lebt in der WSL2-Distribution "partbuddy-runner". Gestartet wird er von einem
    unsichtbaren wsl.exe-Prozess, der die Distribution so lange am Leben hält, wie der Runner läuft.
    Diesen Prozess legt der WMI-Dienst an (Win32_Process.Create), damit er den Aufrufer überlebt.
    Gestoppt wird er geordnet (SIGINT), danach wird die Distribution beendet, damit sie keinen
    Arbeitsspeicher mehr belegt. GitHub hält neue Läufe zurück, solange der Runner gestoppt ist.

    setup-runner.ps1 kopiert dieses Skript nach %USERPROFILE%\.partbuddy\runner und legt die
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
# Nicht unter AppData: Startet ein MSIX-Paket (etwa die Claude-App) dieses Skript, leitet Windows
# Schreibzugriffe in AppData in den privaten Paketordner um; Explorer und Verknüpfungen fänden die
# Dateien dann nicht. Das Benutzerprofil außerhalb von AppData wird nicht umgeleitet.
$LogFile = Join-Path $env:USERPROFILE '.partbuddy\runner\control.log'
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

# Startet einen Prozess unsichtbar und vom Aufrufer gelöst. Start-Process hängt das Kind an den
# Prozessbaum und das Job-Objekt des Aufrufers: Räumt der Aufrufer seinen Baum ab (etwa eine
# Claude-Code-Sitzung, die "-Action Start -Quiet" ausführte), endet wsl.exe mit ihm, und mit
# wsl.exe die Listener, ohne eine Zeile ins Protokoll zu schreiben. Über Win32_Process.Create legt
# der WMI-Dienst den Prozess an; sein Elternprozess ist dann WmiPrvSE, nicht der Aufrufer.
# ShowWindow 0 (SW_HIDE) verhindert das Konsolenfenster, und der Fokus bleibt, wo er ist.
function Start-Detached([string]$CommandLine) {
    $startupClass = Get-CimClass -Namespace 'root/cimv2' -ClassName 'Win32_ProcessStartup'
    $startup = New-CimInstance -CimClass $startupClass -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $result = Invoke-CimMethod -Namespace 'root/cimv2' -ClassName 'Win32_Process' -MethodName 'Create' -Arguments @{
        CommandLine               = $CommandLine
        CurrentDirectory          = $env:USERPROFILE
        ProcessStartupInformation = $startup
    }
    if ($result.ReturnValue -ne 0) {
        throw "Win32_Process.Create ist fehlgeschlagen (Rückgabewert $($result.ReturnValue)): $CommandLine"
    }
    return $result.ProcessId
}

function Test-ListenerRunning { Test-InDistro 'Runner.Listener' }
function Test-JobRunning { Test-InDistro 'Runner.Worker' }

function Start-Runner {
    if (-not (Test-DistroInstalled)) {
        throw "Die WSL-Distribution '$Distro' fehlt. Bitte tools\runner\setup-runner.ps1 ausführen."
    }
    if (Test-ListenerRunning) { return }

    $processId = Start-Detached "`"$Wsl`" -d $Distro -u $RunnerUser -- /home/$RunnerUser/start-listener.sh"

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-ListenerRunning) {
            Write-Log "Runner gestartet (wsl.exe, PID $processId)."
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

# Windows lets a hidden process (the shortcut starts PowerShell without a window) show a dialog only
# in the background, where it merely flashes in the taskbar. MessageBox flags MB_TOPMOST and
# MB_SETFOREGROUND bring it to the front. Returns 'Yes', 'No' or 'OK'.
function Show-Message([string]$Text, [string]$Buttons = 'OK', [string]$Icon = 'Information') {
    $flags = 0x40000 -bor 0x10000
    $flags = $flags -bor $(switch ($Buttons) { 'YesNo' { 4 } default { 0 } })
    $flags = $flags -bor $(switch ($Icon) { 'Error' { 16 } 'Question' { 32 } 'Warning' { 48 } default { 64 } })
    $answer = (New-Object -ComObject WScript.Shell).Popup($Text, 0, $Title, $flags)
    switch ($answer) { 6 { 'Yes' } 7 { 'No' } default { 'OK' } }
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
