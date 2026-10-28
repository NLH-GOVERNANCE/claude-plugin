# The "bật Loa" command (/tinh-nlh:speaker) runs this on Windows, once per machine. Copies Loa from the plugin to
# ~\.tinh-nlh\speaker (a fixed place plugin updates do not wipe), then makes the "Loa tỉnh NhiLe" desktop shortcut.
# A shortcut of the same name pointing elsewhere is kept. The old "Tháp tỉnh NhiLe" shortcut that pointed to Loa's
# earlier launcher (~\.tinh-nlh, or Thap.cmd of a repo clone) is removed, so nobody deletes it by hand. Never asks for the
# key: the first double-click does. Registers a per-user scheduled task so Loa opens by itself at login (ticket
# 98bd8b93, line 4b62d007 point 3). File saved as UTF-8 with BOM for PowerShell 5.1.
param(
  [string]$Dir = (Join-Path $env:USERPROFILE '.tinh-nlh\speaker'),
  [string]$Desktop = [Environment]::GetFolderPath('Desktop'),
  # Tests only: do not register the login task.
  [switch]$NoAutostart
)

$ErrorActionPreference = 'Stop'
# Vietnamese text stays right when output goes through a pipe (Claude runs "bật Loa" and reads the printed line).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$plugin = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $plugin '.claude-plugin\plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start.ps1') -Destination (Join-Path $Dir 'start.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'speaker.mjs') -Destination (Join-Path $Dir 'speaker.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'pair.mjs') -Destination (Join-Path $Dir 'pair.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'policy.mjs') -Destination (Join-Path $Dir 'policy.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'loa.vbs') -Destination (Join-Path $Dir 'loa.vbs') -Force
Set-Content -LiteralPath (Join-Path $Dir 'version.txt') -Value $version -Encoding ascii

$name = 'Loa tỉnh NhiLe'
$oldName = 'Tháp tỉnh NhiLe'
$link = Join-Path $Desktop "$name.lnk"
$launcher = Join-Path $Dir 'loa.vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
# Open Loa at every login of this Windows account: a scheduled task of the user's own, no admin rights, no window (loa.vbs runs start.ps1 hidden).
# Registering again replaces it, so running "bật Loa" twice is fine.
if (-not $NoAutostart) {
  try {
    $user = "$env:USERDOMAIN\$env:USERNAME"
    $action = New-ScheduledTaskAction -Execute $wscript -Argument "`"$launcher`" login" -WorkingDirectory $Dir
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Write-Output 'Loa sẽ tự mở mỗi khi bạn đăng nhập máy.'
  } catch {
    Write-Output 'Chưa đặt được Loa tự mở khi đăng nhập; mỗi lần bật máy, bấm đúp biểu tượng Loa.'
  }
}
# WScript.Shell drops characters outside the machine code page ("ỉ" in the shortcut name, user names like "Thùy ỉ" in
# paths) and cannot save. So shortcuts are read and written through Windows IShellLinkW, the Unicode interface.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

public static class ThapLink {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  class ShellLink { }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
  interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file, int size, IntPtr data, int flags);
    void GetIDList(out IntPtr list);
    void SetIDList(IntPtr list);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int size);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder dir, int size);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int size);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
    void GetHotkey(out short key);
    void SetHotkey(short key);
    void GetShowCmd(out int cmd);
    void SetShowCmd(int cmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, int reserved);
    void Resolve(IntPtr window, int flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
  }

  public static string Arguments(string link) {
    var shell = (IShellLinkW)new ShellLink();
    ((IPersistFile)shell).Load(link, 0);
    var text = new StringBuilder(4096);
    shell.GetArguments(text, text.Capacity);
    var target = new StringBuilder(4096);
    shell.GetPath(target, target.Capacity, IntPtr.Zero, 0);
    return target.ToString() + " " + text.ToString();
  }

  public static void Save(string link, string target, string args, string dir, string description) {
    var shell = (IShellLinkW)new ShellLink();
    shell.SetPath(target);
    shell.SetArguments(args);
    shell.SetWorkingDirectory(dir);
    shell.SetDescription(description);
    ((IPersistFile)shell).Save(link, true);
  }
}
'@
# Old shortcut from before Loa had its name: remove it only when it is ours.
$oldLink = Join-Path $Desktop "$oldName.lnk"
if (Test-Path -LiteralPath $oldLink) {
  $old = ''
  try { $old = [ThapLink]::Arguments($oldLink) } catch { }
  if ($old -match '\.tinh-nlh\\|Thap\.cmd') {
    Remove-Item -LiteralPath $oldLink -Force
    Write-Output "Đã bỏ biểu tượng cũ $oldName."
  }
}
if (Test-Path -LiteralPath $link) {
  $existing = ''
  try { $existing = [ThapLink]::Arguments($link) } catch { }
  if (-not $existing.Contains($launcher) -and $existing -notmatch '\.tinh-nlh\\') {
    Write-Output "Trên màn hình chính đã có lối tắt $name khác, giữ nguyên lối tắt đó."
    exit 0
  }
}
[ThapLink]::Save($link, $wscript, "`"$launcher`"", $Dir, $name)
Write-Output "Đã có biểu tượng $name trên màn hình chính."
