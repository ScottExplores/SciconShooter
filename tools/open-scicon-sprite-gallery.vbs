Option Explicit

Dim fileSystem, shell, scriptDirectory, startScript, powerShell, command, exitCode
Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
startScript = fileSystem.BuildPath(scriptDirectory, "start-scicon-sprite-gallery.ps1")
powerShell = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
command = """" & powerShell & """ -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & startScript & """ -OpenBrowser"

exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
