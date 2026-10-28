# Loa tỉnh NhiLe on Windows. The "Loa tỉnh NhiLe" desktop shortcut and the login task (made by the "bật Loa" command,
# setup.ps1) open loa.vbs, which opens this file from the copy in ~\.tinh-nlh\speaker with no window, so a plugin installed
# from claude.ai or from GitHub both work, no repo.
# Each launch: take the newest Loa from the installed plugin; install Claude Code or Node if missing (official builds,
# hash checked); if no key is saved, ask for it with the "Cho phép" button (pair.mjs, DPAPI); ask once for the permission
# of the plugin's channel (policy.mjs); then open Claude Code on Sonnet as Loa.
# The login task is made here, when the person double-clicks Loa (Register-Login), not by the Claude session that installed
# Loa: a session in Auto mode can be refused the right to schedule a task, which left the user with a dead end.
# Hidden or not: loa.vbs always starts this file hidden with -Auto. When Loa cannot run unseen yet (no key, not signed in
# to Claude, first questions not answered) it opens a visible copy instead, which answers those once, then hands over to a
# hidden Loa by itself (-Handoff). One Loa per machine (a mutex). The channel loads by the plugin's name (--channels
# plugin:nlh@<market>) when policy.mjs says the machine allows it; otherwise a 10-minute loop, never an error.
# File saved as UTF-8 with BOM so PowerShell 5.1 reads Vietnamese text.
param(
  [string]$Dir = (Join-Path $env:USERPROFILE '.tinh-nlh\speaker'),
  [string]$Work = (Join-Path $env:USERPROFILE 'TinhNhiLe'),
  # Tests only: print the Claude command line instead of running it.
  [switch]$DryRun,
  # Set when an older copy of this launcher ran the new one after an update, so it runs at most once.
  [switch]$Relaunched,
  # Started by loa.vbs, no window. Not ready to run unseen: opens a visible copy and ends.
  [switch]$Auto,
  # Started at login: another Loa already running is not worth a word.
  [switch]$Quiet,
  # Exit 0 when Loa can run unseen (key saved, permission asked, signed in to Claude), 1 when not.
  [switch]$CheckReady,
  # A visible first run: wait until Loa can run unseen, then close the window of this process id and let a hidden Loa take over.
  [int]$Handoff = 0,
  # Make or refresh the login task, then end (what a double-click does on the way; also for tests).
  [switch]$RegisterOnly,
  [string]$TaskName = 'Loa tỉnh NhiLe'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = 'Loa tỉnh NhiLe'

# $technical: a line for the people who keep Nếp, left like the hidden case for the next Claude session to report, also when a person saw the
# window. $shown: the sentence was already printed by the program that failed.
function Stop-Loa([string]$text, [string]$technical = '', [switch]$shown) {
  Write-Host ''
  if (-not $shown) { Write-Host $text }
  # Hidden: nobody sees the window nor can press Enter. One line is left for the next Claude session to say and report to the CTO cell (hooks/machine.mjs).
  if ($Auto -or $technical) {
    $reason = if ($technical) { "$text ($technical)" } else { $text }
    try { [IO.File]::WriteAllText((Join-Path $Dir 'last-error.json'), (ConvertTo-Json @{ at = (Get-Date -Format o); reason = $reason } -Compress), (New-Object Text.UTF8Encoding $false)) } catch { }
  }
  if (-not $Auto) { Read-Host 'Bấm Enter để đóng' | Out-Null }
  exit 1
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# Anything technical goes to loa.log, never to the screen: the person sees only short Vietnamese sentences.
function Add-Log([string]$text) {
  try { Add-Content -LiteralPath (Join-Path $Dir 'loa.log') -Value "$(Get-Date -Format o) $text" -Encoding UTF8 } catch { }
}

# Open Loa at every login of this Windows account: a scheduled task of the user's own, no admin rights, no window (loa.vbs
# runs this file hidden). Made once, left alone when it already points at this Loa; a failure only goes to loa.log.
function Register-Login {
  try {
    $launcher = Join-Path $Dir 'loa.vbs'
    $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $argument = "`"$launcher`" login"
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task -and $task.Actions[0].Execute -eq $wscript -and $task.Actions[0].Arguments -eq $argument) { return }
    $user = "$env:USERDOMAIN\$env:USERNAME"
    $action = New-ScheduledTaskAction -Execute $wscript -Argument $argument -WorkingDirectory $Dir
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  } catch {
    Add-Log "login task: $($_.Exception.Message)"
  }
}
if ($RegisterOnly) { Register-Login; exit 0 }
if (-not $Quiet -and -not $DryRun -and -not $CheckReady -and $Handoff -eq 0) { Register-Login }

# The official installer (claude.ai/install.ps1) puts claude.exe in ~\.local\bin without touching PATH; on machines with
# HOME set (Git users) ~ is HOME. A machine with only the Claude app (the common case) has the program inside the app, in
# the app's data folder; it is called by its full path, no PATH needed (28/10).
$homes = @($env:USERPROFILE) + @($env:HOME | Where-Object { $_ })
function Find-Claude {
  foreach ($at in $homes) { $file = Join-Path $at '.local\bin\claude.exe'; if (Test-Path -LiteralPath $file) { return $file } }
  $bundled = @()
  foreach ($pattern in @((Join-Path $env:LOCALAPPDATA 'Claude-Data\*\claude-code\*\*\claude.exe'), (Join-Path $env:APPDATA 'Claude\claude-code\*\claude.exe'))) {
    $bundled += @(Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue)
  }
  if ($bundled) { return ($bundled | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
  $found = Get-Command claude.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { return $found.Source }
}
# Node 18+ if present, else the node.exe this launcher downloaded into $Dir\node.
function Find-Node {
  $found = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) {
    try { if ([int]((& $found.Source -v) -replace '^v(\d+).*', '$1') -ge 18) { return $found.Source } } catch { }
  }
  $own = Join-Path $Dir 'node\node.exe'
  if (Test-Path -LiteralPath $own) { return $own }
}
# Can Loa run with nobody looking? Key saved, permission asked once (policy-status.json), Claude Code and Node there, signed
# in to Claude, first questions of Claude Code answered. Anything missing needs a person, so a window.
function Test-Ready {
  if (-not (Test-Path -LiteralPath (Join-Path $Dir 'tower-key.dpapi'))) { return $false }
  if (-not (Test-Path -LiteralPath (Join-Path $Dir 'policy-status.json'))) { return $false }
  # Opened once in a window, so the folder-trust question of Claude Code was answered by a person.
  if (-not (Test-Path -LiteralPath (Join-Path $Dir 'opened.txt'))) { return $false }
  $exe = Find-Claude
  if (-not $exe -or -not (Find-Node)) { return $false }
  try {
    $config = Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.claude.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $config.hasCompletedOnboarding) { return $false }
    & $exe auth status | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}
# Is the Loa channel server up in a Claude session (tower.lock names a live process)? Then the folder and every first
# question were answered, because the server only starts after them.
function Test-Listening {
  try {
    $id = [int](Get-Content -LiteralPath (Join-Path $Dir 'tower.lock') -Raw).Trim()
    return [bool](Get-Process -Id $id -ErrorAction SilentlyContinue)
  } catch { return $false }
}

if ($CheckReady) { if (Test-Ready) { exit 0 } else { exit 1 } }

if ($Handoff -gt 0) {
  # Up to 30 minutes, every 15 seconds. Ready and listening twice in a row, then end the visible window with the Claude
  # inside it and open the hidden Loa.
  $count = 0
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 15
    if (-not (Get-Process -Id $Handoff -ErrorAction SilentlyContinue)) { exit 0 }
    if ((Test-Ready) -and (Test-Listening)) { $count++ } else { $count = 0 }
    if ($count -ge 2) {
      & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $Handoff /T /F | Out-Null
      Start-Sleep -Seconds 3
      Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wscript.exe') -ArgumentList "`"$(Join-Path $Dir 'loa.vbs')`" login" -WindowStyle Hidden
      exit 0
    }
  }
  exit 0
}

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
  foreach ($name in @('speaker.mjs', 'pair.mjs', 'policy.mjs', 'loa.vbs')) {
    $from = Join-Path $best.Root "speaker\$name"
    if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination (Join-Path $Dir $name) -Force }
  }
  Copy-Item -LiteralPath $newStart -Destination (Join-Path $Dir 'start.ps1') -Force
  Set-Content -LiteralPath $versionFile -Value $best.Version.ToString() -Encoding ascii
  if ($stale -and -not $Relaunched) {
    & (Join-Path $Dir 'start.ps1') -Dir $Dir -Work $Work -DryRun:$DryRun -Auto:$Auto -Quiet:$Quiet -Relaunched
    exit $LASTEXITCODE
  }
}
$speaker = Join-Path $Dir 'speaker.mjs'
if (-not (Test-Path -LiteralPath $speaker)) { Stop-Loa 'Chưa thấy plugin Nếp trên máy. Trong app Claude, mở mục Code, gõ "bật Loa", rồi bấm đúp Loa lại.' }

