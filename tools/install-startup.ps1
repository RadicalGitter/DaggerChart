# Install/remove only this user's Vesserin shortcut. No admin rights required.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$startupFolder = [Environment]::GetFolderPath('Startup')
if (-not $startupFolder) { throw 'Windows did not provide a user Startup folder.' }
$shortcutPath = Join-Path $startupFolder 'Vesserin - The Settlement.lnk'
$launcher = Join-Path $projectRoot 'Start The Settlement.vbs'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'The settlement launcher is missing.' }
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
if ((Test-Path -LiteralPath $shortcutPath) -and
    ($shortcut.TargetPath -ne $wscriptPath -or $shortcut.Arguments -ne ('"' + $launcher + '" --startup'))) {
    throw 'An unrelated shortcut already uses the Vesserin startup name.'
}
if ($Remove) {
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Vesserin automatic startup removed.'
    exit
}
$shortcut.TargetPath = $wscriptPath
$shortcut.Arguments = '"' + $launcher + '" --startup'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start Vesserin at Windows sign-in. Close it from the settlement tray icon.'
$shortcut.Save()
Write-Output "Vesserin starts at Windows sign-in: $shortcutPath"
