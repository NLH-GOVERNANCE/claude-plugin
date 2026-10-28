// Phép thử quyền kênh Loa (plugins/tinh-nlh/speaker/policy.mjs, việc 26f86f3d): ghi gộp đúng hai khoá vào chính sách của
// máy, không đụng khoá khác, không đè khoá người quản trị đã tắt, bấm Không thì chạy chế độ 10 phút. Mọi phép thử ghi vào
// thư mục tạm; không bao giờ chạm managed-settings.json thật của máy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { OFFICIAL, adminScript, ask, ensure, findMarketplace, isAllowed, managedPath, merge, plan, validMarketplace, winDir, write } from '../plugins/tinh-nlh/speaker/policy.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = join(root, 'plugins/tinh-nlh/speaker/policy.mjs');
const read = (path) => readFileSync(join(root, 'plugins/tinh-nlh', path), 'utf8');
const temps = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'policy-'));
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const MARKET = 'nlh-governance';
const ENTRY = { marketplace: MARKET, plugin: 'nlh' };
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

describe('chỗ đặt và kho của gói', () => {
  test('managedPath: đúng thư mục Claude Code đọc ở từng hệ điều hành (Windows không phải ProgramData cũ)', () => {
    assert.equal(managedPath('win32', { ProgramFiles: 'C:\\Program Files' }).replace(/\\/g, '/'), 'C:/Program Files/ClaudeCode/managed-settings.json');
    assert.equal(managedPath('darwin'), '/Library/Application Support/ClaudeCode/managed-settings.json');
    assert.equal(managedPath('linux'), '/etc/claude-code/managed-settings.json');
  });

  test('winDir: đường dẫn hệ thống không tin thẳng biến môi trường (đi vào lệnh admin); chỉ nhận dạng chuẩn cùng ổ với SystemDrive', () => {
    assert.equal(winDir('SystemRoot', { SystemRoot: 'C:\\Windows' }), 'C:\\Windows');
    assert.equal(winDir('ProgramFiles', { ProgramFiles: 'D:\\Program Files', SystemDrive: 'D:' }), 'D:\\Program Files', 'hệ điều hành ở ổ D');
    assert.equal(winDir('SystemRoot', { SystemRoot: 'C:\\Users\\x\\evil' }), 'C:\\Windows', 'thư mục người dùng bị bỏ');
    assert.equal(winDir('SystemRoot', { SystemRoot: 'D:\\Windows' }), 'C:\\Windows', 'ổ khác SystemDrive bị bỏ');
    assert.equal(winDir('ProgramFiles', { ProgramFiles: 'C:\\Program Files\\..\\..\\evil' }), 'C:\\Program Files');
    assert.equal(winDir('ProgramFiles', {}), 'C:\\Program Files');
    assert.equal(managedPath('win32', { ProgramFiles: 'E:\\evil' }).replace(/\\/g, '/'), 'C:/Program Files/ClaudeCode/managed-settings.json');
  });

  test('findMarketplace: lấy kho từ installed_plugins.json; gói đồng bộ và nạp tạm không tính; không có thì null', () => {
    const home = temp();
    assert.equal(findMarketplace(home), null);
    const plugins = join(home, '.claude/plugins');
    mkdirSync(plugins, { recursive: true });
    writeFileSync(join(plugins, 'installed_plugins.json'), JSON.stringify({ plugins: { 'nlh@synced': [], 'nlh@inline': [], 'other@x': [] } }));
    assert.equal(findMarketplace(home), null);
    writeFileSync(join(plugins, 'installed_plugins.json'), JSON.stringify({ plugins: { 'nlh@synced': [], 'nlh@mat-hang': [] } }));
    assert.equal(findMarketplace(home), 'mat-hang');
  });

  test('findMarketplace: không có installed_plugins.json thì nhìn thư mục cache của kho nlh-governance', () => {
    const home = temp();
    mkdirSync(join(home, '.claude/plugins/cache', MARKET, 'nlh'), { recursive: true });
    assert.equal(findMarketplace(home), MARKET);
  });
});

