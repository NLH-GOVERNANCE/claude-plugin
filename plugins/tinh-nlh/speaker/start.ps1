# Loa tỉnh NhiLe on Windows. The "Loa tỉnh NhiLe" desktop shortcut and the login task (made by the "bật Loa" command,
# setup.ps1) open loa.vbs, which opens this file from the copy in ~\.tinh-nlh\speaker with no window, so a plugin installed
# from claude.ai or from GitHub both work, no repo.
# Each launch: take the newest Loa from the installed plugin; install Claude Code or Node if missing (official builds,
# hash checked); if no key is saved, ask for it with the "Cho phép" button (pair.mjs, DPAPI); make sure this Windows account is
# signed in to Claude (one browser tap when not) and mark the first questions of Claude Code as answered (prepare.mjs); then
# open Claude Code on Sonnet as Loa, in a window nobody sees.
# Nothing here needs admin rights (28/10, 26f86f3d: the permission list of the plugin's channel is a machine-wide policy file,
# which asked a Windows admin box that a person without an admin PIN cannot pass). So the channel is the development channel,
# whose one English question ("Loading development channels") a hidden helper answers (-Answer): it reads the screen of
# the hidden console, and sends Enter only when it sees exactly that question.
# The login task is made here, when the person double-clicks Loa (Register-Login), not by the Claude session that installed
# Loa: a session in Auto mode can be refused the right to schedule a task, which left the user with a dead end.
# loa.vbs always starts this file hidden with -Auto. One Loa per machine (a mutex). A machine whose permission list already
# allows the plugin's channel (policy.mjs mode) opens it by the plugin's name, with no question at all.
# File saved as UTF-8 with BOM so PowerShell 5.1 reads Vietnamese text.
param(
  [string]$Dir = (Join-Path $env:USERPROFILE '.tinh-nlh\speaker'),
  [string]$Work = (Join-Path $env:USERPROFILE 'TinhNhiLe'),
  # Tests only: print the Claude command line instead of running it.
  [switch]$DryRun,
  # Set when an older copy of this launcher ran the new one after an update, so it runs at most once.
  [switch]$Relaunched,
  # Started by loa.vbs, no window: nobody to press Enter, so a problem is left for the next Claude session to say.
  [switch]$Auto,
  # Started at login: another Loa already running is not worth a word.
  [switch]$Quiet,
  # The hidden helper: answers the one English question of Claude Code in the hidden console of this process id.
  [int]$Answer = 0,
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
  # Hidden, and a person double-clicked (not the login task): a message box says it, nothing else would be seen.
  if ($Auto -and -not $Quiet -and -not $DryRun) {
    try { Add-Type -AssemblyName PresentationFramework; [void][Windows.MessageBox]::Show($text, 'Loa tỉnh NhiLe') } catch { }
  }
  exit 1
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# Anything technical goes to loa.log, never to the screen: the person sees only short Vietnamese sentences.
function Add-Log([string]$text) {
  try { Add-Content -LiteralPath (Join-Path $Dir 'loa.log') -Value "$(Get-Date -Format o) $text" -Encoding UTF8 } catch { }
}

# The hidden helper (started by the launcher below). Claude Code asks "Loading development channels" at every start and waits for
# Enter; the window is hidden, so this reads the screen of the launcher's console (AttachConsole + ReadConsoleOutputCharacter)
# and, only when that exact question is there, writes an Enter into its input (WriteConsoleInput). Tried on 7 of 7 pushed
# messages (28/10). Ends when the launcher ends, or after 3 minutes. Nothing is printed: this process gives up its own console.
if ($Answer -gt 0) {
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class LoaConsole {
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll")] static extern bool AttachConsole(int pid);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [StructLayout(LayoutKind.Sequential)] struct COORD { public short X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct SMALL_RECT { public short L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct CSBI { public COORD size, cur; public ushort attr; public SMALL_RECT win; public COORD max; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetConsoleScreenBufferInfo(IntPtr h, out CSBI info);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ReadConsoleOutputCharacter(IntPtr h, StringBuilder text, uint length, COORD at, out uint read);
  [StructLayout(LayoutKind.Explicit)] struct INPUT_RECORD { [FieldOffset(0)] public ushort EventType; [FieldOffset(4)] public KEY_EVENT_RECORD Key; }
  [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)] struct KEY_EVENT_RECORD { [FieldOffset(0)] public int Down; [FieldOffset(4)] public ushort Repeat; [FieldOffset(6)] public ushort VirtualKey; [FieldOffset(8)] public ushort ScanCode; [FieldOffset(10)] public char Char; [FieldOffset(12)] public uint State; }
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool WriteConsoleInput(IntPtr h, INPUT_RECORD[] records, int length, out int written);

  public static string Screen(int pid) {
    FreeConsole();
    if (!AttachConsole(pid)) return "";
    try {
      IntPtr h = CreateFile("CONOUT$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
      CSBI info; GetConsoleScreenBufferInfo(h, out info);
      var all = new StringBuilder();
      for (short y = info.win.T; y <= info.win.B; y++) {
        var line = new StringBuilder(info.size.X + 1); uint read;
        ReadConsoleOutputCharacter(h, line, (uint)info.size.X, new COORD { X = 0, Y = y }, out read);
        all.AppendLine(line.ToString().TrimEnd());
      }
      return all.ToString();
    } finally { FreeConsole(); }
  }

  public static bool Enter(int pid) {
    FreeConsole();
    if (!AttachConsole(pid)) return false;
    try {
      IntPtr h = CreateFile("CONIN$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
      var records = new INPUT_RECORD[2];
      for (int i = 0; i < 2; i++) {
        records[i].EventType = 1;
        records[i].Key.Down = i == 0 ? 1 : 0;
        records[i].Key.Repeat = 1;
        records[i].Key.VirtualKey = 13;
        records[i].Key.ScanCode = 28;
        records[i].Key.Char = '\r';
      }
      int written;
      return WriteConsoleInput(h, records, 2, out written);
    } finally { FreeConsole(); }
  }
}
'@
  $question = 'Loading development channels'
  $choice = '1\. I am using this for local development'
  $sent = 0
  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    if (-not (Get-Process -Id $Answer -ErrorAction SilentlyContinue)) { exit 0 }
    $screen = [LoaConsole]::Screen($Answer)
    if ($screen -match $question -and $screen -match $choice) {
      if ($sent -ge 3) { Add-Log 'channel question: still there after 3 answers'; exit 0 }
      [void][LoaConsole]::Enter($Answer)
      $sent++
      Add-Log "channel question answered ($sent)"
      Start-Sleep -Seconds 4
    } elseif ($sent -gt 0) {
      exit 0
    }
  }
  if ($sent -eq 0) { Add-Log 'channel question not seen in 3 minutes' }
  exit 0
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
if (-not $Quiet -and -not $DryRun) { Register-Login }

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
  foreach ($name in @('speaker.mjs', 'pair.mjs', 'policy.mjs', 'prepare.mjs', 'loa.vbs')) {
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
# The key was taken back (the hub refused it) while Loa runs hidden: the icon ends the hidden one first (loa.pid is the
# launcher's process id) and asks again.
$pidFile = Join-Path $Dir 'loa.pid'
if (-not $owned -and -not $DryRun -and -not (Test-Path -LiteralPath (Join-Path $Dir 'tower-key.dpapi')) -and (Test-Path -LiteralPath $pidFile)) {
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
    Stop-Loa 'Nếp chưa sẵn sàng bước này nên Loa chưa báo việc mới được. Lần tới bạn mở Claude, máy sẽ tự báo người lo kỹ thuật.' $detail -shown
  }
  if ($paired -ne 0 -or -not (Test-Path -LiteralPath $keyFile)) { Stop-Loa 'Loa chưa được phép chạy trên máy này. Bấm đúp Loa lại.' }
}

# 4b. Signed in to Claude, and the first questions of Claude Code answered beforehand. Claude Code asks them in English (type of
# letters, how to sign in) and a hidden Loa has nobody to answer: so sign in here, with one browser tap, and mark the
# questions as answered in Claude's own settings file (prepare.mjs). A message box, not a black window, says what happens.
function Test-SignedIn {
  try { return ((& $claude auth status | Out-String) -match '"loggedIn":\s*true') } catch { return $false }
}
if (-not $DryRun) {
  if (-not (Test-SignedIn)) {
    try {
      Add-Type -AssemblyName PresentationFramework
      [void][Windows.MessageBox]::Show("Loa cần bạn đăng nhập Claude một lần.`n`nBấm OK, trình duyệt sẽ mở: bấm nút xanh là xong.", 'Loa tỉnh NhiLe')
    } catch { }
    $login = Start-Process -FilePath $claude -ArgumentList 'auth', 'login' -WindowStyle Hidden -PassThru
    for ($i = 0; $i -lt 100 -and -not (Test-SignedIn); $i++) { Start-Sleep -Seconds 3 }
    if (-not $login.HasExited) { Stop-Process -Id $login.Id -Force -ErrorAction SilentlyContinue }
    if (-not (Test-SignedIn)) { Stop-Loa 'Loa chưa đăng nhập được Claude. Bấm đúp Loa để thử lại.' }
  }
  $prepare = Join-Path $Dir 'prepare.mjs'
  if (Test-Path -LiteralPath $prepare) { & $node $prepare --file (Join-Path $env:USERPROFILE '.claude.json') --work $Work | Out-Null }
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
# How to open Claude: "channel plugin:nlh@<market>" when this machine's list already allows the plugin's channel (no question at
# all), otherwise the development channel through --mcp-config (its one question answered by the hidden helper).
$policy = Join-Path $Dir 'policy.mjs'
$mode = 'dev-channel'
if (Test-Path -LiteralPath $policy) {
  $fromPolicy = [string](& $node $policy mode | Select-Object -First 1)
  if ($fromPolicy -like 'channel *') { $mode = $fromPolicy }
}
$config = Join-Path $Dir 'speaker-mcp.json'
if ($mode -eq 'dev-channel') {
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
$common = @('-n', 'Loa tỉnh NhiLe', '--model', 'sonnet', '--settings', $settings)
$loop = @('/loop 10m /nlh:speaker-loop') + $common
if ($mode -like 'channel *') {
  # With the channel, the opening prompt runs the skill once, no loop: the channel pushes each item (17e647c1 part 4, saves
  # tokens). The prompt goes before the flags: the channel flag takes several values, a prompt after it reads as a name.
  $arguments = @('/nlh:speaker-loop') + $common + @('--channels', ($mode -replace '^channel ', ''))
} else {
  $arguments = @('/nlh:speaker-loop') + $common + @('--mcp-config', $config, '--dangerously-load-development-channels', 'server:speaker')
  $loop = $loop + @('--mcp-config', $config)
}
if ($DryRun) {
  Write-Host "DRYRUN $claude $($arguments -join ' | ')"
  Write-Host "DRYRUN-FALLBACK $claude $($loop -join ' | ')"
  exit 0
}
# The development channel asks one question at every start: the hidden helper answers it from outside (this process id).
if ($mode -notlike 'channel *') {
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dir\start.ps1`" -Dir `"$Dir`" -Answer $PID" -WindowStyle Hidden
}
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
