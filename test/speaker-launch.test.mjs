// Phép thử lối mở Loa trong plugin (plugins/tinh-nlh/speaker): lệnh "bật Loa" chép Loa sang ~/.tinh-nlh/speaker và tạo
// biểu tượng trên Desktop; bấm đúp thì lối mở lấy bản mới nhất từ plugin đã cài, tự cài Claude Code và Node khi thiếu,
// xin khoá bằng nút "Cho phép" (pair.mjs), rồi mở Claude Code với kênh tower qua --mcp-config. Không cần repo, không cần GitHub.
// start.sh chạy thật bằng bash ở chế độ thử (SPEAKER_DRY_RUN), với security giả; start.ps1 và setup.ps1 chạy thật trên
// Windows với thư mục người dùng giả. Không mở Claude, không gọi mạng.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { managedPath } from '../plugins/tinh-nlh/speaker/policy.mjs';
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
// layout 'synced': gói chỉ có bản đồng bộ từ claude.ai (synced/<tổ chức>/<gói>), không cài từ chợ nào.
function fakeHome(name = 'user', layout = 'cache') {
  const home = join(temp('thap-home'), name);
  const installed = layout === 'synced' ? join(home, '.claude/plugins/synced/org-id/plugin-id') : join(home, '.claude/plugins/cache/nlh-governance/nlh', version);
  for (const path of ['.claude-plugin/plugin.json', 'speaker/speaker.mjs', 'speaker/pair.mjs', 'speaker/policy.mjs', 'speaker/prepare.mjs', 'speaker/loa.vbs', 'speaker/toast.ps1', 'speaker/start.ps1', 'speaker/start.sh']) {
    mkdirSync(dirname(join(installed, path)), { recursive: true });
    cpSync(join(plugin, path), join(installed, path));
  }
  return home;
}

// Ba cách mở Claude (việc 26f86f3d), cùng câu mở đầu trước, Sonnet, tắt mọi hook của gói qua --settings (việc 17e647c1: hook
// gọi connector Nếp mà phiên Loa không có, mỗi lượt ~10 dòng lỗi). Không còn cờ dangerously và hộp tiếng Anh.
const COMMON = ['-n', 'Loa tỉnh NhiLe', '--model', 'sonnet', '--settings', '<settings>'];
// Máy cho phép kênh của gói (policy.mjs): kênh theo tên gói, câu mở đầu chạy skill một lần, không đặt vòng 10 phút (17e647c1 phần 4).
const CHANNEL_ARGS = ['/nlh:speaker-loop', ...COMMON, '--channels', 'plugin:nlh@nlh-governance'];
// Vòng 10 phút qua công cụ pending của máy chủ trong gói: lối dự phòng khi kênh theo tên gói không mở được.
const LOOP_ARGS = ['/loop 10m /nlh:speaker-loop', ...COMMON];
// Máy chưa cho phép kênh của gói (không ai cần quyền quản trị, 28/10): kênh phát triển, máy chủ Loa nạp bằng --mcp-config; hộp hỏi tiếng Anh
// duy nhất do trợ giúp ẩn (-Answer) bấm Enter. Lối dự phòng: vòng 10 phút cùng cấu hình.
const DEV_ARGS = ['/nlh:speaker-loop', ...COMMON, '--mcp-config', '<config>', '--dangerously-load-development-channels', 'server:speaker'];
const CONFIG_ARGS = [...LOOP_ARGS, '--mcp-config', '<config>'];

