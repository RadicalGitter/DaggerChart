# The Settlement - tray keeper.
# Starts the server hidden and sits in the system tray: open the ledger or the
# table from the menu, close the settlement to stop the server and leave.
# Launch via "Start The Settlement.vbs" in the repo root (no console window).
param([switch]$Quiet)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$port = 4626
$root = Split-Path $PSScriptRoot -Parent
$keeperMutex = [System.Threading.Mutex]::new($false, 'Local\VesserinSettlementKeeper')
try { $ownsKeeper = $keeperMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsKeeper = $true }
if (-not $ownsKeeper) { $keeperMutex.Dispose(); exit }

# One settlement at a time.
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    if (-not $Quiet) {
    [System.Windows.Forms.MessageBox]::Show(
        "The Settlement is already open (port $port).`nClose the other keeper first.",
        "The Settlement", "OK", "Information") | Out-Null
    }
    $keeperMutex.ReleaseMutex()
    $keeperMutex.Dispose()
    exit
}

$runtimeDir = Join-Path $root '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$stopFile = Join-Path $runtimeDir 'settlement.stop'
Remove-Item -LiteralPath $stopFile -ErrorAction SilentlyContinue
$env:SETTLEMENT_STOP_FILE = $stopFile
$nodePath = (Get-Command node -ErrorAction Stop).Source
$node = Start-Process -FilePath $nodePath -ArgumentList 'server/index.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log')

$icon = New-Object System.Windows.Forms.NotifyIcon
try {
    # Borrow node's own icon so the tray mark is recognizable; fall back to a plain one.
    $icon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Get-Command node).Source)
} catch {
    $icon.Icon = [System.Drawing.SystemIcons]::Application
}
$icon.Text = "The Settlement - open"
$icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$openGm = $menu.Items.Add("Open the ledger (GM)")
$openTable = $menu.Items.Add("Open the table")
$menu.Items.Add("-") | Out-Null
$close = $menu.Items.Add("Close the settlement")
$icon.ContextMenuStrip = $menu

$openGm.add_Click({ Start-Process "http://localhost:$port/gm" })
$openTable.add_Click({ Start-Process "http://localhost:$port/login" })
$icon.add_DoubleClick({ Start-Process "http://localhost:$port/gm" })

$shutdown = {
    $watch.Stop()
    if (-not $node.HasExited) {
        [System.IO.File]::WriteAllText($stopFile, 'stop')
        # The server drains HTTP connections itself; its own deadline bounds exit.
        $node.WaitForExit(15000) | Out-Null
    }
    $icon.Visible = $false
    $icon.Dispose()
    [System.Windows.Forms.Application]::Exit()
    $keeperMutex.ReleaseMutex()
    $keeperMutex.Dispose()
}
$close.add_Click($shutdown)

# If the server dies on its own, say so and fold the tent.
$watch = New-Object System.Windows.Forms.Timer
$watch.Interval = 4000
$watch.add_Tick({
    if (Test-Path -LiteralPath $stopFile) {
        & $shutdown
        return
    }
    if ($node.HasExited) {
        $watch.Stop()
        $icon.ShowBalloonTip(4000, "The Settlement", "The server has stopped on its own.", "Warning")
        Start-Sleep -Seconds 4
        & $shutdown
    }
})
$watch.Start()

$icon.ShowBalloonTip(2500, "The Settlement", "Open at http://localhost:$port - right-click the icon to close.", "Info")
[System.Windows.Forms.Application]::Run()
