// Phép thử lối mở Loa trong plugin (plugins/tinh-nlh/speaker): lệnh "bật Loa" chép Loa sang ~/.tinh-nlh/speaker và tạo
// biểu tượng trên Desktop; bấm đúp thì lối mở lấy bản mới nhất từ plugin đã cài, tự cài Claude Code và Node khi thiếu,
// hỏi khoá trong ô nhập ẩn chữ, rồi mở Claude Code với kênh tower qua --mcp-config. Không cần repo, không cần GitHub.
// start.sh chạy thật bằng bash ở chế độ thử (SPEAKER_DRY_RUN), với security giả; start.ps1 và setup.ps1 chạy thật trên
// Windows với thư mục người dùng giả. Không mở Claude, không gọi mạng.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { KEYCHAIN, KEY_FILE } from '../plugins/tinh-nlh/speaker/speaker.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const plugin = join(root, 'plugins/tinh-nlh');
const read = (path) => readFileSync(join(plugin, path), 'utf8');
const KEY = `nlh_tower_${'cd'.repeat(32)}`;
const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
const temps = [];
const temp = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

// Một thư mục người dùng giả có plugin nlh đã cài từ GitHub (cache/<chợ>/nlh/<bản>). name: tên người dùng,
// có thể có dấu như trên máy thật.
function fakeHome(name = 'user') {
  const home = join(temp('thap-home'), name);
  const installed = join(home, '.claude/plugins/cache/nlh-governance/nlh', version);
  for (const path of ['.claude-plugin/plugin.json', 'speaker/speaker.mjs', 'speaker/start.ps1', 'speaker/start.sh']) {
    mkdirSync(dirname(join(installed, path)), { recursive: true });
    cpSync(join(plugin, path), join(installed, path));
  }
  return home;
}

// Hai lối mở cùng mở Claude một cách: câu mở đầu trước, Sonnet, kênh tower qua --mcp-config, cờ dev chỉ cho server:tower.
// Có kênh thì câu mở đầu chạy skill một lần, không đặt vòng 10 phút (việc 17e647c1 phần 4); chỉ lối dự phòng có vòng.
// Phiên Loa tắt mọi hook của gói qua --settings (việc 17e647c1: hook gọi connector Nếp mà phiên Loa không có, mỗi lượt ~10 dòng lỗi).
const CLAUDE_ARGS = ['/nlh:speaker-loop', '-n', 'Loa tỉnh NhiLe', '--model', 'sonnet', '--settings', '<settings>', '--mcp-config', '<config>', '--dangerously-load-development-channels', 'server:speaker'];

// Lối dự phòng (kênh không mở được): vòng 10 phút qua công cụ pending, không cờ kênh.
const FALLBACK_ARGS = ['/loop 10m /nlh:speaker-loop', ...CLAUDE_ARGS.slice(1, -2)];

// Điền đường dẫn thật cho hai chỗ giữ chỗ: cấu hình kênh và cấu hình tắt hook, cùng ở thư mục Loa.
const placed = (dir, sep = '/') => (arg) => (arg === '<config>' ? `${dir}${sep}speaker-mcp.json` : arg === '<settings>' ? `${dir}${sep}speaker-settings.json` : arg);

