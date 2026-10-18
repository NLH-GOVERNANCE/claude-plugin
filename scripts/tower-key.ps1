# Thap.cmd goi file nay truoc khi mo Claude Code. Chua co khoa Thap da luu thi hien o nhap an chu, kiem dang khoa,
# roi luu bang DPAPI cua Windows (chi tai khoan Windows nay tren may nay mo duoc) vao thu muc du lieu cua plugin.
# Kenh tower (channel/tower.mjs) doc file do. Khoa khong qua chat, khong ghi ra man hinh, khong nam trong bien moi truong.
# Hub tu choi khoa thi kenh xoa file, lan mo Thap sau hoi lai. File luu UTF-8 co BOM de PowerShell 5.1 doc dung chu.
param([string]$Dir = (Join-Path $env:USERPROFILE '.claude\plugins\data\tinh-nlh-nlh-governance'))

$file = Join-Path $Dir 'tower-key.dpapi'
if (Test-Path -LiteralPath $file) { exit 0 }

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
for ($try = 0; $try -lt 3; $try++) {
  $secure = Read-Host -AsSecureString 'Dán khoá cho Tháp (lấy ở web tỉnh NhiLe, Kết nối, Khoá cho Tháp trên máy)'
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $ok = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() -match '^nlh_tower_[0-9a-f]{64}$'
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  if ($ok) {
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $file -Encoding ascii
    Write-Host 'Đã lưu khoá Tháp trên máy này.'
    exit 0
  }
  Write-Host 'Chuỗi vừa dán không phải khoá Tháp (bắt đầu bằng nlh_tower_). Dán lại.'
}
Write-Host 'Chưa lưu khoá. Mở lại Tháp khi đã có khoá.'
exit 1
