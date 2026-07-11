' Double-click to open The Settlement: starts the server hidden and puts a
' keeper icon in the system tray (right-click it to close everything).
Dim shell, scriptDir
Set shell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "tools\settlement-tray.ps1""", 0, False