describe('gộp vào chính sách có sẵn', () => {
  // Chấm PR #93: allowedChannelPlugins thay danh sách mặc định của Anthropic, nên máy chưa có danh sách thì giữ bốn kênh chính thức.
  test('chính sách trống: đúng hai khoá; danh sách gồm bốn kênh chính thức rồi tới gói nlh', () => {
    const { settings, changed } = merge({}, MARKET);
    assert.equal(changed, true);
    assert.deepEqual(Object.keys(settings).sort(), ['allowedChannelPlugins', 'channelsEnabled']);
    assert.equal(settings.channelsEnabled, true);
    assert.deepEqual(settings.allowedChannelPlugins, [...OFFICIAL, ENTRY]);
    assert.deepEqual(OFFICIAL.map((entry) => entry.plugin), ['telegram', 'discord', 'imessage', 'fakechat']);
    assert.ok(OFFICIAL.every((entry) => entry.marketplace === 'claude-plugins-official'));
  });

  test('đã có danh sách của người quản trị: chỉ thêm gói nlh, không thêm kênh chính thức', () => {
    const list = [{ marketplace: 'cua-ai-do', plugin: 'khac' }];
    const { settings } = merge({ allowedChannelPlugins: list }, MARKET);
    assert.deepEqual(settings.allowedChannelPlugins, [...list, ENTRY]);
    assert.deepEqual(merge({ allowedChannelPlugins: [] }, MARKET).settings.allowedChannelPlugins, [ENTRY], 'danh sách rỗng của người quản trị cũng giữ nguyên ý');
  });

  test('tên kho đi vào lệnh admin phải là chữ, số, chấm, gạch: tên lạ thì từ chối, không ghi', () => {
    for (const bad of ["a'; calc; '", 'a b', 'a"b', '', 'x'.repeat(65), null, undefined, 'a$(b)', 'a`b', 'a\nb', '..\\x']) {
      assert.equal(validMarketplace(bad), false, String(bad));
      assert.deepEqual(merge({}, bad), { refused: 'bad-marketplace' });
    }
    assert.equal(validMarketplace('nlh-governance'), true);
    assert.equal(validMarketplace('Acme_corp.v2'), true);
    const file = join(temp(), 'm.json');
    assert.equal(write(file, "a'; calc; '"), 'refused:bad-marketplace');
    assert.equal(existsSync(file), false);
    assert.equal(isAllowed(file, "a'; calc; '"), false);
    const home = temp();
    mkdirSync(join(home, '.claude/plugins'), { recursive: true });
    writeFileSync(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { "nlh@a'; calc; '": [] } }));
    assert.equal(findMarketplace(home), null, 'tên kho lạ trong installed_plugins.json không được nhận');
  });

  test('giữ khoá khác và dòng của gói khác; chạy lại không đổi gì', () => {
    const other = { marketplace: 'cua-ai-do', plugin: 'khac' };
    const first = merge({ forceLoginMethod: 'claudeai', allowedChannelPlugins: [other] }, MARKET);
    assert.deepEqual(first.settings, { forceLoginMethod: 'claudeai', channelsEnabled: true, allowedChannelPlugins: [other, ENTRY] });
    const again = merge(first.settings, MARKET);
    assert.equal(again.changed, false);
    assert.deepEqual(again.settings, first.settings);
  });

  test('người quản trị đã tắt kênh (channelsEnabled false) hoặc danh sách hỏng: không động vào', () => {
    assert.deepEqual(merge({ channelsEnabled: false }, MARKET), { refused: 'channels-off' });
    assert.deepEqual(merge({ allowedChannelPlugins: 'nlh' }, MARKET), { refused: 'bad-list' });
  });
});

describe('ghi file', () => {
  test('chưa có file hay thư mục: tạo mới, đúng hai khoá, không để file tạm', () => {
    const file = join(temp(), 'ClaudeCode', 'managed-settings.json');
    assert.equal(isAllowed(file, MARKET), false);
    assert.equal(write(file, MARKET), 'ok');
    assert.deepEqual(json(file), { channelsEnabled: true, allowedChannelPlugins: [...OFFICIAL, ENTRY] });
    assert.equal(isAllowed(file, MARKET), true);
    assert.deepEqual(readdirSync(join(file, '..')), ['managed-settings.json']);
  });

  test('file có sẵn (có BOM, khoá khác): giữ nguyên khoá khác; file hỏng thì không đè', () => {
    const dir = temp();
    const file = join(dir, 'managed-settings.json');
    writeFileSync(file, `\uFEFF${JSON.stringify({ env: { A: '1' } })}`);
    assert.equal(write(file, MARKET), 'ok');
    assert.deepEqual(json(file), { env: { A: '1' }, channelsEnabled: true, allowedChannelPlugins: [...OFFICIAL, ENTRY] });
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ khong phai json');
    assert.equal(write(broken, MARKET), 'refused:bad-file');
    assert.equal(readFileSync(broken, 'utf8'), '{ khong phai json');
  });

  test('chưa có gói nlh cài từ kho nào: isAllowed là false, không ghi', () => {
    const file = join(temp(), 'm.json');
    assert.equal(isAllowed(file, null), false);
  });
});

