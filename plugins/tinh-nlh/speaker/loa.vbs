' Opens Loa tinh NhiLe with no window (the icon on the desktop and the login task both run this file with wscript).
' start.ps1 -Auto runs hidden; when Loa cannot run unseen yet (no key, not signed in to Claude) it opens a visible copy itself.
' Argument "login" (the login task): say nothing when Loa already runs.
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
here = files.GetParentFolderName(WScript.ScriptFullName)
extra = ""
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "login" Then extra = " -Quiet"
End If
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
shell.Run """" & powershell & """ -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & here & "\start.ps1"" -Auto" & extra, 0, False
