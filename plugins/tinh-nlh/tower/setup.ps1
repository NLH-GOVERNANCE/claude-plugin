# Lệnh "bật Tháp" (/tinh-nlh:batthap) chạy file này trên Windows, một lần mỗi máy. Chép Tháp từ plugin sang
# ~\.tinh-nlh\thap (chỗ cố định, plugin cập nhật không làm mất), rồi tạo lối tắt "Tháp tỉnh NhiLe" trên Desktop.
# Đã có lối tắt cùng tên trỏ chỗ khác (ví dụ Thap.cmd ở gốc repo của người bảo trì) thì giữ nguyên, không ghi đè.
# Không tự chạy cùng Windows, không hỏi khoá: khoá hỏi lúc bấm đúp Tháp lần đầu. File lưu UTF-8 có BOM cho PowerShell 5.1.
param(
  [string]$Dir = (Join-Path $env:USERPROFILE '.tinh-nlh\thap'),
  [string]$Desktop = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
# Chữ có dấu ra đúng cả khi đầu ra đi qua ống (Claude chạy lệnh "bật Tháp" và đọc dòng in ra).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$plugin = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $plugin '.claude-plugin\plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'thap.ps1') -Destination (Join-Path $Dir 'thap.ps1') -Force
Copy-Item -LiteralPath (Join-Path $plugin 'channel\tower.mjs') -Destination (Join-Path $Dir 'tower.mjs') -Force
Set-Content -LiteralPath (Join-Path $Dir 'version.txt') -Value $version -Encoding ascii

$name = 'Tháp tỉnh NhiLe'
$link = Join-Path $Desktop "$name.lnk"
$launcher = Join-Path $Dir 'thap.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# WScript.Shell bỏ mất chữ ngoài bảng mã của máy (chữ "ỉ" trong tên lối tắt, tên người dùng như "Thùy ỉ" trong đường
# dẫn) và không lưu được. Nên đọc ghi lối tắt bằng IShellLinkW của Windows, giao diện chữ Unicode.
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
    return text.ToString();
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
if (Test-Path -LiteralPath $link) {
  $existing = ''
  try { $existing = [ThapLink]::Arguments($link) } catch { }
  if (-not $existing.Contains($launcher)) {
    Write-Output "Trên màn hình chính đã có lối tắt $name khác, giữ nguyên lối tắt đó."
    exit 0
  }
}
[ThapLink]::Save($link, $powershell, "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`"", $Dir, $name)
Write-Output "Đã có biểu tượng $name trên màn hình chính."