describe('ensure: một lượt cài', () => {
  const run = (options) => {
    const said = [];
    const result = ensure({ platform: 'win32', say: (text) => said.push(text), ...options });
    return { ...result, said };
  };

  test('đã đủ: không hỏi gì, không bật hộp xin quyền', () => {
    const file = join(temp(), 'm.json');
    write(file, MARKET);
    let asked = false;
    const result = run({ file, marketplace: MARKET, elevateFn: () => (asked = true) });
    assert.equal(result.code, 'ok');
    assert.equal(asked, false);
    assert.deepEqual(result.said, []);
    assert.equal(result.text, '', 'đã đủ từ trước thì không in gì mỗi lần mở Loa');
  });

  test('lệnh admin: Windows chỉ là một lệnh PowerShell ghi nội dung đã kiểm vào đúng đường dẫn; macOS một dòng sh, không chạy node của người dùng', () => {
    const file = 'C:\\Program Files\\ClaudeCode\\managed-settings.json';
    const text = `${JSON.stringify({ channelsEnabled: true, allowedChannelPlugins: [ENTRY] }, null, 2)}\n`;
    const win = adminScript('win32', file, text);
    assert.match(win, /^\$ErrorActionPreference = 'Stop'; \$file = 'C:\\Program Files\\ClaudeCode\\managed-settings\.json';/);
    assert.doesNotMatch(win, /node|\.mjs|\.tinh-nlh|USERPROFILE/i);
    const mac = adminScript('darwin', '/Library/Application Support/ClaudeCode/managed-settings.json', text);
    assert.match(mac, /^\/bin\/mkdir -p '\/Library\/Application Support\/ClaudeCode' && \/usr\/bin\/printf %s '[A-Za-z0-9+\/=]+' \| \/usr\/bin\/base64 -D > '\/Library\/Application Support\/ClaudeCode\/managed-settings\.json\.tmp' && \/bin\/mv -f /);
    assert.doesNotMatch(mac, /node|\.mjs|\.tinh-nlh/i);
  });

  test('lệnh admin Windows chạy thật (không nâng quyền) vào thư mục có dấu cách và chữ có dấu: file đúng từng byte, không BOM, không file tạm', { skip: process.platform === 'win32' ? false : 'chỉ Windows' }, () => {
    const dir = join(temp(), 'Thùy ỉ', 'Program Files');
    const file = join(dir, 'managed-settings.json');
    const planned = plan(file, MARKET);
    const encoded = Buffer.from(adminScript('win32', file, planned.text), 'utf16le').toString('base64');
    const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const out = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8', cwd: tmpdir() });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    const raw = readFileSync(file);
    assert.notEqual(raw[0], 0xef, 'không BOM');
    assert.equal(raw.toString('utf8'), planned.text);
    assert.deepEqual(readdirSync(dir), ['managed-settings.json']);
    assert.equal(isAllowed(file, MARKET), true);
  });

  test('cần quyền: tiến trình admin nhận đúng nội dung đã gộp (giữ khoá khác), không nhận tên kho hay đường dẫn lẻ', () => {
    const file = join(temp(), 'm.json');
    writeFileSync(file, JSON.stringify({ forceLoginMethod: 'claudeai' }));
    let received;
    const result = ensure({ platform: 'win32', file, marketplace: MARKET, writeFn: () => 'denied', elevateFn: (...args) => (received = args) });
    assert.equal(result.code, 'declined');
    assert.equal(received.length, 3);
    assert.deepEqual(JSON.parse(received[2]), { forceLoginMethod: 'claudeai', channelsEnabled: true, allowedChannelPlugins: [...OFFICIAL, ENTRY] });
  });

  test('ghi được ngay (người dùng có quyền): không hỏi', () => {
    const file = join(temp(), 'm.json');
    const result = run({ file, marketplace: MARKET, elevateFn: () => assert.fail('không được xin quyền') });
    assert.equal(result.code, 'ok');
    assert.equal(isAllowed(file, MARKET), true);
  });

  test('cần quyền: nói đúng câu trước hộp, bấm Có thì ghi xong; ghi lại vào policy-status.json', () => {
    const file = join(temp(), 'm.json');
    const statusFile = join(temp(), 'policy-status.json');
    const result = run({ file, marketplace: MARKET, statusFile, writeFn: () => 'denied', elevateFn: () => write(file, MARKET) });
    assert.deepEqual(result.said, ['Máy sẽ hỏi quyền một lần để Nếp tự báo việc mới. Bấm Có.']);
    assert.equal(result.code, 'ok');
    assert.equal(json(statusFile).status, 'ok');
    assert.equal(json(statusFile).detail, 'elevated');
  });

  test('bấm Không: không báo lỗi, chế độ 10 phút, ghi lại để không hỏi lần nữa', () => {
    const file = join(temp(), 'm.json');
    const statusFile = join(temp(), 'policy-status.json');
    const result = run({ file, marketplace: MARKET, statusFile, writeFn: () => 'denied', elevateFn: () => 9 });
    assert.equal(result.code, 'declined');
    assert.equal(result.text, 'Không sao. Nếp sẽ nhắc việc mới mỗi 10 phút.');
    assert.equal(existsSync(file), false);
    assert.match(readFileSync(statusFile, 'utf8'), /"status":"declined"/);
  });

  test('không có kho, hoặc người quản trị đã tắt kênh: không hỏi, chế độ 10 phút', () => {
    const file = join(temp(), 'm.json');
    const none = run({ file, marketplace: null, elevateFn: () => assert.fail('không được xin quyền') });
    assert.equal(none.code, 'unavailable');
    assert.deepEqual(none.said, []);
    writeFileSync(file, JSON.stringify({ channelsEnabled: false }));
    const off = run({ file, marketplace: MARKET, elevateFn: () => assert.fail('không được xin quyền') });
    assert.equal(off.code, 'unavailable');
    assert.deepEqual(json(file), { channelsEnabled: false });
  });

  test('câu trước hộp: Windows nhắc nút Có; macOS hỏi mật khẩu máy, không nhắc nút nào', () => {
    assert.equal(ask('win32'), 'Máy sẽ hỏi quyền một lần để Nếp tự báo việc mới. Bấm Có.');
    assert.equal(ask('darwin'), 'Máy sẽ hỏi mật khẩu máy một lần để Nếp tự báo việc mới.');
  });
});