describe('lệnh "bật Loa" và các file của lối mở', () => {
  test('lệnh /nlh:speaker chạy đúng file setup có trong plugin, theo hệ điều hành; không hỏi khoá trong chat', () => {
    const command = read('commands/speaker.md');
    assert.match(command, /"bật Loa"/);
    assert.match(command, /biểu tượng \*\*Loa tỉnh NhiLe\*\*/);
    const paths = [...command.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)].map((match) => match[1]);
    assert.deepEqual(paths, ['speaker/setup.ps1', 'speaker/setup.sh']);
    for (const path of paths) assert.ok(existsSync(join(plugin, path)), path);
    assert.match(command, /Never ask for the key, never accept it in chat/);
  });

  test('start.ps1 (Windows): UTF-8 có BOM; NLH_TOWER chỉ trong cấu hình kênh; khoá ô ẩn chữ, DPAPI; Claude Code và Node bản chính thức, kiểm mã băm', () => {
    const raw = readFileSync(join(plugin, 'speaker/start.ps1'));
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 có BOM cho PowerShell 5.1');
    const ps = raw.toString('utf8');
    assert.ok(ps.includes(`$arguments = @(${CLAUDE_ARGS.map((arg) => (arg === '<config>' ? '$config' : arg === '<settings>' ? '$settings' : `'${arg}'`)).join(', ')})`));
    // Kênh cần đường dẫn claude và thư mục làm việc để tra, mở lại và mở phiên (phiếu 98bd8b93).
    assert.match(ps, /\$envs = @\{ NLH_TOWER = '1'; NLH_TOWER_DIR = \$Dir; NLH_TOWER_WORK = \$Work; CLAUDE_BIN = \$claude \}/);
    assert.doesNotMatch(ps, /Tháp/);
    assert.doesNotMatch(ps, /\$env:NLH_TOWER\s*=|skip-permissions|bypassPermissions|AsPlainText|ConvertFrom-SecureString -Key|Write-Host \$secure/);
    assert.match(ps, /Read-Host -AsSecureString/);
    assert.match(ps, /\$secure \| ConvertFrom-SecureString \| Set-Content -LiteralPath \$keyFile/);
    assert.match(ps, /ZeroFreeBSTR/);
    assert.ok(ps.includes("'^nlh_tower_[0-9a-f]{64}$'"));
    assert.ok(ps.includes(`'${KEY_FILE}'`));
    assert.match(ps, /'https:\/\/claude\.ai\/install\.ps1'/);
    assert.match(ps, /\$base = 'https:\/\/nodejs\.org\/dist\/latest-v22\.x'/);
    assert.match(ps, /Get-FileHash -LiteralPath \$part -Algorithm SHA256/);
    assert.doesNotMatch(ps, /Startup|CurrentVersion\\Run|schtasks|Register-ScheduledTask/i, 'tự mở đặt ở setup, không ở lối mở');
    // Giữ máy thức khi Loa mở; kênh hỏng thì mở lại không cờ, chỉ nhịp 10 phút, in một dòng (phiếu 98bd8b93).
    assert.match(ps, /SetThreadExecutionState\(\[uint32\]'0x80000001'\)/);
    assert.ok(ps.includes("$fallback = @('/loop 10m /nlh:speaker-loop') + $arguments[1..($arguments.Count - 3)]"));
    // Tắt hook cho riêng phiên Loa qua tệp; bản lối mở cũ chạy bản mới ngay một lần (việc 17e647c1).
    assert.ok(ps.includes(`[IO.File]::WriteAllText($settings, '{ "disableAllHooks": true }'`));
    assert.match(ps, /& \(Join-Path \$Dir 'start\.ps1'\) -Dir \$Dir -Work \$Work -DryRun:\$DryRun -Relaunched/);
    assert.match(ps, /if \(\$stale -and -not \$Relaunched\)/);
    assert.match(ps, /Kênh báo nhanh chưa mở được\. Loa vẫn chạy, mỗi 10 phút xem việc một lần\./);
  });

  test('start.sh (macOS): khoá ô ẩn chữ vào Keychain qua stdin của security, đúng mục kênh đọc; cùng cách mở Claude như Windows', () => {
    const sh = read('speaker/start.sh');
    assert.match(sh, /^#!\/bin\/bash\n/);
    assert.ok(sh.includes(`SERVICE=${KEYCHAIN.service}\n`) && sh.includes(`ACCOUNT=${KEYCHAIN.account}\n`));
    assert.match(sh, /IFS= read -r -s -p/);
    // Khoá chỉ đi qua printf (lệnh có sẵn của bash) vào stdin của security -i, không nằm trong dòng lệnh.
    const adds = sh.split('\n').filter((line) => line.includes('add-generic-password'));
    assert.equal(adds.length, 1);
    assert.match(adds[0], /^\s*printf 'add-generic-password -U -s %s -a %s -w %s\\n' "\$SERVICE" "\$ACCOUNT" "\$key" \| "\$SECURITY" -i/);
    assert.ok(sh.includes(`set -- ${CLAUDE_ARGS.map((arg) => (arg === '<config>' ? '"$CONFIG"' : arg === '<settings>' ? '"$SETTINGS"' : arg.includes(' ') ? `'${arg}'` : arg)).join(' ')}`));
    assert.match(sh, /const env = \{ NLH_TOWER: "1", NLH_TOWER_DIR: dir, NLH_TOWER_WORK: work, CLAUDE_BIN: claude \}/);
    assert.doesNotMatch(sh, /Tháp(?! tỉnh NhiLe\.command)/);
    assert.doesNotMatch(sh, /export NLH_TOWER|skip-permissions|bypassPermissions/);
    assert.match(sh, /curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/);
    assert.match(sh, /shasum -a 256 "\$part"/);
    assert.doesNotMatch(sh, /LaunchAgents|launchctl|crontab/, 'tự mở đặt ở setup, không ở lối mở');
    assert.match(sh, /\/usr\/bin\/caffeinate -i -w \$\$ &/);
    assert.ok(sh.includes(`LOOP='${FALLBACK_ARGS[0]}'`));
    assert.match(sh, /"\$CLAUDE" "\$LOOP" "\$\{@:2:\$#-3\}"/);
    assert.match(sh, /Kênh báo nhanh chưa mở được\. Loa vẫn chạy, mỗi 10 phút xem việc một lần\./);
  });

  test('setup.ps1 và setup.sh: biểu tượng "Loa tỉnh NhiLe" trên Desktop; đã có lối tắt cùng tên trỏ chỗ khác thì giữ nguyên', () => {
    const ps = readFileSync(join(plugin, 'speaker/setup.ps1'));
    assert.deepEqual([...ps.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.match(ps.toString('utf8'), /\$name = 'Loa tỉnh NhiLe'/);
    assert.match(ps.toString('utf8'), /giữ nguyên lối tắt đó/);
    const sh = read('speaker/setup.sh');
    assert.match(sh, /name='Loa tỉnh NhiLe'/);
    // Tự mở khi đăng nhập máy: tác vụ của chính người dùng, không cần quyền quản trị (phiếu 98bd8b93, dòng 4b62d007).
    const setupPs = ps.toString('utf8');
    assert.match(setupPs, /New-ScheduledTaskTrigger -AtLogOn -User \$user/);
    assert.match(setupPs, /-LogonType Interactive -RunLevel Limited/);
    assert.match(setupPs, /Register-ScheduledTask -TaskName \$name /);
    assert.match(setupPs, /if \(-not \$NoAutostart\)/);
    assert.match(sh, /vn\.nlh\.tinh-nlh\.speaker\.plist/);
    assert.match(sh, /link="\$DESKTOP\/\$name\.command"/);
    assert.match(sh, /giữ nguyên lối tắt đó/);
  });
});

// bash để chạy start.sh: Linux và macOS có sẵn; Windows chỉ dùng Git Bash (bash.exe của WSL chạy ở máy khác).
const gitBash = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
const bash = process.platform === 'win32' ? (existsSync(gitBash) ? gitBash : null) : '/bin/bash';
// Đường dẫn cho bash: Git Bash đọc C:\x thành /c/x.
const posix = (path) => (process.platform === 'win32' ? path.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll('\\', '/') : path);
// Git Bash đổi /c/x thành C:/x khi đưa đối số cho node.exe: so hai dạng như nhau.
const same = (path) => path.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:/`);

describe('start.sh chạy thật (chế độ thử, security giả)', { skip: bash ? false : 'không có bash' }, () => {
  test('lần đầu: chép Loa từ plugin, hỏi khoá rồi lưu vào Keychain qua stdin, viết cấu hình kênh; lần sau không hỏi lại', () => {
    const home = fakeHome();
    const bin = temp('thap-bin');
    // claude giả ở chỗ trình cài chính thức đặt; security giả giữ Keychain trong một file và ghi lại dòng lệnh đã gọi.
    mkdirSync(join(home, '.local/bin'), { recursive: true });
    writeFileSync(join(home, '.local/bin/claude'), '#!/bin/bash\nexit 0\n');
    chmodSync(join(home, '.local/bin/claude'), 0o755);
    const security = join(bin, 'security');
    writeFileSync(
      security,
      [
        '#!/bin/bash',
        'store="$(dirname "$0")/keychain.txt"',
        'echo "$*" >> "$(dirname "$0")/argv.txt"',
        'case "$1" in',
        '  find-generic-password) [ -s "$store" ] ;;',
        '  -i) cat > "$store" ;;',
        'esac',
        '',
      ].join('\n'),
    );
    chmodSync(security, 0o755);
    const run = (input) =>
      spawnSync(bash, [posix(join(plugin, 'speaker/start.sh'))], {
        input,
        encoding: 'utf8',
        env: { ...process.env, HOME: posix(home), SPEAKER_SECURITY: posix(security), SPEAKER_DRY_RUN: '1', TOWER_ORIGIN: '' },
      });

    const first = run(`không phải khoá\n${KEY}\n`);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Chuỗi vừa dán không phải khoá Loa/);
    assert.match(first.stdout, /Đã lưu khoá Loa trên máy này\./);
    assert.match(first.stdout, /Loa đang nghe Nếp\. Đừng đóng cửa sổ này\./);
    assert.match(first.stdout, /Lần đầu Claude Code hỏi vài câu: bấm Enter để chọn sẵn./);
    const dir = join(home, '.tinh-nlh/speaker');
    const dry = first.stdout.split('\n').find((line) => line.startsWith('DRYRUN '));
    const fallbackLine = first.stdout.split('\n').find((line) => line.startsWith('DRYRUN-FALLBACK '));
    assert.deepEqual(fallbackLine.split(' | ').slice(1), FALLBACK_ARGS.map(placed(posix(join(home, '.tinh-nlh/speaker')))));
    assert.deepEqual(dry.split(' | ').slice(1), CLAUDE_ARGS.map(placed(posix(dir))));
    assert.equal(readFileSync(join(dir, 'speaker.mjs'), 'utf8'), read('speaker/speaker.mjs'));
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), version);
    assert.equal(
      readFileSync(join(bin, 'keychain.txt'), 'utf8'),
      `add-generic-password -U -s ${KEYCHAIN.service} -a ${KEYCHAIN.account} -w ${KEY}\n`,
    );
    assert.ok(!readFileSync(join(bin, 'argv.txt'), 'utf8').includes(KEY), 'khoá không nằm trong dòng lệnh');
    const config = JSON.parse(readFileSync(join(dir, 'speaker-mcp.json'), 'utf8'));
    assert.deepEqual(Object.keys(config.mcpServers), ['speaker']);
    assert.deepEqual(config.mcpServers.speaker.args.map(same), [same(`${posix(dir)}/speaker.mjs`)]);
    const { env: towerEnv } = config.mcpServers.speaker;
    assert.deepEqual(
      { ...towerEnv, NLH_TOWER_DIR: same(towerEnv.NLH_TOWER_DIR), NLH_TOWER_WORK: same(towerEnv.NLH_TOWER_WORK), CLAUDE_BIN: same(towerEnv.CLAUDE_BIN) },
      { NLH_TOWER: '1', NLH_TOWER_DIR: same(posix(dir)), NLH_TOWER_WORK: same(`${posix(home)}/TinhNhiLe`), CLAUDE_BIN: same(`${posix(home)}/.local/bin/claude`) },
    );
    assert.ok(!JSON.stringify(config).includes(KEY), 'khoá không vào cấu hình');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'speaker-settings.json'), 'utf8')), { disableAllHooks: true }, 'phiên Loa tắt mọi hook');

    // Bản lối mở cũ trong thư mục Loa (chép từ lần trước, trước khi gói cập nhật): chép bản mới rồi chạy ngay bản mới một lần.
    const stale = `${read('speaker/start.sh')}\n# bản cũ\n`;
    writeFileSync(join(dir, 'start.sh'), stale.replace(/--settings "\$SETTINGS" /, ''));
    const relaunched = spawnSync(bash, [posix(join(dir, 'start.sh'))], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env, HOME: posix(home), SPEAKER_SECURITY: posix(security), SPEAKER_DRY_RUN: '1', TOWER_ORIGIN: '' },
    });
    assert.equal(relaunched.status, 0, relaunched.stdout + relaunched.stderr);
    assert.equal(readFileSync(join(dir, 'start.sh'), 'utf8'), read('speaker/start.sh'), 'đã chép bản mới');
    const relaunchedDry = relaunched.stdout.split('\n').filter((line) => line.startsWith('DRYRUN '));
    assert.equal(relaunchedDry.length, 1, 'chạy bản mới đúng một lần');
    assert.deepEqual(relaunchedDry[0].split(' | ').slice(1), CLAUDE_ARGS.map(placed(posix(dir))), 'dòng lệnh của bản mới');

    const again = run('');
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.doesNotMatch(again.stdout, /Khoá cho Loa|Đã lưu khoá/);
  });

  test('setup.sh: tạo "Loa tỉnh NhiLe.command" trỏ tới start.sh; bỏ "Tháp tỉnh NhiLe.command" cũ của mình; lối tắt cùng tên của người khác thì giữ nguyên', () => {
    const home = temp('thap-setup');
    const desktop = join(home, 'Desktop');
    mkdirSync(desktop);
    const setup = (dir) =>
      spawnSync(bash, [posix(join(plugin, 'speaker/setup.sh'))], { encoding: 'utf8', env: { ...process.env, HOME: posix(home), SPEAKER_DIR: posix(dir), SPEAKER_DESKTOP: posix(desktop), SPEAKER_AGENTS: posix(join(home, 'Agents')) } });
    const dir = join(home, '.tinh-nlh/speaker');
    // Biểu tượng cũ trước khi đổi tên Loa, trỏ tới lối mở của chính mình: setup tự bỏ, người dùng không phải xoá tay.
    const old = join(desktop, 'Tháp tỉnh NhiLe.command');
    writeFileSync(old, `#!/bin/bash\nexec /bin/bash "${posix(home)}/.tinh-nlh/thap/thap.sh"\n`);
    const done = setup(dir);
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /Đã bỏ biểu tượng cũ Tháp tỉnh NhiLe\./);
    assert.ok(!existsSync(old));
    assert.match(done.stdout, /Đã có biểu tượng Loa tỉnh NhiLe trên màn hình chính\./);
    assert.match(done.stdout, /Loa sẽ tự mở mỗi khi bạn đăng nhập máy\./);
    const agent = readFileSync(join(home, 'Agents', 'vn.nlh.tinh-nlh.speaker.plist'), 'utf8');
    assert.match(agent, /<key>RunAtLoad<\/key><true\/>/);
    assert.ok(agent.includes(`<string>/usr/bin/open</string><string>-a</string><string>Terminal</string><string>${posix(dir)}/start.sh</string>`));
    const link = join(desktop, 'Loa tỉnh NhiLe.command');
    assert.match(readFileSync(link, 'utf8'), new RegExp(`exec /bin/bash "${posix(dir)}/start\\.sh"`));
    assert.equal(readFileSync(join(dir, 'start.sh'), 'utf8'), read('speaker/start.sh'));
    assert.ok(existsSync(join(dir, 'speaker.mjs')));
    // Lối tắt cùng tên của người khác (không trỏ vào ~/.tinh-nlh) thì giữ nguyên.
    writeFileSync(link, '#!/bin/bash\nexec /usr/local/bin/khac\n');
    const other = setup(dir);
    assert.match(other.stdout, /giữ nguyên lối tắt đó/);
    assert.match(readFileSync(link, 'utf8'), /khac/, 'không ghi đè');
  });
});