# 1b. One Loa per machine. A second one (the icon pressed again, login while it runs) says so and ends.
$mutex = New-Object Threading.Mutex($false, 'Local\LoaTinhNhiLe')
$owned = $false
try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
# The key was taken back (the hub refused it) while Loa runs hidden: only a visible Loa can ask for a new one, so the icon
# ends the hidden one first (loa.pid is the launcher's process id) and goes on.
$pidFile = Join-Path $Dir 'loa.pid'
if (-not $owned -and -not $Auto -and -not $DryRun -and -not (Test-Path -LiteralPath (Join-Path $Dir 'tower-key.dpapi')) -and (Test-Path -LiteralPath $pidFile)) {
  try {
    & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID ([int](Get-Content -LiteralPath $pidFile -Raw).Trim()) /T /F | Out-Null
    Start-Sleep -Seconds 2
    try { $owned = $mutex.WaitOne(3000) } catch [Threading.AbandonedMutexException] { $owned = $true }
  } catch { }
}
if (-not $owned -and -not $DryRun) {
  if ($Auto -and -not $Quiet) {
    try {
      Add-Type -AssemblyName PresentationFramework
      [void][Windows.MessageBox]::Show('Loa đang chạy rồi, không cần mở lại.', 'Loa tỉnh NhiLe')
    } catch { }
  } elseif (-not $Auto) {
    Write-Host 'Loa đang chạy rồi, không cần mở lại.'
    Start-Sleep -Seconds 4
  }
  exit 0
}
if ($owned -and -not $DryRun) { Set-Content -LiteralPath $pidFile -Value $PID -Encoding ascii }
# Hidden but something needs a person: open a visible copy, free the place first.
if ($Auto -and -not $DryRun -and -not (Test-Ready)) {
  $mutex.ReleaseMutex()
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Dir\start.ps1`"" | Out-Null
  exit 0
}

# 2. Claude Code. The official installer puts claude.exe in ~\.local\bin.
$claude = Find-Claude
if (-not $claude) {
  Write-Host 'Lần đầu: Loa đang chuẩn bị máy này, khoảng một phút.'
  $installer = Join-Path $Dir 'install-claude.ps1'
  $installOut = Join-Path $Dir 'install-claude.out'
  try {
    Invoke-WebRequest -Uri 'https://claude.ai/install.ps1' -OutFile $installer -UseBasicParsing
    # Separate process: the installer exits on error and must not close the Loa window. Its English text (and its advice
    # about PATH) goes to loa.log, not the screen.
    Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$installer`"" -Wait -WindowStyle Hidden -RedirectStandardOutput $installOut -RedirectStandardError "$installOut.err"
  } catch { Add-Log "install claude: $($_.Exception.Message)" }
  foreach ($text in @($installOut, "$installOut.err")) {
    if (Test-Path -LiteralPath $text) { Add-Log "install claude: $((Get-Content -LiteralPath $text -Raw -ErrorAction SilentlyContinue) -replace '\s+', ' ')" }
  }
  Remove-Item -LiteralPath $installer, $installOut, "$installOut.err" -Force -ErrorAction SilentlyContinue
  $claude = Find-Claude
  if (-not $claude) { Stop-Loa 'Loa chưa chuẩn bị xong máy này. Kiểm mạng rồi bấm đúp Loa lại.' }
}

