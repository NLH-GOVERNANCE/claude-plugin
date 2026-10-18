# Tháp tỉnh NhiLe trên Windows. Lối tắt "Tháp tỉnh NhiLe" trên Desktop (do lệnh "bật Tháp", setup.ps1, tạo) mở file
# này từ bản chép ở ~\.tinh-nlh\thap, nên plugin cài từ claude.ai hay từ GitHub đều chạy được, không cần repo.
# Mỗi lần mở: lấy bản mới nhất của Tháp từ plugin đã cài; máy chưa có Claude Code hay Node thì tự cài (bản chính thức,
# kiểm mã băm); chưa có khoá thì hỏi trong ô nhập ẩn chữ, lưu DPAPI; rồi mở Claude Code chạy Sonnet, ngồi ô Tháp.
# Kênh tower nạp qua --mcp-config (server:tower), không qua tên plugin: plugin cài từ claude.ai mang tên @synced, không
# khai kênh được. Không tự chạy cùng Windows. File lưu UTF-8 có BOM để PowerShell 5.1 đọc đúng chữ có dấu.
param(
  [string]$Dir = (Join-Path $env:USERPROFILE '.tinh-nlh\thap'),
  [string]$Work = (Join-Path $env:USERPROFILE 'TinhNhiLe'),
  # Chỉ để thử: in câu lệnh mở Claude thay vì chạy.
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = 'Tháp tỉnh NhiLe'

function Stop-Thap([string]$text) {
  Write-Host ''
  Write-Host $text
  Read-Host 'Bấm Enter để đóng' | Out-Null
  exit 1
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# 1. Bản mới nhất của Tháp từ plugin đã cài (plugin tự cập nhật). Chép đè bản ở $Dir, dùng từ lần mở này.
$plugins = Join-Path $env:USERPROFILE '.claude\plugins'
$best = $null
foreach ($pattern in @('cache\*\tinh-nlh\*\.claude-plugin\plugin.json', 'synced\*\*\.claude-plugin\plugin.json')) {
  foreach ($file in @(Get-ChildItem -Path (Join-Path $plugins $pattern) -File -ErrorAction SilentlyContinue)) {
    try { $manifest = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
    $root = Split-Path $file.DirectoryName -Parent
    if ($manifest.name -ne 'tinh-nlh' -or -not (Test-Path -LiteralPath (Join-Path $root 'tower\thap.ps1'))) { continue }
    try { $version = [version]$manifest.version } catch { continue }
    if (-not $best -or $version -gt $best.Version) { $best = @{ Version = $version; Root = $root } }
  }
}
$versionFile = Join-Path $Dir 'version.txt'
$current = $null
if (Test-Path -LiteralPath $versionFile) { try { $current = [version](Get-Content -LiteralPath $versionFile -Raw).Trim() } catch { } }
if ($best -and (-not $current -or $best.Version -ge $current)) {
  Copy-Item -LiteralPath (Join-Path $best.Root 'channel\tower.mjs') -Destination (Join-Path $Dir 'tower.mjs') -Force
  Copy-Item -LiteralPath (Join-Path $best.Root 'tower\thap.ps1') -Destination (Join-Path $Dir 'thap.ps1') -Force
  Set-Content -LiteralPath $versionFile -Value $best.Version.ToString() -Encoding ascii
}
$tower = Join-Path $Dir 'tower.mjs'
if (-not (Test-Path -LiteralPath $tower)) { Stop-Thap 'Chưa thấy plugin Tỉnh NhiLe trên máy. Trong app Claude, mở mục Code, gõ "bật Tháp", rồi bấm đúp Tháp lại.' }

# 2. Claude Code. Trình cài chính thức (claude.ai/install.ps1) đặt claude.exe ở ~\.local\bin, không thêm vào PATH; máy có
# biến HOME (người dùng Git) thì ~ là HOME.
$homes = @($env:USERPROFILE) + @($env:HOME | Where-Object { $_ })
function Find-Claude { foreach ($at in $homes) { $file = Join-Path $at '.local\bin\claude.exe'; if (Test-Path -LiteralPath $file) { return $file } } }
$claude = Find-Claude
if (-not $claude) {
  $found = Get-Command claude.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) {
    $claude = $found.Source
  } else {
    Write-Host 'Lần đầu: đang cài Claude Code cho máy này, khoảng một phút.'
    $installer = Join-Path $Dir 'install-claude.ps1'
    try {
      Invoke-WebRequest -Uri 'https://claude.ai/install.ps1' -OutFile $installer -UseBasicParsing
      # Chạy ở tiến trình riêng: trình cài thoát bằng exit khi lỗi, không được đóng luôn cửa sổ Tháp.
      & (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $installer | Out-Host
    } catch { }
    Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
    $claude = Find-Claude
    if (-not $claude) { Stop-Thap 'Chưa cài được Claude Code. Kiểm mạng rồi bấm đúp Tháp lại.' }
  }
}

# 3. Node (kênh tower là một file JavaScript). Máy có Node 18 trở lên thì dùng; không thì tải node.exe của nodejs.org
# vào $Dir\node một lần, kiểm mã băm SHA-256 theo SHASUMS256.txt của chính bản đó.
$node = $null
$found = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($found) {
  try { if ([int]((& $found.Source -v) -replace '^v(\d+).*', '$1') -ge 18) { $node = $found.Source } } catch { }
}
if (-not $node) {
  $node = Join-Path $Dir 'node\node.exe'
  if (-not (Test-Path -LiteralPath $node)) {
    Write-Host 'Lần đầu: đang tải phần chạy của Tháp, khoảng một phút.'
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
    $base = 'https://nodejs.org/dist/latest-v22.x'
    $part = "$node.part"
    try {
      $sums = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing).Content
      $line = ($sums -split "`n") | Where-Object { $_ -match "^([0-9a-f]{64})\s+$arch/node\.exe\s*$" } | Select-Object -First 1
      if (-not $line) { throw 'no checksum' }
      $hash = ($line -split '\s+')[0]
      New-Item -ItemType Directory -Force -Path (Split-Path $node -Parent) | Out-Null
      Invoke-WebRequest -Uri "$base/$arch/node.exe" -OutFile $part -UseBasicParsing
      if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash.ToLower() -ne $hash) { throw 'checksum' }
      Move-Item -LiteralPath $part -Destination $node -Force
    } catch {
      Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue
      Stop-Thap 'Chưa tải được phần chạy của Tháp. Kiểm mạng rồi bấm đúp Tháp lại.'
    }
  }
}

# 4. Khoá Tháp: chưa có thì hỏi trong ô nhập ẩn chữ, kiểm dạng khoá, lưu bằng DPAPI của Windows (chỉ tài khoản Windows
# này trên máy này mở được). Khoá không qua chat, không ra màn hình, không nằm trong biến môi trường. Hub từ chối khoá
# thì kênh xoá file, lần mở sau hỏi lại. Máy đã có khoá ở chỗ cũ (Thap.cmd ở gốc repo) thì chép sang.
$keyFile = Join-Path $Dir 'tower-key.dpapi'
$legacy = Join-Path $plugins 'data\tinh-nlh-nlh-governance\tower-key.dpapi'
if (-not (Test-Path -LiteralPath $keyFile) -and (Test-Path -LiteralPath $legacy)) { Copy-Item -LiteralPath $legacy -Destination $keyFile }
if (-not (Test-Path -LiteralPath $keyFile)) {
  Write-Host ''
  Write-Host 'Lấy khoá ở web tỉnh NhiLe: Kết nối, Khoá cho Tháp trên máy, Tạo khoá mới. Chép khoá rồi dán vào đây.'
  Write-Host 'Chữ không hiện ra khi dán, đó là bình thường. Dán xong bấm Enter.'
  $saved = $false
  for ($try = 0; $try -lt 3 -and -not $saved; $try++) {
    $secure = Read-Host -AsSecureString 'Khoá cho Tháp'
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $ok = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() -match '^nlh_tower_[0-9a-f]{64}$'
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($ok) {
      $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $keyFile -Encoding ascii
      Write-Host 'Đã lưu khoá Tháp trên máy này.'
      $saved = $true
    } else {
      Write-Host 'Chuỗi vừa dán không phải khoá Tháp (bắt đầu bằng nlh_tower_). Dán lại.'
    }
  }
  if (-not $saved) { Stop-Thap 'Chưa lưu khoá. Bấm đúp Tháp lại khi đã có khoá.' }
}

# 5. Cấu hình kênh tower cho đúng phiên này: NLH_TOWER=1 chỉ nằm ở đây, nên các phiên Claude Code khác trên máy
# (và server tower có sẵn của plugin) không đọc luồng việc. TOWER_ORIGIN (hub dev, bản thử) nếu có thì chuyển tiếp.
$envs = @{ NLH_TOWER = '1'; NLH_TOWER_DIR = $Dir }
if ($env:TOWER_ORIGIN) { $envs.TOWER_ORIGIN = $env:TOWER_ORIGIN }
$config = Join-Path $Dir 'tower-mcp.json'
$json = @{ mcpServers = @{ tower = @{ command = $node; args = @($tower); env = $envs } } } | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($config, $json, (New-Object Text.UTF8Encoding $false))

# 6. Mở Claude Code ở thư mục làm việc riêng (ô Tháp mở phiên nền cho các ô ở đây). claude và node vào PATH của phiên,
# để Tháp mở được phiên nền và các hook của plugin chạy được.
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Set-Location -LiteralPath $Work
$env:PATH = "$(Split-Path $claude -Parent);$(Split-Path $node -Parent);$env:PATH"
$opened = Join-Path $Dir 'opened.txt'
Write-Host ''
Write-Host 'Tháp đang nghe tỉnh NhiLe. Đừng đóng cửa sổ này.'
if (-not (Test-Path -LiteralPath $opened)) {
  Write-Host 'Lần đầu Claude Code hỏi vài câu: bấm Enter để chọn sẵn. Tới bước đăng nhập, trình duyệt mở ra: bấm Authorize, quay lại đây bấm Enter.'
}
Write-Host 'Mỗi lần mở, hộp "Loading development channels" hiện ra: chọn "I am using this for local development", bấm Enter.'
Write-Host ''
$arguments = @('/loop 10m /tinh-nlh:thap', '-n', 'Thap truc', '--model', 'sonnet', '--mcp-config', $config, '--dangerously-load-development-channels', 'server:tower')
if ($DryRun) {
  Write-Host "DRYRUN $claude $($arguments -join ' | ')"
  exit 0
}
Set-Content -LiteralPath $opened -Value (Get-Date -Format o) -Encoding ascii
# Câu mở đầu đứng trước các cờ: cờ kênh nhận nhiều giá trị, câu đứng sau bị hiểu là tên kênh.
& $claude @arguments
if ($LASTEXITCODE) { Stop-Thap 'Tháp dừng vì lỗi ở trên. Bấm đúp Tháp để mở lại.' }
