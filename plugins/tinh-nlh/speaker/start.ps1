# Loa tỉnh NhiLe on Windows. The "Loa tỉnh NhiLe" desktop shortcut (made by the "bật Loa" command, setup.ps1) opens
# this file from the copy in ~\.tinh-nlh\speaker, so a plugin installed from claude.ai or from GitHub both work, no repo.
# Each launch: take the newest Loa from the installed plugin; install Claude Code or Node if missing (official builds,
# hash checked); ask for the key in a hidden prompt if none is saved (DPAPI); then open Claude Code on Sonnet as Loa.
# The speaker channel loads through --mcp-config (server:speaker), not by plugin name: a plugin installed from claude.ai is
# named @synced and cannot declare channels. File saved as UTF-8 with BOM so PowerShell 5.1 reads Vietnamese text.
param(
  [string]$Dir = (Join-Path $env:USERPROFILE '.tinh-nlh\speaker'),
  [string]$Work = (Join-Path $env:USERPROFILE 'TinhNhiLe'),
  # Tests only: print the Claude command line instead of running it.
  [switch]$DryRun,
  # Set when an older copy of this launcher ran the new one after an update, so it runs at most once.
  [switch]$Relaunched
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = 'Loa tỉnh NhiLe'

function Stop-Loa([string]$text) {
  Write-Host ''
  Write-Host $text
  Read-Host 'Bấm Enter để đóng' | Out-Null
  exit 1
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# 1. Newest Loa from the installed plugin (the plugin updates itself). Copy over the one in $Dir, used from this launch.
$plugins = Join-Path $env:USERPROFILE '.claude\plugins'
$best = $null
foreach ($pattern in @('cache\*\nlh\*\.claude-plugin\plugin.json', 'synced\*\*\.claude-plugin\plugin.json')) {
  foreach ($file in @(Get-ChildItem -Path (Join-Path $plugins $pattern) -File -ErrorAction SilentlyContinue)) {
    try { $manifest = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
    $root = Split-Path $file.DirectoryName -Parent
    if ($manifest.name -ne 'nlh' -or -not (Test-Path -LiteralPath (Join-Path $root 'speaker\start.ps1'))) { continue }
    try { $version = [version]$manifest.version } catch { continue }
    if (-not $best -or $version -gt $best.Version) { $best = @{ Version = $version; Root = $root } }
  }
}
$versionFile = Join-Path $Dir 'version.txt'
$current = $null
if (Test-Path -LiteralPath $versionFile) { try { $current = [version](Get-Content -LiteralPath $versionFile -Raw).Trim() } catch { } }
if ($best -and (-not $current -or $best.Version -ge $current)) {
  # This launcher is not the plugin's newest one (an update came): run the new one right away, once, instead of using it
  # only from the next launch (17e647c1, 26/10: the first launch after the update still set the old 10-minute loop).
  $newStart = Join-Path $best.Root 'speaker\start.ps1'
  $stale = $PSCommandPath -and ((Get-FileHash -LiteralPath $PSCommandPath).Hash -ne (Get-FileHash -LiteralPath $newStart).Hash)
  Copy-Item -LiteralPath (Join-Path $best.Root 'speaker\speaker.mjs') -Destination (Join-Path $Dir 'speaker.mjs') -Force
  Copy-Item -LiteralPath $newStart -Destination (Join-Path $Dir 'start.ps1') -Force
  Set-Content -LiteralPath $versionFile -Value $best.Version.ToString() -Encoding ascii
  if ($stale -and -not $Relaunched) {
    & (Join-Path $Dir 'start.ps1') -Dir $Dir -Work $Work -DryRun:$DryRun -Relaunched
    exit $LASTEXITCODE
  }
}
$speaker = Join-Path $Dir 'speaker.mjs'
if (-not (Test-Path -LiteralPath $speaker)) { Stop-Loa 'Chưa thấy plugin Nếp trên máy. Trong app Claude, mở mục Code, gõ "bật Loa", rồi bấm đúp Loa lại.' }

# 2. Claude Code. The official installer (claude.ai/install.ps1) puts claude.exe in ~\.local\bin without touching PATH;
# on machines with HOME set (Git users) ~ is HOME.
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
      # Separate process: the installer exits on error and must not close the Loa window.
      & (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $installer | Out-Host
    } catch { }
    Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
    $claude = Find-Claude
    if (-not $claude) { Stop-Loa 'Chưa cài được Claude Code. Kiểm mạng rồi bấm đúp Loa lại.' }
  }
}

# 3. Node (the speaker channel is one JavaScript file). Use Node 18+ if present; otherwise download node.exe from
# nodejs.org into $Dir\node once, checking SHA-256 against that release's SHASUMS256.txt.
$node = $null
$found = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($found) {
  try { if ([int]((& $found.Source -v) -replace '^v(\d+).*', '$1') -ge 18) { $node = $found.Source } } catch { }
}
if (-not $node) {
  $node = Join-Path $Dir 'node\node.exe'
  if (-not (Test-Path -LiteralPath $node)) {
    Write-Host 'Lần đầu: đang tải phần chạy của Loa, khoảng một phút.'
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
      Stop-Loa 'Chưa tải được phần chạy của Loa. Kiểm mạng rồi bấm đúp Loa lại.'
    }
  }
}

