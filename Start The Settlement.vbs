' Double-click to open The Settlement: starts the server hidden and puts a
' keeper icon in the system tray (right-click it to close everything).
Dim shell, scriptDir, quietArgument
Set shell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
quietArgument = ""
If WScript.Arguments.Count > 0 Then
    If WScript.Arguments(0) = "--startup" Then quietArgument = " -Quiet"
End If
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "tools\settlement-tray.ps1""" & quietArgument, 0, False
