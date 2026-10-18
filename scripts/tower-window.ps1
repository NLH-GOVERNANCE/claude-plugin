# Thap.cmd goi file nay truoc khi mo Claude Code (phieu 98bd8b93). Hai viec:
# 1. Chua co loi tat "Tháp tỉnh NhiLe" tren man hinh chinh (Desktop) thi tao, tro toi Thap.cmd: lan sau bam dup la mo.
# 2. In mot dong loi thuong cho nguoi dung va dat ten cua so.
# Khong tu bat chay cung Windows (chua chot). File luu UTF-8 co BOM de PowerShell 5.1 doc dung chu co dau.
param([string]$Target = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Thap.cmd'))

$name = 'Tháp tỉnh NhiLe'
$message = 'Tháp đang nghe tỉnh NhiLe. Đừng đóng cửa sổ này.'

$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop "$name.lnk"
if (-not (Test-Path -LiteralPath $link)) {
  # WScript.Shell khong luu duoc ten file co chu ngoai bang ma cua may (chu "ỉ"): luu ten tam bang chu ASCII, roi doi ten.
  $temp = Join-Path $desktop ("tower-" + [guid]::NewGuid().ToString('N') + '.lnk')
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($temp)
  $shortcut.TargetPath = $Target
  $shortcut.WorkingDirectory = Split-Path $Target -Parent
  try {
    $shortcut.Save()
    Move-Item -LiteralPath $temp -Destination $link
  } finally {
    # Doi ten hong (vi du loi tat vua duoc tao o cua so khac) thi khong de file tam lai tren Desktop.
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  }
}

$Host.UI.RawUI.WindowTitle = $name
Write-Host ''
Write-Host $message
Write-Host ''