# 4. Loa key: if none, ask in a hidden prompt, check its shape, save with Windows DPAPI (only this Windows account on
# this machine can open it). The key never goes through chat, the screen or an environment variable. A key the hub
# rejects is deleted by the channel and asked again next launch. A key at an old place (~\.tinh-nlh\thap before Loa
# was named speaker, or Thap.cmd) is copied over.
$keyFile = Join-Path $Dir 'tower-key.dpapi'
$legacy = @((Join-Path $env:USERPROFILE '.tinh-nlh\thap\tower-key.dpapi'), (Join-Path $plugins 'data\tinh-nlh-nlh-governance\tower-key.dpapi')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not (Test-Path -LiteralPath $keyFile) -and $legacy) { Copy-Item -LiteralPath $legacy -Destination $keyFile }
if (-not (Test-Path -LiteralPath $keyFile)) {
  Write-Host ''
  Write-Host 'Lấy khoá ở web Nếp: Kết nối, Khoá cho Loa trên máy, Tạo khoá mới. Chép khoá rồi dán vào đây.'
  Write-Host 'Chữ không hiện ra khi dán, đó là bình thường. Dán xong bấm Enter.'
  $saved = $false
  for ($try = 0; $try -lt 3 -and -not $saved; $try++) {
    $secure = Read-Host -AsSecureString 'Khoá cho Loa'
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $ok = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() -match '^nlh_tower_[0-9a-f]{64}$'
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($ok) {
      $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $keyFile -Encoding ascii
      Write-Host 'Đã lưu khoá Loa trên máy này.'
      $saved = $true
    } else {
      Write-Host 'Chuỗi vừa dán không phải khoá Loa (bắt đầu bằng nlh_tower_). Dán lại.'
    }
  }
  if (-not $saved) { Stop-Loa 'Chưa lưu khoá. Bấm đúp Loa lại khi đã có khoá.' }
}

# 5. Channel config for this session only: NLH_TOWER=1 lives only here, so no other Claude Code session on the machine
# (nor the plugin's own speaker server) reads the feed. CLAUDE_BIN and NLH_TOWER_WORK let the channel look up, resume
# and open sessions. TOWER_ORIGIN (dev hub, trials) is passed on when set.
$envs = @{ NLH_TOWER = '1'; NLH_TOWER_DIR = $Dir; NLH_TOWER_WORK = $Work; CLAUDE_BIN = $claude }
if ($env:TOWER_ORIGIN) { $envs.TOWER_ORIGIN = $env:TOWER_ORIGIN }
$config = Join-Path $Dir 'speaker-mcp.json'
$json = @{ mcpServers = @{ speaker = @{ command = $node; args = @($speaker); env = $envs } } } | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($config, $json, (New-Object Text.UTF8Encoding $false))
# Loa needs no hook of the plugin: they call the Nếp connector, which the Loa session (only server speaker) does not
# have, so each turn printed about ten "Stop hook error: MCP server ... not connected" lines (17e647c1, 26/10). This
# session only: disableAllHooks, read from a file (PowerShell 5.1 drops the quotes of a JSON argument).
$settings = Join-Path $Dir 'speaker-settings.json'
[IO.File]::WriteAllText($settings, '{ "disableAllHooks": true }', (New-Object Text.UTF8Encoding $false))

# 6. Open Claude Code in its own work folder (new cell sessions open here too). claude and node go on the session PATH
# so plugin hooks run.
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Set-Location -LiteralPath $Work
$env:PATH = "$(Split-Path $claude -Parent);$(Split-Path $node -Parent);$env:PATH"
$opened = Join-Path $Dir 'opened.txt'
Write-Host ''
Write-Host 'Loa đang nghe Nếp. Đừng đóng cửa sổ này.'
if (-not (Test-Path -LiteralPath $opened)) {
  Write-Host 'Lần đầu Claude Code hỏi vài câu: bấm Enter để chọn sẵn. Tới bước đăng nhập, trình duyệt mở ra: bấm Authorize, quay lại đây bấm Enter.'
}
Write-Host 'Mỗi lần mở, hộp "Loading development channels" hiện ra: chọn "I am using this for local development", bấm Enter.'
Write-Host 'Dòng vàng "no MCP server configured with that name" là Claude Code báo nhầm: Loa vẫn nối. Bỏ qua dòng đó.'
Write-Host ''
$arguments = @('/nlh:speaker-loop', '-n', 'Loa tỉnh NhiLe', '--model', 'sonnet', '--settings', $settings, '--mcp-config', $config, '--dangerously-load-development-channels', 'server:speaker')
# With the channel, the opening prompt runs the skill once, no loop: the channel pushes each item (17e647c1 part 4, saves
# tokens). Fallback without the dev channel flag: the server still reads the hub and opens sessions; only sends wait
# for the 10-minute loop, so only the fallback has it.
$fallback = @('/loop 10m /nlh:speaker-loop') + $arguments[1..($arguments.Count - 3)]
if ($DryRun) {
  Write-Host "DRYRUN $claude $($arguments -join ' | ')"
  Write-Host "DRYRUN-FALLBACK $claude $($fallback -join ' | ')"
  exit 0
}
Set-Content -LiteralPath $opened -Value (Get-Date -Format o) -Encoding ascii
# Keep the machine awake while Loa is open (ES_CONTINUOUS | ES_SYSTEM_REQUIRED on this process, which waits for Claude);
# it ends by itself when the window closes. The screen may still turn off.
try {
  Add-Type -Namespace Loa -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
  [Loa.Power]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null
} catch { }
# The opening prompt goes before the flags: the channel flag takes several values, a prompt after it reads as a name.
$started = Get-Date
& $claude @arguments
# Claude quit within a minute (channel refused, or the channel dialog declined): run again without the channel.
if ($LASTEXITCODE -and ((Get-Date) - $started).TotalSeconds -lt 60) {
  Write-Host ''
  Write-Host 'Kênh báo nhanh chưa mở được. Loa vẫn chạy, mỗi 10 phút xem việc một lần.'
  & $claude @fallback
}
if ($LASTEXITCODE) { Stop-Loa 'Loa dừng vì lỗi ở trên. Bấm đúp Loa để mở lại.' }