describe('dòng lệnh', () => {
  const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  test('ensure --no-elevate vào file giả: ghi, in một dòng tiếng Việt, thoát 0; check đúng sai theo file', () => {
    const dir = temp();
    const file = join(dir, 'managed-settings.json');
    const status = join(dir, 'policy-status.json');
    assert.equal(cli('check', '--file', file, '--marketplace', MARKET).status, 1);
    const result = cli('ensure', '--file', file, '--marketplace', MARKET, '--status', status, '--no-elevate');
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'Nếp sẽ tự báo việc mới.');
    assert.equal(cli('check', '--file', file, '--marketplace', MARKET).status, 0);
    assert.equal(json(status).status, 'ok');
  });

  test('write (tiến trình được nâng quyền): thoát 3 khi file hỏng, không đè', () => {
    const file = join(temp(), 'm.json');
    writeFileSync(file, 'hong');
    assert.equal(cli('write', '--file', file, '--marketplace', MARKET).status, 3);
    assert.equal(readFileSync(file, 'utf8'), 'hong');
  });
});

describe('lối mở gọi policy.mjs', () => {
  test('start.ps1 và start.sh hỏi quyền một lần, không hỏi lại khi đã bấm Không, không chạy ở chế độ thử; setup chép policy.mjs', () => {
    for (const name of ['start.ps1', 'start.sh']) {
      const text = read(`speaker/${name}`);
      assert.match(text, /policy\.mjs/, name);
      assert.match(text, /policy-status\.json/, name);
      assert.match(text, /declined/, name);
    }
    assert.match(read('speaker/start.ps1'), /-not \$DryRun -and \(Test-Path -LiteralPath \$policy\) -and -not \$declined/);
    assert.match(read('speaker/start.sh'), /\[ -z "\$\{SPEAKER_DRY_RUN:-\}" \] && \[ -f "\$DIR\/policy\.mjs" \]/);
    assert.match(read('speaker/setup.ps1'), /'policy\.mjs'/);
    assert.match(read('speaker/setup.sh'), /policy\.mjs/);
  });
});
