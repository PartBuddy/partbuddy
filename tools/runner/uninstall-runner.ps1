#Requires -Version 7.4
<#
.SYNOPSIS
    Entfernt den selbst gehosteten Runner von PartBuddy wieder vollständig (ADR 0022).

.DESCRIPTION
    Stoppt den Runner, meldet ihn bei GitHub ab, löscht die WSL-Distribution "partbuddy-runner"
    mit allem darin (Caches, Arbeitsordner) sowie Steuerskript und Verknüpfungen.
    %USERPROFILE%\.wslconfig bleibt stehen, weil sie auch für andere Distributionen gilt.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$Repository = 'PartBuddy/partbuddy'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Distro = 'partbuddy-runner'
$RunnerUser = 'runner'
# Nicht unter AppData: Startet ein MSIX-Paket (etwa die Claude-App) dieses Skript, leitet Windows
# Schreibzugriffe in AppData in den privaten Paketordner um; Explorer und Verknüpfungen fänden die
# Dateien dann nicht. Das Benutzerprofil außerhalb von AppData wird nicht umgeleitet.
$InstallRoot = Join-Path $env:USERPROFILE '.partbuddy\runner'
$Wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
$env:WSL_UTF8 = '1'

$installed = @(& $Wsl --list --quiet 2>$null | ForEach-Object { ([string]$_).Trim([char]0, ' ', "`r") }) -contains $Distro

if ($installed -and $PSCmdlet.ShouldProcess($Distro, 'Runner abmelden und Distribution löschen')) {
    & $Wsl -d $Distro -u $RunnerUser -- pkill -INT -f Runner.Listener *> $null
    Start-Sleep -Seconds 3

    $token = & gh api -X POST "repos/$Repository/actions/runners/remove-token" --jq .token
    if ($LASTEXITCODE -eq 0) {
        $token | & $Wsl -d $Distro -u $RunnerUser -- "/home/$RunnerUser/unregister.sh"
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'Abmelden fehlgeschlagen; den Runner bitte unter Settings > Actions > Runners entfernen.'
        }
    }
    $token = $null

    & $Wsl --terminate $Distro *> $null
    & $Wsl --unregister $Distro
}

foreach ($link in @(
        (Join-Path ([Environment]::GetFolderPath('Desktop')) 'PartBuddy-Runner.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Startup')) 'PartBuddy-Runner.lnk'))) {
    Remove-Item $link -Force -ErrorAction SilentlyContinue
}
if ((Test-Path $InstallRoot) -and $PSCmdlet.ShouldProcess($InstallRoot, 'Ordner löschen')) {
    Remove-Item $InstallRoot -Recurse -Force
}
Write-Host 'Runner entfernt.'