const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const ps = (file, args, env = {}) =>
  spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], {
    encoding: 'utf8',
    // PowerShell ghi bộ nhớ đệm mô-đun vào thư mục hiện tại khi thư mục người dùng là giả: chạy ở thư mục tạm.
    cwd: tmpdir(),
    env: { ...process.env, ...env },
  });

describe('setup.ps1 và start.ps1 chạy thật trên Windows (thư mục người dùng giả)', { skip: process.platform === 'win32' ? false : 'chỉ Windows' }, () => {
  test('setup.ps1: chép Loa, tạo lối tắt trỏ tới start.ps1 (tên người dùng có dấu vẫn đúng); bỏ lối tắt "Tháp tỉnh NhiLe" cũ của mình; lối tắt cùng tên trỏ chỗ khác thì giữ nguyên', () => {
    const home = join(temp('thap-setup'), 'Thùy ỉ');
    mkdirSync(home);
    const desktop = join(home, 'Desktop');
    mkdirSync(desktop);
    const dir = join(home, '.tinh-nlh', 'speaker');
    const done = ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop, '-NoAutostart']);
    assert.equal(done.status, 0, done.stdout + done.stderr);
    assert.match(done.stdout, /Đã có biểu tượng Loa tỉnh NhiLe trên màn hình chính\./);
    const link = join(desktop, 'Loa tỉnh NhiLe.lnk');
    const target = () =>
      spawnSync(powershell, ['-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $l = (New-Object -ComObject Shell.Application).NameSpace($env:DESK).ParseName($env:NAME).GetLink; "$($l.Path)|$($l.Arguments)"'], {
        encoding: 'utf8',
    // PowerShell ghi bộ nhớ đệm mô-đun vào thư mục hiện tại khi thư mục người dùng là giả: chạy ở thư mục tạm.
    cwd: tmpdir(),
        env: { ...process.env, DESK: desktop, NAME: 'Loa tỉnh NhiLe.lnk' },
      }).stdout.trim();
    // Windows tự viết lại hoa thường của đường dẫn tới powershell.exe: so không phân biệt hoa thường.
    assert.equal(target().toLowerCase(), `${powershell}|-NoProfile -ExecutionPolicy Bypass -File "${join(dir, 'start.ps1')}"`.toLowerCase());
    assert.ok(target().includes('Thùy ỉ'), 'giữ đúng chữ có dấu');
    assert.ok(readFileSync(join(dir, 'start.ps1')).equals(readFileSync(join(plugin, 'speaker/start.ps1'))));
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), version);
    // Lối tắt cùng tên trỏ tới bản Loa cũ của mình (~\.tinh-nlh) thì thay; không đọc được (của người khác) thì giữ.
    const older = ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', join(home, '.tinh-nlh', 'cu'), '-Desktop', desktop, '-NoAutostart']);
    assert.match(older.stdout, /Đã có biểu tượng Loa tỉnh NhiLe/);
    assert.match(target(), /\\\.tinh-nlh\\cu\\start\.ps1/, 'thay lối tắt Loa cũ của mình');
    ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop, '-NoAutostart']);
    assert.match(target(), /\\\.tinh-nlh\\speaker\\start\.ps1/);

    // Lối tắt cũ "Tháp tỉnh NhiLe" trỏ tới ~.tinh-nlh (bản trước khi đổi tên Loa): setup tự bỏ. Lối tắt cũ không đọc được
    // (không phải của mình) thì giữ.
    const old = join(desktop, 'Tháp tỉnh NhiLe.lnk');
    cpSync(link, old);
    const replaced = ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop, '-NoAutostart']);
    assert.match(replaced.stdout, /Đã bỏ biểu tượng cũ Tháp tỉnh NhiLe\./);
    assert.ok(!existsSync(old));
    writeFileSync(old, 'không phải lối tắt');
    ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop, '-NoAutostart']);
    assert.ok(existsSync(old), 'không bỏ lối tắt không phải của mình');
    writeFileSync(link, 'không phải lối tắt');
    assert.match(ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop, '-NoAutostart']).stdout, /giữ nguyên lối tắt đó/);
  });

  test('start.ps1: khoá ở chỗ cũ (~/.tinh-nlh/thap, Thap.cmd) thì chép sang, không hỏi; viết cấu hình kênh; câu lệnh mở Claude đúng', () => {
    const home = fakeHome('Thùy ỉ');
    mkdirSync(join(home, '.local', 'bin'), { recursive: true });
    writeFileSync(join(home, '.local', 'bin', 'claude.exe'), '');
    // Khoá DPAPI ở thư mục dữ liệu cũ của plugin, như máy đã bật Loa bằng Thap.cmd (đường cũ, đã bỏ).
    const legacy = join(home, '.claude', 'plugins', 'data', 'tinh-nlh-nlh-governance');
    mkdirSync(legacy, { recursive: true });
    const sealed = spawnSync(powershell, ['-NoProfile', '-Command', 'ConvertTo-SecureString $env:K -AsPlainText -Force | ConvertFrom-SecureString'], {
      encoding: 'utf8',
    // PowerShell ghi bộ nhớ đệm mô-đun vào thư mục hiện tại khi thư mục người dùng là giả: chạy ở thư mục tạm.
    cwd: tmpdir(),
      env: { ...process.env, K: KEY },
    }).stdout.trim();
    writeFileSync(join(legacy, KEY_FILE), sealed);
    const dir = join(home, '.tinh-nlh', 'speaker');
    const run = ps(join(plugin, 'speaker/start.ps1'), ['-DryRun'], { USERPROFILE: home, TOWER_ORIGIN: '' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.doesNotMatch(run.stdout, /Khoá cho Loa|Đã lưu khoá/);
    assert.equal(readFileSync(join(dir, KEY_FILE), 'utf8'), sealed);
    assert.equal(readFileSync(join(dir, 'speaker.mjs'), 'utf8'), read('speaker/speaker.mjs'));
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), version);
    const dry = run.stdout.split(/\r?\n/).find((line) => line.startsWith('DRYRUN '));
    assert.equal(dry, `DRYRUN ${join(home, '.local', 'bin', 'claude.exe')} ${CLAUDE_ARGS.map(placed(dir, sep)).join(' | ')}`);
    const fallback = run.stdout.split(/\r?\n/).find((line) => line.startsWith('DRYRUN-FALLBACK '));
    assert.equal(fallback, `DRYRUN-FALLBACK ${join(home, '.local', 'bin', 'claude.exe')} ${FALLBACK_ARGS.map(placed(dir, sep)).join(' | ')}`);
    const raw = readFileSync(join(dir, 'speaker-mcp.json'));
    assert.notEqual(raw[0], 0xef, 'JSON không có BOM');
    const { speaker: tower } = JSON.parse(raw.toString('utf8')).mcpServers;
    assert.deepEqual(tower.args, [join(dir, 'speaker.mjs')]);
    assert.deepEqual(tower.env, { NLH_TOWER: '1', NLH_TOWER_DIR: dir, NLH_TOWER_WORK: join(home, 'TinhNhiLe'), CLAUDE_BIN: join(home, '.local', 'bin', 'claude.exe') });
    assert.match(tower.command, /node(\.exe)?$/i);
    assert.ok(existsSync(join(home, 'TinhNhiLe')), 'thư mục làm việc của Loa');
  });
});