# 3. Node (the speaker channel is one JavaScript file). Use Node 18+ if present; otherwise download node.exe from
# nodejs.org into $Dir\node once, checking SHA-256 against that release's SHASUMS256.txt.
$node = Find-Node
if (-not $node) {
  $node = Join-Path $Dir 'node\node.exe'
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

# 4. Loa key: if none, the machine makes its own key and asks for it with the "Cho phép" button (pair.mjs, item D): it sends
# only the key's hash, opens the Nếp page of a short code, and saves the key (Windows DPAPI: only this Windows account on this
# machine can open it) once the person pressed Cho phép. The key reaches the hub only over https, at the status poll; never the web, a URL, chat or the screen; the hub's ledger keeps only the hash.
# A key the hub rejects is deleted by the channel and asked again next launch. A key at an old place (~\.tinh-nlh\thap before
# Loa was named speaker, or Thap.cmd) is copied over.
$keyFile = Join-Path $Dir 'tower-key.dpapi'
$legacy = @((Join-Path $env:USERPROFILE '.tinh-nlh\thap\tower-key.dpapi'), (Join-Path $plugins 'data\tinh-nlh-nlh-governance\tower-key.dpapi')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not (Test-Path -LiteralPath $keyFile) -and $legacy) { Copy-Item -LiteralPath $legacy -Destination $keyFile }
if (-not (Test-Path -LiteralPath $keyFile)) {
  $pair = Join-Path $Dir 'pair.mjs'
  if (-not (Test-Path -LiteralPath $pair)) { Stop-Loa 'Chưa thấy phần xin phép của Loa. Trong app Claude, mở mục Code, gõ "bật Loa", rồi bấm đúp Loa lại.' }
  Write-Host ''
  Write-Host 'Loa cần được bạn cho phép một lần. Trang Nếp sắp mở: bấm Cho phép.'
  $detailFile = Join-Path $Dir 'pair-detail.txt'
  Remove-Item -LiteralPath $detailFile -Force -ErrorAction SilentlyContinue
  & $node $pair --dir $Dir | Out-Host
  $paired = $LASTEXITCODE
  # Exit 2: the hub is not ready for this step (nothing a person can fix). pair.mjs said so in one sentence; its technical line goes to the
  # next Claude session, which opens a ticket for the CTO cell. No key is saved, so the next launch asks again by itself.
  if ($paired -eq 2) {
    $detail = if (Test-Path -LiteralPath $detailFile) { (Get-Content -LiteralPath $detailFile -Raw).Trim() } else { 'pair.mjs exit 2' }
    Stop-Loa 'Nếp chưa sẵn sàng bước này nên Loa chưa báo việc mới được. Người lo kỹ thuật sẽ được báo; lần mở máy sau Loa tự hỏi lại.' $detail -shown
  }
  if ($paired -ne 0 -or -not (Test-Path -LiteralPath $keyFile)) { Stop-Loa 'Loa chưa được phép chạy trên máy này. Bấm đúp Loa lại.' }
}

# 4b. Channel permission (policy.mjs, ticket 26f86f3d): Claude Code only takes the plugin's channel when the machine's list
# allows it. Written once, with the one permission box of Windows; "No" is kept in policy-status.json and never asked again,
# Loa then runs the 10-minute way. Already allowed: nothing is shown. Never hidden: a box nobody sees is no question.
$policy = Join-Path $Dir 'policy.mjs'
$policyStatus = Join-Path $Dir 'policy-status.json'
$declined = (Test-Path -LiteralPath $policyStatus) -and ((Get-Content -LiteralPath $policyStatus -Raw) -match '"status":"declined"')
if (-not $DryRun -and (Test-Path -LiteralPath $policy) -and -not $declined -and -not $Auto) {
  & $node $policy ensure --status $policyStatus | Out-Host
}

# 5. This session only: NLH_TOWER=1 lives only in the environment of this launch, so no other Claude Code session on the
# machine reads the feed; the plugin's speaker server, started by Claude Code in this session, inherits it. CLAUDE_BIN and
# NLH_TOWER_WORK let the channel look up, resume and open sessions. TOWER_ORIGIN (dev hub, trials) is passed on when set.
$envs = @{ NLH_TOWER = '1'; NLH_TOWER_DIR = $Dir; NLH_TOWER_WORK = $Work; CLAUDE_BIN = $claude }
foreach ($name in $envs.Keys) { Set-Item -LiteralPath "Env:$name" -Value $envs[$name] }
# Loa needs no hook of the plugin: they call the Nếp connector, which the Loa session does not have, so each turn printed
# about ten "Stop hook error: MCP server ... not connected" lines (17e647c1, 26/10). This session only: disableAllHooks,
# read from a file (PowerShell 5.1 drops the quotes of a JSON argument).
$settings = Join-Path $Dir 'speaker-settings.json'
[IO.File]::WriteAllText($settings, '{ "disableAllHooks": true }', (New-Object Text.UTF8Encoding $false))
# How to open Claude: "channel plugin:nlh@<market>" (allowed), "loop" (not allowed: the plugin's server, 10-minute loop) or
# "loop-config" (no plugin from a market, only the one synced from claude.ai: the server comes through --mcp-config).
$mode = 'loop-config'
if (Test-Path -LiteralPath $policy) { $mode = [string](& $node $policy mode | Select-Object -First 1) }
$config = Join-Path $Dir 'speaker-mcp.json'
if ($mode -eq 'loop-config') {
  $json = @{ mcpServers = @{ speaker = @{ command = $node; args = @($speaker); env = $envs } } } | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($config, $json, (New-Object Text.UTF8Encoding $false))
} else {
  Remove-Item -LiteralPath $config -Force -ErrorAction SilentlyContinue
}

# 6. Open Claude Code in its own work folder (new cell sessions open here too). claude and node go on the session PATH
# so plugin hooks run.
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Set-Location -LiteralPath $Work
$env:PATH = "$(Split-Path $claude -Parent);$(Split-Path $node -Parent);$env:PATH"
$opened = Join-Path $Dir 'opened.txt'
$common = @('-n', 'Loa tỉnh NhiLe', '--model', 'sonnet', '--settings', $settings)
$loop = @('/loop 10m /nlh:speaker-loop') + $common
if ($mode -like 'channel *') {
  # With the channel, the opening prompt runs the skill once, no loop: the channel pushes each item (17e647c1 part 4, saves
  # tokens). The prompt goes before the flags: the channel flag takes several values, a prompt after it reads as a name.
  $arguments = @('/nlh:speaker-loop') + $common + @('--channels', ($mode -replace '^channel ', ''))
} elseif ($mode -eq 'loop-config') {
  $arguments = $loop + @('--mcp-config', $config)
  $loop = $arguments
} else {
  $arguments = $loop
}
if ($DryRun) {
  Write-Host "DRYRUN $claude $($arguments -join ' | ')"
  Write-Host "DRYRUN-FALLBACK $claude $($loop -join ' | ')"
  exit 0
}
if (-not $Auto) {
  Write-Host ''
  Write-Host 'Loa đang nghe Nếp.'
  if (-not (Test-Path -LiteralPath $opened)) {
    Write-Host 'Lần đầu Claude hỏi vài câu: bấm Enter để chọn sẵn. Tới bước đăng nhập, trình duyệt mở ra: bấm nút xanh để cho phép, rồi quay lại đây.'
  }
  Write-Host 'Khi xong, cửa sổ này tự đóng và Loa chạy ngầm, không cần làm gì thêm.'
  Write-Host ''
  # Watch from outside: once Loa can run unseen, this window is closed and a hidden Loa opens.
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dir\start.ps1`" -Handoff $PID" -WindowStyle Hidden
}
Set-Content -LiteralPath $opened -Value (Get-Date -Format o) -Encoding ascii
# Keep the machine awake while Loa is open (ES_CONTINUOUS | ES_SYSTEM_REQUIRED on this process, which waits for Claude);
# it ends by itself when the process ends. The screen may still turn off.
try {
  Add-Type -Namespace Loa -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
  [Loa.Power]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null
} catch { }
Remove-Item -LiteralPath (Join-Path $Dir 'last-error.json') -Force -ErrorAction SilentlyContinue
$started = Get-Date
& $claude @arguments
# Claude quit within a minute (channel refused): run again the 10-minute way.
if ($LASTEXITCODE -and ((Get-Date) - $started).TotalSeconds -lt 60 -and $mode -like 'channel *') {
  Write-Host ''
  Write-Host 'Kênh báo nhanh chưa mở được. Loa vẫn chạy, mỗi 10 phút xem việc một lần.'
  & $claude @loop
}
if ($LASTEXITCODE) { Stop-Loa 'Loa dừng vì lỗi ở trên. Bấm đúp Loa để mở lại.' }
