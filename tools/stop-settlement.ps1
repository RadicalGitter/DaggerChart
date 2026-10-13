# Request a graceful shutdown from the independently launched tray keeper.
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.runtime'
if (-not (Test-Path -LiteralPath $runtimeDir -PathType Container)) {
    Write-Output 'The settlement keeper has not started.'
    exit
}
[System.IO.File]::WriteAllText((Join-Path $runtimeDir 'settlement.stop'), 'stop')
Write-Output 'Requested a graceful settlement shutdown.'