// Máy "đã cho phép": một chính sách giả có đúng hai khoá, ở thư mục tạm; LOA_MANAGED_SETTINGS_FILE chỉ chỗ đọc cho policy.mjs.
function allowedPolicy() {
  const file = join(temp('thap-policy'), 'managed-settings.json').replaceAll('\\', '/');
  writeFileSync(file, JSON.stringify({ channelsEnabled: true, allowedChannelPlugins: [{ marketplace: 'nlh-governance', plugin: 'nlh' }] }));
  return file;
}
// Máy chưa cho phép: một đường dẫn tới file không có.
const noPolicy = () => join(temp('thap-policy'), 'khong-co.json').replaceAll('\\', '/');

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

  test('start.ps1 (Windows): UTF-8 có BOM; NLH_TOWER chỉ trong cấu hình kênh; khoá xin bằng nút Cho phép (pair.mjs), không ô dán; Claude Code và Node bản chính thức, kiểm mã băm', () => {
    const raw = readFileSync(join(plugin, 'speaker/start.ps1'));
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 có BOM cho PowerShell 5.1');
    const ps = raw.toString('utf8');
    // Cách mở Claude theo máy: đã cho phép kênh của gói (policy.mjs mode) thì kênh theo tên gói; chưa thì kênh phát triển, không ai cần quyền quản trị.
    assert.ok(ps.includes("$common = @('-n', 'Loa tỉnh NhiLe', '--model', 'sonnet', '--settings', $settings)"));
    assert.ok(ps.includes("$arguments = @('/nlh:speaker-loop') + $common + @('--channels', ($mode -replace '^channel ', ''))"));
    assert.ok(ps.includes("$loop = @('/loop 10m /nlh:speaker-loop') + $common"));
    assert.ok(ps.includes("$arguments = @('/nlh:speaker-loop') + $common + @('--mcp-config', $config, '--dangerously-load-development-channels', 'server:speaker')"));
    assert.ok(ps.includes("$loop = $loop + @('--mcp-config', $config)"));
    // Không cửa sổ, không hộp xin quyền quản trị, không bản nhìn thấy: loa.vbs mở start.ps1 -Auto; một Loa mỗi máy.
    assert.match(ps, /\[switch\]\$Auto/);
    assert.doesNotMatch(ps, /Handoff|CheckReady|Test-Ready|Test-Listening|policy\.mjs'? ensure|RunAs|-Verb/);
    assert.match(ps, /New-Object Threading\.Mutex\(\$false, 'Local\\LoaTinhNhiLe'\)/);
    assert.match(ps, /if \(-not \$Auto\) \{ Read-Host 'Bấm Enter để đóng'/);
    assert.match(ps, /last-error\.json/, 'chạy ẩn mà trục trặc: để lại một dòng cho phiên Claude kế tiếp');
    // Trợ giúp ẩn: chỉ gửi Enter khi màn hình đúng là câu hỏi kênh phát triển và có dòng chọn "1. I am using this for local development".
    assert.match(ps, /\[int\]\$Answer = 0/);
    assert.ok(ps.includes("$question = 'Loading development channels'"));
    assert.ok(ps.includes("$choice = '1\\. I am using this for local development'"));
    assert.match(ps, /if \(\$screen -match \$question -and \$screen -match \$choice\)/);
    assert.ok(ps.includes('-Answer $PID'));
    // Đăng nhập Claude trước khi mở: chưa có thì một hộp thoại tiếng Việt và một lần bấm ở trình duyệt, rồi đánh dấu các câu hỏi đầu của Claude Code là đã trả lời.
    assert.match(ps, /Loa cần bạn đăng nhập Claude một lần\./);
    assert.match(ps, /-ArgumentList 'auth', 'login' -WindowStyle Hidden/);
    assert.match(ps, /prepare\.mjs/);
    // Chạy ẩn mà người dùng bấm đúp rồi dừng giữa chừng: một hộp thoại nói câu đó (tác vụ đăng nhập và chế độ thử thì không hiện hộp).
    assert.match(ps, /if \(\$Auto -and -not \$Quiet -and -not \$DryRun\) \{\s+try \{ Add-Type -AssemblyName PresentationFramework; \[void\]\[Windows\.MessageBox\]::Show\(\$text, 'Loa tỉnh NhiLe'\)/);
    // Loa ẩn thoát sớm (câu hỏi kênh không được trả lời) thì chạy kiểu 10 phút ở mọi chế độ; Loa ẩn dừng không lỗi thì để lại một dòng cho phiên sau (laptop 28/10).
    assert.match(ps, /-lt 60\) \{\s+Write-Host ''\s+Write-Host 'Kênh báo nhanh chưa mở được/);
    assert.doesNotMatch(ps, /-lt 60 -and \$mode -like/);
    assert.match(ps, /if \(\$Auto\) \{ Stop-Loa 'Loa đã dừng\. Bấm đúp Loa để mở lại\.' \}/);
    // Kênh cần đường dẫn claude và thư mục làm việc để tra, mở lại và mở phiên (phiếu 98bd8b93).
    assert.match(ps, /\$envs = @\{ NLH_TOWER = '1'; NLH_TOWER_DIR = \$Dir; NLH_TOWER_WORK = \$Work; NLH_TOWER_TOAST = '1'; CLAUDE_BIN = \$claude \}/);
    assert.doesNotMatch(ps, /Tháp/);
    assert.doesNotMatch(ps, /\$env:NLH_TOWER\s*=|skip-permissions|bypassPermissions|AsPlainText|ConvertFrom-SecureString -Key|Write-Host \$secure/);
    assert.doesNotMatch(ps, /Read-Host -AsSecureString|ConvertTo-SecureString/, 'không còn ô dán khoá');
    assert.ok(ps.includes('& $node $pair --dir $Dir | Out-Host'));
    assert.ok(ps.includes("foreach ($name in @('speaker.mjs', 'pair.mjs', 'policy.mjs', 'prepare.mjs', 'loa.vbs', 'toast.ps1'))"), 'chép các file Loa từ gói');
    assert.ok(ps.includes(`'${KEY_FILE}'`));
    assert.match(ps, /'https:\/\/claude\.ai\/install\.ps1'/);
    assert.match(ps, /\$base = 'https:\/\/nodejs\.org\/dist\/latest-v22\.x'/);
    assert.match(ps, /Get-FileHash -LiteralPath \$part -Algorithm SHA256/);
    // Cửa sổ lần đầu (28/10): chữ của bộ cài tiếng Anh và lời dặn PATH đi vào loa.log, màn hình chỉ có một câu tiếng Việt; không nói "Claude Code".
    assert.match(ps, /-RedirectStandardOutput \$installOut/);
    assert.ok(!ps.includes('-File $installer | Out-Host'), 'bộ cài không in ra màn hình');
    assert.doesNotMatch(ps, /(Write-Host|Stop-Loa) '[^']*Claude Code/, 'người dùng không nghe "Claude Code"');
    assert.match(ps, /Lần đầu: Loa đang chuẩn bị máy này, khoảng một phút\./);
    // Máy chỉ có app Claude: tìm claude.exe trong thư mục dữ liệu của app, trước khi tìm trên PATH.
    assert.ok(ps.includes("'Claude-Data") && ps.indexOf("'Claude-Data") < ps.indexOf('Get-Command claude.exe'));
    assert.doesNotMatch(ps, /Startup|CurrentVersion\\Run|schtasks/i, 'tự mở là tác vụ của người dùng, không thư mục Startup hay Run');
    // Giữ máy thức khi Loa mở; kênh hỏng thì mở lại không cờ, chỉ nhịp 10 phút, in một dòng (phiếu 98bd8b93).
    assert.match(ps, /SetThreadExecutionState\(\[uint32\]'0x80000001'\)/);
    assert.match(ps, /& \$claude @loop/);
    // Tắt hook cho riêng phiên Loa qua tệp; bản lối mở cũ chạy bản mới ngay một lần (việc 17e647c1).
    assert.ok(ps.includes(`[IO.File]::WriteAllText($settings, '{ "disableAllHooks": true }'`));
    assert.match(ps, /& \(Join-Path \$Dir 'start\.ps1'\) -Dir \$Dir -Work \$Work -DryRun:\$DryRun -Auto:\$Auto -Quiet:\$Quiet -Relaunched/);
    assert.match(ps, /if \(\$stale -and -not \$Relaunched\)/);
    assert.match(ps, /Kênh báo nhanh chưa mở được\. Loa vẫn chạy, mỗi 10 phút xem việc một lần\./);
  });

  test('start.sh (macOS): khoá xin bằng nút Cho phép (pair.mjs), đúng mục Keychain kênh đọc; cùng cách mở Claude như Windows', () => {
    const sh = read('speaker/start.sh');
    assert.match(sh, /^#!\/bin\/bash\n/);
    assert.ok(sh.includes(`SERVICE=${KEYCHAIN.service}\n`) && sh.includes(`ACCOUNT=${KEYCHAIN.account}\n`));
    assert.doesNotMatch(sh, /read -r -s|add-generic-password/, 'không còn ô dán khoá; khoá do pair.mjs cất');
    assert.ok(sh.includes('"$NODE" "$DIR/pair.mjs" --dir "$DIR"\n  paired=$?'));
    // pair.mjs cất khoá vào Keychain qua stdin của security -i, không nằm trong dòng lệnh.
    assert.match(read('speaker/pair.mjs'), /execFileSync\('\/usr\/bin\/security', \['-i'\], \{\s+input: `add-generic-password -U -s \$\{KEYCHAIN\.service\} -a \$\{KEYCHAIN\.account\} -w \$\{key\}\\n`/);
    assert.ok(sh.includes(`set -- /nlh:speaker-loop -n 'Loa tỉnh NhiLe' --model sonnet --settings "$SETTINGS" --channels "\${MODE#channel }"`));
    assert.ok(sh.includes(`set -- "$LOOP" -n 'Loa tỉnh NhiLe' --model sonnet --settings "$SETTINGS" --mcp-config "$CONFIG"`));
    assert.ok(sh.includes(`set -- "$LOOP" -n 'Loa tỉnh NhiLe' --model sonnet --settings "$SETTINGS"`));
    assert.doesNotMatch(sh, /dangerously|local development|Loading development|no MCP server|Authorize/);
    assert.match(sh, /const env = \{ NLH_TOWER: "1", NLH_TOWER_DIR: dir, NLH_TOWER_WORK: work, CLAUDE_BIN: claude \}/);
    assert.doesNotMatch(sh, /Tháp(?! tỉnh NhiLe\.command)/);
    assert.doesNotMatch(sh, /skip-permissions|bypassPermissions/);
    assert.match(sh, /export NLH_TOWER=1 NLH_TOWER_DIR="\$DIR" NLH_TOWER_WORK="\$WORK" CLAUDE_BIN="\$CLAUDE"/);
    assert.match(sh, /curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/);
    assert.match(sh, /shasum -a 256 "\$part"/);
    assert.doesNotMatch(sh, /LaunchAgents|launchctl|crontab/, 'tự mở đặt ở setup, không ở lối mở');
    assert.match(sh, /\/usr\/bin\/caffeinate -i -w \$\$ &/);
    assert.ok(sh.includes(`LOOP='${LOOP_ARGS[0]}'`));
    assert.match(sh, /"\$CLAUDE" "\$\{FALLBACK\[@\]\}"/);
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
    // 28/10: setup (chạy trong phiên Claude, có thể bị chặn đặt lịch ở chế độ Auto) không đăng ký gì; lối mở làm khi người dùng bấm đúp.
    const setupPs = ps.toString('utf8');
    assert.doesNotMatch(setupPs, /Register-ScheduledTask|NoAutostart|New-ScheduledTask/);
    const startPs = read('speaker/start.ps1');
    assert.match(startPs, /New-ScheduledTaskTrigger -AtLogOn -User \$user/);
    assert.match(startPs, /-LogonType Interactive -RunLevel Limited/);
    assert.match(startPs, /Register-ScheduledTask -TaskName \$TaskName /);
    assert.match(startPs, /if \(-not \$Quiet -and -not \$DryRun\) \{ Register-Login \}/);
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
  test('lần đầu: chép Loa từ plugin, gọi pair.mjs xin khoá bằng nút Cho phép, viết cấu hình kênh; lần sau không xin lại', () => {
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
    // pair.mjs giả trong plugin đã cài (bản thật gọi mạng): ghi lại đối số và đặt khoá vào Keychain giả như bản thật sau khi người bấm Cho phép.
    const pairArgv = join(bin, 'pair-argv.json');
    writeFileSync(
      join(home, '.claude/plugins/cache/nlh-governance/nlh', version, 'speaker/pair.mjs'),
      `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(pairArgv)}, JSON.stringify(process.argv.slice(2)));
writeFileSync(${JSON.stringify(join(bin, 'keychain.txt'))}, 'da-co-khoa\\n');
console.log('Đã lưu khoá Loa trên máy này.');
`,
    );
    // Máy chưa cho phép kênh (không có chính sách): vòng 10 phút.
    const policyFile = noPolicy();
    const run = (input) =>
      spawnSync(bash, [posix(join(plugin, 'speaker/start.sh'))], {
        input,
        encoding: 'utf8',
        env: { ...process.env, HOME: posix(home), USERPROFILE: home, SPEAKER_SECURITY: posix(security), SPEAKER_DRY_RUN: '1', TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: policyFile },
      });

    const first = run('');
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Loa cần được bạn cho phép một lần\. Trang Nếp sắp mở: bấm Cho phép\./);
    assert.doesNotMatch(first.stdout, /Dán khoá|dán khoá/);
    assert.match(first.stdout, /Đã lưu khoá Loa trên máy này\./);
    assert.match(first.stdout, /Loa đang nghe Nếp\. Đừng đóng cửa sổ này\./);
    assert.match(first.stdout, /Lần đầu Claude Code hỏi vài câu: bấm Enter để chọn sẵn./);
    const dir = join(home, '.tinh-nlh/speaker');
    const dry = first.stdout.split('\n').find((line) => line.startsWith('DRYRUN '));
    const fallbackLine = first.stdout.split('\n').find((line) => line.startsWith('DRYRUN-FALLBACK '));
    assert.deepEqual(fallbackLine.split(' | ').slice(1), LOOP_ARGS.map(placed(posix(dir))));
    assert.deepEqual(dry.split(' | ').slice(1), LOOP_ARGS.map(placed(posix(dir))));
    assert.doesNotMatch(first.stdout, /[Dd]angerously|development channel|Authorize|\bchannel\b/, 'không chữ tiếng Anh cho người dùng');
    assert.equal(readFileSync(join(dir, 'speaker.mjs'), 'utf8'), read('speaker/speaker.mjs'));
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), version);
    assert.equal(readFileSync(join(dir, 'pair.mjs'), 'utf8').includes('da-co-khoa'), true, 'chép pair.mjs từ plugin sang thư mục Loa');
    assert.deepEqual(JSON.parse(readFileSync(pairArgv, 'utf8')).map(same), ['--dir', same(posix(dir))]);
    assert.ok(!existsSync(join(dir, 'speaker-mcp.json')), 'gói đã cài từ chợ: máy chủ Loa lấy từ gói, không cần cấu hình riêng');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'speaker-settings.json'), 'utf8')), { disableAllHooks: true }, 'phiên Loa tắt mọi hook');

    // Bản lối mở cũ trong thư mục Loa (chép từ lần trước, trước khi gói cập nhật): chép bản mới rồi chạy ngay bản mới một lần.
    const stale = `${read('speaker/start.sh')}\n# bản cũ\n`;
    writeFileSync(join(dir, 'start.sh'), stale.replace(/--settings "\$SETTINGS" /, ''));
    const relaunched = spawnSync(bash, [posix(join(dir, 'start.sh'))], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env, HOME: posix(home), USERPROFILE: home, SPEAKER_SECURITY: posix(security), SPEAKER_DRY_RUN: '1', TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: policyFile },
    });
    assert.equal(relaunched.status, 0, relaunched.stdout + relaunched.stderr);
    assert.equal(readFileSync(join(dir, 'start.sh'), 'utf8'), read('speaker/start.sh'), 'đã chép bản mới');
    const relaunchedDry = relaunched.stdout.split('\n').filter((line) => line.startsWith('DRYRUN '));
    assert.equal(relaunchedDry.length, 1, 'chạy bản mới đúng một lần');
    assert.deepEqual(relaunchedDry[0].split(' | ').slice(1), LOOP_ARGS.map(placed(posix(dir))), 'dòng lệnh của bản mới');

    const again = run('');
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.doesNotMatch(again.stdout, /cho phép một lần|Đã lưu khoá/);
  });

  // Nếp chưa nhận lời xin (pair.mjs thoát 2): macOS in đúng một câu như Windows, để lại dòng kỹ thuật cho phiên Claude kế tiếp báo người lo.
  test('Nếp chưa nhận lời xin (pair.mjs thoát 2) → một câu, dòng kỹ thuật vào last-error.json, không lưu khoá', () => {
    const home = fakeHome();
    const bin = temp('thap-bin');
    mkdirSync(join(home, '.local/bin'), { recursive: true });
    writeFileSync(join(home, '.local/bin/claude'), '#!/bin/bash\nexit 0\n');
    chmodSync(join(home, '.local/bin/claude'), 0o755);
    const security = join(bin, 'security');
    writeFileSync(security, ['#!/bin/bash', 'case "$1" in', '  find-generic-password) exit 44 ;;', 'esac', ''].join('\n'));
    chmodSync(security, 0o755);
    const sentence = 'Nếp chưa sẵn sàng bước này nên Loa chưa báo việc mới được. Lần tới bạn mở Claude, máy sẽ tự báo người lo kỹ thuật.';
    writeFileSync(
      join(home, '.claude/plugins/cache/nlh-governance/nlh', version, 'speaker/pair.mjs'),
      `import { writeFileSync } from 'node:fs';
const at = process.argv.indexOf('--dir');
writeFileSync(process.argv[at + 1] + '/pair-detail.txt', 'POST /tower/pair 404\\n');
console.log(${JSON.stringify(sentence)});
process.exitCode = 2;
`,
    );
    const run = spawnSync(bash, [posix(join(plugin, 'speaker/start.sh'))], {
      input: '\n',
      encoding: 'utf8',
      env: { ...process.env, HOME: posix(home), USERPROFILE: home, SPEAKER_SECURITY: posix(security), SPEAKER_DRY_RUN: '1', TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: noPolicy() },
    });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.equal(run.stdout.split(sentence).length - 1, 1, 'câu hiện đúng một lần');
    assert.doesNotMatch(run.stdout, /khoá|Thử lại sau ít phút|Loa chưa được phép/);
    const left = JSON.parse(readFileSync(join(home, '.tinh-nlh/speaker/last-error.json'), 'utf8'));
    assert.equal(left.reason, `${sentence} (POST /tower/pair 404)`);
  });

  // Hai máy khác nhau về quyền kênh (việc 26f86f3d): đã cho phép thì kênh theo tên gói; chỉ có gói đồng bộ từ claude.ai thì
  // vòng 10 phút kèm máy chủ Loa nạp bằng --mcp-config. Khoá đã có trong Keychain giả nên không hỏi.
  test('LOA_MANAGED_SETTINGS_FILE chỉ đổi chỗ ĐỌC của lệnh mode; managedPath, ghi và nâng quyền không theo biến này', () => {
    const dir = temp('loa-env');
    const evil = join(dir, 'evil.json');
    const policy = join(plugin, 'speaker/policy.mjs');
    const env = { ...process.env, LOA_MANAGED_SETTINGS_FILE: evil };
    assert.equal(managedPath('win32', { LOA_MANAGED_SETTINGS_FILE: evil, ProgramFiles: 'C:\\Program Files' }).replace(/\\/g, '/'), 'C:/Program Files/ClaudeCode/managed-settings.json');
    assert.equal(managedPath('darwin', { LOA_MANAGED_SETTINGS_FILE: evil }), '/Library/Application Support/ClaudeCode/managed-settings.json');
    // mode đọc theo biến (chỉ để thử); ensure/write thì không: không có tệp nào xuất hiện ở đường dẫn trong biến.
    writeFileSync(evil, JSON.stringify({ channelsEnabled: true, allowedChannelPlugins: [{ marketplace: 'nlh-governance', plugin: 'nlh' }] }));
    assert.equal(spawnSync(process.execPath, [policy, 'mode', '--marketplace', 'nlh-governance'], { encoding: 'utf8', env }).stdout.trim(), 'channel plugin:nlh@nlh-governance');
    const before = readFileSync(evil, 'utf8');
    spawnSync(process.execPath, [policy, 'ensure', '--marketplace', 'nlh-governance', '--no-elevate', '--status', join(dir, 'status.json')], { encoding: 'utf8', env });
    assert.equal(readFileSync(evil, 'utf8'), before, 'ensure không đụng tới đường dẫn trong biến');
    assert.match(readFileSync(policy, 'utf8'), /command === 'mode' && process\.env\.LOA_MANAGED_SETTINGS_FILE/);
  });

  test('policy.mjs mode: đã cho phép → kênh theo tên gói; chưa cho phép hay kênh bị tắt → loop; không có gói cài từ kho → loop-config', () => {
    const dir = temp('loa-mode');
    const file = join(dir, 'managed-settings.json');
    const policy = join(plugin, 'speaker/policy.mjs');
    const run = (...args) => spawnSync(process.execPath, [policy, ...args], { encoding: 'utf8' }).stdout.trim();
    assert.equal(run('mode', '--file', file, '--marketplace', 'nlh-governance'), 'loop');
    run('write', '--file', file, '--marketplace', 'nlh-governance');
    assert.equal(run('mode', '--file', file, '--marketplace', 'nlh-governance'), 'channel plugin:nlh@nlh-governance');
    assert.equal(run('mode', '--file', file, '--marketplace', 'kho-khac'), 'loop', 'kho khác chưa được cho phép');
    assert.equal(run('mode', '--file', file, '--home', dir), 'loop-config', 'máy không có gói nào cài từ kho');
    // Người quản trị tắt kênh thì vẫn chạy 10 phút, không báo lỗi.
    const off = join(dir, 'off.json');
    writeFileSync(off, JSON.stringify({ channelsEnabled: false }));
    assert.equal(run('mode', '--file', off, '--marketplace', 'nlh-governance'), 'loop');
  });

  test('chế độ theo máy: đã cho phép → kênh theo tên gói; gói chỉ đồng bộ từ claude.ai → vòng 10 phút kèm cấu hình', () => {
    const launch = (layout, policy) => {
      const home = fakeHome('user', layout);
      const bin = temp('thap-bin');
      mkdirSync(join(home, '.local/bin'), { recursive: true });
      writeFileSync(join(home, '.local/bin/claude'), '#!/bin/bash\nexit 0\n');
      chmodSync(join(home, '.local/bin/claude'), 0o755);
      writeFileSync(join(bin, 'keychain.txt'), 'da-co-khoa\n');
      writeFileSync(join(bin, 'security'), '#!/bin/bash\nstore="$(dirname "$0")/keychain.txt"\ncase "$1" in\n  find-generic-password) [ -s "$store" ] ;;\nesac\n');
      chmodSync(join(bin, 'security'), 0o755);
      const out = spawnSync(bash, [posix(join(home, '.claude/plugins', layout === 'synced' ? 'synced/org-id/plugin-id' : 'cache/nlh-governance/nlh/' + version, 'speaker/start.sh'))], {
        input: '',
        encoding: 'utf8',
        env: { ...process.env, HOME: posix(home), USERPROFILE: home, SPEAKER_SECURITY: posix(join(bin, 'security')), SPEAKER_DRY_RUN: '1', TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: policy },
      });
      assert.equal(out.status, 0, out.stdout + out.stderr);
      const dir = join(home, '.tinh-nlh/speaker');
      return { out, dir, home, dry: (tag) => out.stdout.split('\n').find((line) => line.startsWith(`${tag} `)).split(' | ').slice(1) };
    };

    const allowed = launch('cache', allowedPolicy());
    assert.deepEqual(allowed.dry('DRYRUN'), CHANNEL_ARGS.map(placed(posix(allowed.dir))));
    assert.deepEqual(allowed.dry('DRYRUN-FALLBACK'), LOOP_ARGS.map(placed(posix(allowed.dir))));
    assert.ok(!existsSync(join(allowed.dir, 'speaker-mcp.json')));

    const synced = launch('synced', allowedPolicy());
    assert.deepEqual(synced.dry('DRYRUN'), CONFIG_ARGS.map(placed(posix(synced.dir))));
    assert.deepEqual(synced.dry('DRYRUN-FALLBACK'), CONFIG_ARGS.map(placed(posix(synced.dir))));
    const config = JSON.parse(readFileSync(join(synced.dir, 'speaker-mcp.json'), 'utf8'));
    assert.deepEqual(Object.keys(config.mcpServers), ['speaker']);
    assert.deepEqual(config.mcpServers.speaker.args.map(same), [same(`${posix(synced.dir)}/speaker.mjs`)]);
    const { env: towerEnv } = config.mcpServers.speaker;
    assert.deepEqual(
      { ...towerEnv, NLH_TOWER_DIR: same(towerEnv.NLH_TOWER_DIR), NLH_TOWER_WORK: same(towerEnv.NLH_TOWER_WORK), CLAUDE_BIN: same(towerEnv.CLAUDE_BIN) },
      { NLH_TOWER: '1', NLH_TOWER_DIR: same(posix(synced.dir)), NLH_TOWER_WORK: same(`${posix(synced.home)}/TinhNhiLe`), CLAUDE_BIN: same(`${posix(synced.home)}/.local/bin/claude`) },
    );
    assert.ok(!JSON.stringify(config).includes('nlh_tower_'), 'khoá không vào cấu hình');
  });

  test('setup.sh: tạo "Loa tỉnh NhiLe.command" trỏ tới start.sh; bỏ "Tháp tỉnh NhiLe.command" cũ của mình; lối tắt cùng tên của người khác thì giữ nguyên', () => {
    const home = temp('thap-setup');
    const desktop = join(home, 'Desktop');
    mkdirSync(desktop);
    const setup = (dir) =>
      spawnSync(bash, [posix(join(plugin, 'speaker/setup.sh'))], { encoding: 'utf8', env: { ...process.env, HOME: posix(home), USERPROFILE: home, SPEAKER_DIR: posix(dir), SPEAKER_DESKTOP: posix(desktop), SPEAKER_AGENTS: posix(join(home, 'Agents')) } });
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
  test('start.ps1 -RegisterOnly: đăng ký tác vụ đăng nhập của người dùng trỏ tới loa.vbs; chạy lại không đổi; setup.ps1 không đăng ký', () => {
    const home = join(temp('loa-login'), 'Thùy ỉ');
    const dir = join(home, '.tinh-nlh', 'speaker');
    mkdirSync(dir, { recursive: true });
    const name = `Loa thử ${Date.now()}`;
    const run = () => ps(join(plugin, 'speaker/start.ps1'), ['-RegisterOnly', '-Dir', dir, '-TaskName', name], { USERPROFILE: home });
    const show = () =>
      spawnSync(powershell, ['-NoProfile', '-Command', `[Console]::OutputEncoding = [Text.Encoding]::UTF8; $t = Get-ScheduledTask -TaskName '${name}'; $t.Actions[0].Execute; $t.Actions[0].Arguments; $t.Triggers[0].CimClass.CimClassName; $t.Principal.RunLevel`], { encoding: 'utf8', cwd: tmpdir() }).stdout.trim().split(/\r?\n/);
    try {
      const first = run();
      assert.equal(first.status, 0, first.stdout + first.stderr);
      const [execute, args, trigger, level] = show();
      assert.match(execute, /wscript\.exe$/i);
      assert.equal(args, `"${join(dir, 'loa.vbs')}" login`);
      assert.match(trigger, /LogonTrigger/);
      assert.equal(level, 'Limited');
      assert.deepEqual(show(), [execute, args, trigger, level]);
      assert.equal(run().status, 0, 'chạy lại không lỗi');
      assert.equal(existsSync(join(dir, 'loa.log')), false, 'không ghi lỗi nào');
    } finally {
      spawnSync(powershell, ['-NoProfile', '-Command', `Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false -ErrorAction SilentlyContinue`], { cwd: tmpdir() });
    }
  });

  // Hub chưa có đường xin phép (28/10: POST /tower/pair trả 404): trước đây "Thử lại sau ít phút" (sai) và "Chưa có khoá" (chữ cấm).
  test('start.ps1: Nếp chưa nhận lời xin (pair.mjs thoát 2) → một câu đúng, không đứng chờ khi chạy ngầm, để lại dòng kỹ thuật cho phiên Claude kế tiếp báo người lo', () => {
    const home = fakeHome('Thùy ỉ');
    mkdirSync(join(home, '.local', 'bin'), { recursive: true });
    writeFileSync(join(home, '.local', 'bin', 'claude.exe'), '');
    const sentence = 'Nếp chưa sẵn sàng bước này nên Loa chưa báo việc mới được. Lần tới bạn mở Claude, máy sẽ tự báo người lo kỹ thuật.';
    // pair.mjs giả như bản thật khi hub trả 404: in một câu, ghi dòng kỹ thuật, thoát 2.
    writeFileSync(
      join(home, '.claude/plugins/cache/nlh-governance/nlh', version, 'speaker/pair.mjs'),
      `import { writeFileSync } from 'node:fs';
const at = process.argv.indexOf('--dir');
writeFileSync(process.argv[at + 1] + '/pair-detail.txt', 'POST /tower/pair 404\\n');
console.log(${JSON.stringify(sentence)});
process.exitCode = 2;
`,
    );
    const dir = join(home, '.tinh-nlh', 'speaker');
    const env = { ...process.env, HOME: home, USERPROFILE: home, TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: noPolicy() };
    const start = join(plugin, 'speaker/start.ps1');
    const base = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', start, '-DryRun'];
    const check = (out) => {
      assert.equal(out.status, 1, out.stdout + out.stderr);
      assert.equal(out.stdout.split(sentence).length - 1, 1, 'câu hiện đúng một lần');
      assert.doesNotMatch(out.stdout, /khoá|Thử lại sau ít phút|PATH|Claude Code/);
      assert.ok(!existsSync(join(dir, KEY_FILE)), 'không lưu gì');
      const left = JSON.parse(readFileSync(join(dir, 'last-error.json'), 'utf8'));
      assert.equal(left.reason, `${sentence} (POST /tower/pair 404)`);
      assert.notEqual(readFileSync(join(dir, 'last-error.json'))[0], 0xef, 'JSON không có BOM');
      rmSync(join(dir, 'last-error.json'));
    };
    // Cửa sổ nhìn thấy: câu hiện, đợi bấm Enter (nhập sẵn), vẫn để lại dòng cho phiên Claude báo.
    check(spawnSync(powershell, base.filter((arg) => arg !== '-NonInteractive'), { encoding: 'utf8', cwd: tmpdir(), input: '\n', env }));
    // Chạy ngầm: không ai bấm Enter, thoát ngay.
    check(spawnSync(powershell, [...base, '-Auto'], { encoding: 'utf8', cwd: tmpdir(), env }));
  });

  test('setup.ps1: chép Loa, tạo lối tắt trỏ tới start.ps1 (tên người dùng có dấu vẫn đúng); bỏ lối tắt "Tháp tỉnh NhiLe" cũ của mình; lối tắt cùng tên trỏ chỗ khác thì giữ nguyên', () => {
    const home = join(temp('thap-setup'), 'Thùy ỉ');
    mkdirSync(home);
    const desktop = join(home, 'Desktop');
    mkdirSync(desktop);
    const dir = join(home, '.tinh-nlh', 'speaker');
    const done = ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop]);
    assert.equal(done.status, 0, done.stdout + done.stderr);
    assert.match(done.stdout, /Đã có biểu tượng Loa tỉnh NhiLe trên màn hình chính\./);
    const link = join(desktop, 'Loa tỉnh NhiLe.lnk');
    // Lối tắt trỏ tới loa.vbs (wscript, không cửa sổ), không phải start.ps1.
    const target = () =>
      spawnSync(powershell, ['-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $l = (New-Object -ComObject Shell.Application).NameSpace($env:DESK).ParseName($env:NAME).GetLink; "$($l.Path)|$($l.Arguments)"'], {
        encoding: 'utf8',
    // PowerShell ghi bộ nhớ đệm mô-đun vào thư mục hiện tại khi thư mục người dùng là giả: chạy ở thư mục tạm.
    cwd: tmpdir(),
        env: { ...process.env, DESK: desktop, NAME: 'Loa tỉnh NhiLe.lnk' },
      }).stdout.trim();
    // Windows tự viết lại hoa thường của đường dẫn tới powershell.exe: so không phân biệt hoa thường.
    const wscript = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe');
    assert.equal(target().toLowerCase(), `${wscript}|"${join(dir, 'loa.vbs')}"`.toLowerCase());
    assert.ok(target().includes('Thùy ỉ'), 'giữ đúng chữ có dấu');
    for (const name of ['start.ps1', 'loa.vbs', 'policy.mjs']) assert.ok(readFileSync(join(dir, name)).equals(readFileSync(join(plugin, 'speaker', name))), `chép ${name}`);
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), version);
    // Lối tắt cùng tên trỏ tới bản Loa cũ của mình (~\.tinh-nlh) thì thay; không đọc được (của người khác) thì giữ.
    const older = ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', join(home, '.tinh-nlh', 'cu'), '-Desktop', desktop]);
    assert.match(older.stdout, /Đã có biểu tượng Loa tỉnh NhiLe/);
    assert.match(target(), /\\\.tinh-nlh\\cu\\loa\.vbs/, 'thay lối tắt Loa cũ của mình');
    ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop]);
    assert.match(target(), /\\\.tinh-nlh\\speaker\\loa\.vbs/);

    // Lối tắt cũ "Tháp tỉnh NhiLe" trỏ tới ~.tinh-nlh (bản trước khi đổi tên Loa): setup tự bỏ. Lối tắt cũ không đọc được
    // (không phải của mình) thì giữ.
    const old = join(desktop, 'Tháp tỉnh NhiLe.lnk');
    cpSync(link, old);
    const replaced = ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop]);
    assert.match(replaced.stdout, /Đã bỏ biểu tượng cũ Tháp tỉnh NhiLe\./);
    assert.ok(!existsSync(old));
    writeFileSync(old, 'không phải lối tắt');
    ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop]);
    assert.ok(existsSync(old), 'không bỏ lối tắt không phải của mình');
    writeFileSync(link, 'không phải lối tắt');
    assert.match(ps(join(plugin, 'speaker/setup.ps1'), ['-Dir', dir, '-Desktop', desktop]).stdout, /giữ nguyên lối tắt đó/);
  });

  // Loa chạy ẩn mà trục trặc: không ai thấy cửa sổ, nên để lại một dòng cho phiên Claude kế tiếp nói và báo cho ô CTO (hooks/machine.mjs).
  test('start.ps1 -Auto: không tìm thấy gói thì không đợi bấm Enter, thoát 1 và để lại last-error.json; chạy tay thì không để lại', () => {
    const home = join(temp('thap-err'), 'Thùy ỉ');
    mkdirSync(home, { recursive: true });
    const dir = join(home, '.tinh-nlh', 'speaker');
    const hidden = ps(join(plugin, 'speaker/start.ps1'), ['-Auto', '-DryRun'], { USERPROFILE: home, TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: noPolicy() });
    assert.equal(hidden.status, 1, hidden.stdout + hidden.stderr);
    const left = JSON.parse(readFileSync(join(dir, 'last-error.json'), 'utf8'));
    assert.match(left.reason, /^Chưa thấy plugin Nếp trên máy\./);
    assert.match(left.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.notEqual(readFileSync(join(dir, 'last-error.json'))[0], 0xef, 'JSON không có BOM');
    // Chạy tay thì người dùng thấy cửa sổ và tự đọc: không để lại dòng nào.
    rmSync(join(dir, 'last-error.json'));
    const manual = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'speaker/start.ps1'), '-DryRun'], {
      encoding: 'utf8',
      cwd: tmpdir(),
      input: '\n',
      env: { ...process.env, USERPROFILE: home, TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: noPolicy() },
    });
    assert.ok(manual.status !== 0 || manual.stdout.includes('Chưa thấy plugin Nếp'), manual.stdout + manual.stderr);
    assert.equal(existsSync(join(dir, 'last-error.json')), false);
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
    const claude = join(home, '.local', 'bin', 'claude.exe');
    const launch = (userHome, policy) => {
      const out = ps(join(plugin, 'speaker/start.ps1'), ['-DryRun'], { USERPROFILE: userHome, TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: policy });
      assert.equal(out.status, 0, out.stdout + out.stderr);
      const line = (tag) => out.stdout.split(/\r?\n/).find((text) => text.startsWith(`${tag} `));
      return { out, line };
    };
    // Máy chưa cho phép kênh: kênh phát triển qua --mcp-config (28/10, không cần quyền quản trị); lối dự phòng vòng 10 phút cùng cấu hình.
    const run = launch(home, noPolicy());
    assert.doesNotMatch(run.out.stdout, /Khoá cho Loa|Đã lưu khoá/);
    assert.equal(readFileSync(join(dir, KEY_FILE), 'utf8'), sealed);
    assert.equal(readFileSync(join(dir, 'speaker.mjs'), 'utf8'), read('speaker/speaker.mjs'));
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), version);
    assert.equal(run.line('DRYRUN'), `DRYRUN ${claude} ${DEV_ARGS.map(placed(dir, sep)).join(' | ')}`);
    assert.equal(run.line('DRYRUN-FALLBACK'), `DRYRUN-FALLBACK ${claude} ${CONFIG_ARGS.map(placed(dir, sep)).join(' | ')}`);
    assert.ok(existsSync(join(dir, 'speaker-mcp.json')));
    assert.doesNotMatch(run.out.stdout.split(/\r?\n/).filter((text) => !text.startsWith('DRYRUN')).join('\n'), /[Dd]angerously|development channel|Authorize/, 'không chữ tiếng Anh cho người dùng');

    // Đã cho phép: kênh theo tên gói; lối dự phòng vẫn là vòng 10 phút.
    const allowed = launch(home, allowedPolicy());
    assert.equal(allowed.line('DRYRUN'), `DRYRUN ${claude} ${CHANNEL_ARGS.map(placed(dir, sep)).join(' | ')}`);
    assert.equal(allowed.line('DRYRUN-FALLBACK'), `DRYRUN-FALLBACK ${claude} ${LOOP_ARGS.map(placed(dir, sep)).join(' | ')}`);
    assert.ok(!existsSync(join(dir, 'speaker-mcp.json')), 'kênh theo tên gói không cần --mcp-config');

    // Gói chỉ có bản đồng bộ từ claude.ai: kênh phát triển, máy chủ Loa nạp bằng --mcp-config.
    const synced = fakeHome('Thùy ỉ', 'synced');
    mkdirSync(join(synced, '.local', 'bin'), { recursive: true });
    writeFileSync(join(synced, '.local', 'bin', 'claude.exe'), '');
    mkdirSync(join(synced, '.tinh-nlh', 'speaker'), { recursive: true });
    cpSync(join(dir, KEY_FILE), join(synced, '.tinh-nlh', 'speaker', KEY_FILE));
    const syncedDir = join(synced, '.tinh-nlh', 'speaker');
    const onlySynced = launch(synced, allowedPolicy());
    assert.equal(onlySynced.line('DRYRUN'), `DRYRUN ${join(synced, '.local', 'bin', 'claude.exe')} ${DEV_ARGS.map(placed(syncedDir, sep)).join(' | ')}`);
    const raw = readFileSync(join(syncedDir, 'speaker-mcp.json'));
    assert.notEqual(raw[0], 0xef, 'JSON không có BOM');
    const { speaker: tower } = JSON.parse(raw.toString('utf8')).mcpServers;
    assert.deepEqual(tower.args, [join(syncedDir, 'speaker.mjs')]);
    assert.deepEqual(tower.env, { NLH_TOWER: '1', NLH_TOWER_DIR: syncedDir, NLH_TOWER_WORK: join(synced, 'TinhNhiLe'), NLH_TOWER_TOAST: '1', CLAUDE_BIN: join(synced, '.local', 'bin', 'claude.exe') });
    assert.match(tower.command, /node(\.exe)?$/i);
    assert.ok(existsSync(join(home, 'TinhNhiLe')), 'thư mục làm việc của Loa');

    // Máy chỉ có app Claude (không ~\.local\bin, claude không trên PATH): lấy claude.exe mới nhất trong thư mục dữ liệu của app, gọi bằng đường đầy đủ.
    const appOnly = fakeHome('Thùy ỉ');
    const appDir = join(appOnly, '.tinh-nlh', 'speaker');
    mkdirSync(appDir, { recursive: true });
    cpSync(join(dir, KEY_FILE), join(appDir, KEY_FILE));
    const local = join(appOnly, 'AppData', 'Local');
    const bundled = (name) => {
      const file = join(local, 'Claude-Data', 'claude_x', 'claude-code', name, 'abc', 'claude.exe');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, '');
      return file;
    };
    const yesterday = new Date(Date.now() - 86400000);
    utimesSync(bundled('2.1.100'), yesterday, yesterday);
    const newer = bundled('2.1.308');
    const app = ps(join(plugin, 'speaker/start.ps1'), ['-DryRun'], { USERPROFILE: appOnly, HOME: appOnly, LOCALAPPDATA: local, APPDATA: join(appOnly, 'AppData', 'Roaming'), TOWER_ORIGIN: '', LOA_MANAGED_SETTINGS_FILE: noPolicy() });
    assert.equal(app.status, 0, app.stdout + app.stderr);
    assert.ok(app.stdout.split(/\r?\n/).some((text) => text.startsWith(`DRYRUN ${newer} `)), 'claude.exe mới nhất trong app, không cần PATH');
    assert.doesNotMatch(app.stdout, /PATH|Claude Code/);
  });
});
