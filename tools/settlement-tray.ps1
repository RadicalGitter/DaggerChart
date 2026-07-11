# The Settlement - tray keeper.
# Starts the server hidden and sits in the system tray: open the ledger or the
# table from the menu, close the settlement to stop the server and leave.
# Launch via "Start The Settlement.vbs" in the repo root (no console window).

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$port = 4626
$root = Split-Path $PSScriptRoot -Parent

# One settlement at a time.
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    [System.Windows.Forms.MessageBox]::Show(
        "The Settlement is already open (port $port).`nClose the other keeper first.",
        "The Settlement", "OK", "Information") | Out-Null
    exit
}

$node = Start-Process node -ArgumentList "server/index.js" -WorkingDirectory $root -WindowStyle Hidden -PassThru

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
    try { if (-not $node.HasExited) { Stop-Process -Id $node.Id -Force -Confirm:$false } } catch {}
    $icon.Visible = $false
    $icon.Dispose()
    [System.Windows.Forms.Application]::Exit()
}
$close.add_Click($shutdown)

# If the server dies on its own, say so and fold the tent.
$watch = New-Object System.Windows.Forms.Timer
$watch.Interval = 4000
$watch.add_Tick({
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
