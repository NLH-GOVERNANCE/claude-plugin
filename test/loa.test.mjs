// Phép thử Loa Làng tự chạy cùng plugin (việc 0f936d79, 23/10): bỏ script cài, một cách chạy cho Windows và macOS.
// Hàm thuần của speaker/loa.mjs (đường claude, có khoá chưa, có Loa chưa, mở gì, khi nào khởi động lại), dòng lệnh mở
// phiên nền, monitor watch.mjs, chế độ monitor của server speaker, và hook bật cập nhật tự động. Không mở Claude thật,
// không gọi mạng: claude, hub và hệ điều hành là đồ giả đưa vào.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  claudeCandidates,
  childEnv as loaChildEnv,
  ensureLoa,
  findClaude,
  hasKey,
  installedPlugin,
  isLoaSession,
  launchLoa,
  LOA_NAME,
  LOA_PROMPT,
  LOA_TOOLS,
  loaArgs,
  loaRunning,
  newer,
  OUTBOX_FILE as LOA_OUTBOX,
  pidAlive,
  relaunch,
  restartDue,
  SAYS,
  say,
  startRelaunch,
  takeLaunchLock,
  TOWER_ENV as LOA_TOWER_ENV,
  KEY_FILE as LOA_KEY_FILE,
  KEYCHAIN as LOA_KEYCHAIN,
} from '../plugins/tinh-nlh/speaker/loa.mjs';
import { OUTBOX_FILE, KEY_FILE, KEYCHAIN, TOWER_ENV, startServer } from '../plugins/tinh-nlh/speaker/speaker.mjs';
import { printable, readLines, watch } from '../plugins/tinh-nlh/speaker/watch.mjs';
import { enableAutoUpdate, withAutoUpdate } from '../plugins/tinh-nlh/hooks/auto-update.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const plugin = join(root, 'plugins/tinh-nlh');
const KEY = `nlh_tower_${'ef'.repeat(32)}`;
const TICKET = '0f936d79-7627-46fd-bda5-1ba2152eba06';
const temps = [];
const temp = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const until = async (check, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('chờ quá lâu');
};

describe('hàm thuần của loa.mjs', () => {
  test('tên và hằng số dùng chung với speaker.mjs không lệch nhau', () => {
    assert.equal(LOA_NAME, 'Loa Làng');
    assert.equal(LOA_OUTBOX, OUTBOX_FILE);
    assert.equal(LOA_KEY_FILE, KEY_FILE);
    assert.deepEqual(LOA_KEYCHAIN, KEYCHAIN);
    assert.deepEqual(LOA_TOWER_ENV, TOWER_ENV);
    const env = { NLH_TOWER: '1', NLH_LOA: 'monitor', NLH_TOWER_DIR: 'd', NLH_TOWER_WORK: 'w', TOWER_KEY: KEY, TOWER_KEY_FILE: 'f', PATH: 'p' };
    assert.deepEqual(loaChildEnv(env), { PATH: 'p' }, 'khoá Loa không vào môi trường phiên con');
    assert.ok(isLoaSession({ name: 'Loa Làng' }) && isLoaSession({ name: 'Loa tỉnh NhiLe ' }));
    assert.ok(!isLoaSession({ name: 'Ô CTO (son/cto)' }) && !isLoaSession(null));
  });

  test('đường claude: CLAUDE_BIN, claude của chính app Claude, chỗ trình cài chính thức; có thật mới nhận; không có thì tên trên PATH', () => {
    const home = join('/nhà', 'Thùy ỉ');
    const env = { CLAUDE_BIN: 'C:/cu/claude.exe', CLAUDE_CODE_EXECPATH: 'C:/app/2.1.308/claude.exe' };
    assert.deepEqual(claudeCandidates({ env, platform: 'win32', home }), ['C:/cu/claude.exe', 'C:/app/2.1.308/claude.exe', join(home, '.local', 'bin', 'claude.exe')]);
    assert.deepEqual(claudeCandidates({ env: {}, platform: 'darwin', home }), [join(home, '.local', 'bin', 'claude')]);
    // Đường Loa được dặn đã cũ (app đã cập nhật, thư mục bản cũ mất): bỏ qua, lấy cái có thật kế tiếp.
    assert.equal(findClaude({ env, platform: 'win32', home }, (path) => path === 'C:/app/2.1.308/claude.exe'), 'C:/app/2.1.308/claude.exe');
    assert.equal(findClaude({ env: {}, platform: 'linux', home }, () => false), 'claude');
  });

  test('có khoá chưa, không mở khoá: cấu hình plugin đúng dạng; Windows có file DPAPI; macOS có mục Keychain; chữ ${user_config…} chưa điền thì không tính', () => {
    const none = { env: {}, dir: 'd', exists: () => false, run: () => { throw new Error('không có'); } };
    assert.equal(hasKey({ ...none, platform: 'win32' }), false);
    assert.equal(hasKey({ ...none, platform: 'linux' }), false);
    assert.equal(hasKey({ ...none, env: { TOWER_KEY: KEY }, platform: 'linux' }), true);
    for (const bad of ['${user_config.tower_key}', '', 'nlh_tower_ngan', `${KEY}x`]) assert.equal(hasKey({ ...none, env: { TOWER_KEY: bad }, platform: 'win32' }), false, bad);
    assert.equal(hasKey({ ...none, platform: 'win32', exists: (path) => path === join('d', KEY_FILE) }), true);
    const calls = [];
    assert.equal(hasKey({ ...none, platform: 'darwin', run: (...args) => calls.push(args) }), true);
    // Chỉ tra có mục hay không (không -w), nên không hiện hộp xin quyền Keychain.
    assert.deepEqual(calls[0].slice(0, 2), ['/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN.service, '-a', KEYCHAIN.account]]);
    assert.equal(hasKey({ ...none, platform: 'darwin' }), false);
  });

  test('Loa đang chạy: file khoá giữ pid còn sống (EPERM cũng là còn sống); không có file, pid chết hay chữ lạ thì không', () => {
    const dir = temp('loa-lock');
    assert.equal(loaRunning(dir), false);
    writeFileSync(join(dir, 'tower.lock'), '4242');
    assert.equal(loaRunning(dir, (pid) => pid === 4242), true);
    assert.equal(loaRunning(dir, () => false), false);
    writeFileSync(join(dir, 'tower.lock'), 'không phải pid');
    assert.equal(loaRunning(dir, () => true), false);
    assert.equal(pidAlive(1, () => { throw Object.assign(new Error('x'), { code: 'EPERM' }); }), true);
    assert.equal(pidAlive(1, () => { throw Object.assign(new Error('x'), { code: 'ESRCH' }); }), false);
    assert.equal(pidAlive(process.pid), true);
  });

  test('khoá mở: một phiên lấy được, phiên khác trong 3 phút thì không, quá 3 phút thì lấy lại', () => {
    const dir = join(temp('loa-launch'), 'chưa-có-thư-mục');
    assert.equal(takeLaunchLock(dir, 1_000_000), true);
    assert.equal(takeLaunchLock(dir, 1_000_000 + 60_000), false);
    assert.equal(takeLaunchLock(dir, 1_000_000 + 3 * 60_000 + 1), true);
    assert.equal(readFileSync(join(dir, 'loa-launch.lock'), 'utf8'), String(1_000_000 + 3 * 60_000 + 1));
  });

  test('lệnh mở phiên nền: lời dặn đứng đầu, --bg, tên Loa Làng, cài đặt mang NLH_TOWER=1 và NLH_LOA=monitor, --allowedTools đứng cuối (nó nuốt mọi đối số sau nó)', () => {
    const args = loaArgs({ dir: 'C:/h/.tinh-nlh/speaker', work: 'C:/h/TinhNhiLe', claude: 'C:/h/claude.exe' });
    assert.equal(args[0], LOA_PROMPT);
    // Monitor của plugin chỉ chạy khi mô hình gọi skill bằng công cụ Skill (gõ /nlh:speaker-loop thì không), nên lời dặn nói rõ.
    assert.match(LOA_PROMPT, /Run the skill nlh:speaker-loop now with the Skill tool/);
    assert.ok(args.includes('--bg'));
    assert.equal(args[args.indexOf('-n') + 1], 'Loa Làng');
    assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), {
      env: { NLH_TOWER: '1', NLH_LOA: 'monitor', NLH_TOWER_DIR: 'C:/h/.tinh-nlh/speaker', NLH_TOWER_WORK: 'C:/h/TinhNhiLe', CLAUDE_BIN: 'C:/h/claude.exe' },
    });
    assert.equal(args.at(-2), '--allowedTools');
    assert.deepEqual(args.at(-1).split(' '), LOA_TOOLS);
    // Không ai ngồi đó để bấm cho phép: chỉ những công cụ Loa cần, không có Bash hay ghi file.
    assert.deepEqual(LOA_TOOLS, ['SendMessage', 'Skill', 'mcp__plugin_nlh_speaker__forwarded', 'mcp__plugin_nlh_speaker__pending']);
    assert.ok(!JSON.stringify(args).includes(KEY));
    assert.ok(!args.some((arg) => /skip-permissions|bypassPermissions|dangerously/.test(arg)));
  });

  test('mở thật (spawn giả): chạy claude đã chọn ở thư mục làm việc, tách khỏi phiên này, không mang biến của Loa, tạo thư mục làm việc', () => {
    const home = temp('loa-home');
    const made = [];
    const seen = [];
    let unref = 0;
    const spawnImpl = (command, args, options) => {
      seen.push({ command, args, options });
      return { on: () => {}, unref: () => (unref += 1) };
    };
    const env = { PATH: 'p', NLH_TOWER: '1', NLH_LOA: 'monitor', TOWER_KEY: KEY, TOWER_KEY_FILE: 'f', CLAUDE_BIN: 'C:/app/claude.exe' };
    const out = launchLoa({ env, platform: 'win32', home, exists: (path) => path === 'C:/app/claude.exe', spawnImpl, mkdir: (path) => made.push(path) });
    assert.equal(out.claude, 'C:/app/claude.exe');
    assert.deepEqual(made, [join(home, 'TinhNhiLe')]);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].command, 'C:/app/claude.exe');
    assert.deepEqual(seen[0].args, loaArgs({ dir: join(home, '.tinh-nlh', 'speaker'), work: join(home, 'TinhNhiLe'), claude: 'C:/app/claude.exe' }));
    assert.ok(!JSON.stringify(seen[0].options.env).includes(KEY), 'khoá không vào môi trường của claude');
    assert.deepEqual(seen[0].options, { cwd: join(home, 'TinhNhiLe'), env: { PATH: 'p', CLAUDE_BIN: 'C:/app/claude.exe' }, detached: true, stdio: 'ignore', windowsHide: true });
    assert.equal(unref, 1);
  });

  test('quyết định lúc mở phiên: không mở trong phiên Loa; chưa có khoá, đã có Loa (khoá hay phiên tên Loa), đang mở dở, không liệt kê được phiên thì không mở; còn lại mở một lần', () => {
    const dir = temp('loa-ensure');
    const base = { env: { TOWER_KEY: KEY, NLH_TOWER_DIR: dir }, platform: 'linux', home: dir, exists: () => false, alive: () => false, list: () => [], launch: () => assert.fail('không được mở') };
    assert.equal(ensureLoa({ ...base, env: { ...base.env, NLH_TOWER: '1' } }), 'is-loa');
    assert.equal(ensureLoa({ ...base, env: { NLH_TOWER_DIR: dir } }), 'no-key');
    writeFileSync(join(dir, 'tower.lock'), '77');
    assert.equal(ensureLoa({ ...base, alive: (pid) => pid === 77 }), 'running');
    rmSync(join(dir, 'tower.lock'));
    // Khoá Loa chưa có (máy chủ của phiên Loa còn đang lên) nhưng phiên Loa đã chạy: không mở bản thứ hai, không giữ khoá mở.
    assert.equal(ensureLoa({ ...base, list: () => [{ pid: 9, name: 'Loa tỉnh NhiLe', kind: 'interactive' }], now: 1000 }), 'running');
    assert.ok(!existsSync(join(dir, 'loa-launch.lock')));
    assert.equal(ensureLoa({ ...base, list: () => null, now: 5000 }), 'no-claude');
    assert.ok(!existsSync(join(dir, 'loa-launch.lock')));
    const launched = [];
    assert.equal(ensureLoa({ ...base, now: 9000, list: () => [{ pid: 3, name: 'Ô CTO (son/cto)' }], launch: (options) => launched.push(options) }), 'launched');
    assert.equal(launched.length, 1);
    // Một phiên khác bắt đầu cùng lúc: khoá mở còn mới thì nó nhường.
    assert.equal(ensureLoa({ ...base, now: 9001 }), 'launching');
    assert.equal(launched.length, 1);
    // Sau khi dừng Loa cũ (khởi động lại): mở dù khoá mở còn mới và khoá Loa chưa nhả hẳn.
    assert.equal(ensureLoa({ ...base, force: true, alive: () => true, list: () => [{ pid: 9, name: 'Loa Làng' }], launch: (options) => launched.push(options), now: 9002 }), 'launched');
    assert.equal(launched.length, 2);
  });

  test('so bản: số tăng dần, thiếu thì coi là 0, chữ lạ thì không bao giờ là mới hơn', () => {
    assert.equal(newer('0.19.0', '0.18.2'), true);
    assert.equal(newer('0.18.10', '0.18.9'), true);
    assert.equal(newer('1.0', '0.99.9'), true);
    assert.equal(newer('0.19.0', '0.19.0'), false);
    assert.equal(newer('0.18.2', '0.19.0'), false);
    assert.equal(newer('0.19', '0.19.0'), false);
    for (const bad of [null, undefined, '', 'abc', '0.19.x']) {
      assert.equal(newer(bad, '0.1.0'), false, String(bad));
      assert.equal(newer('9.9.9', bad), false, String(bad));
    }
  });

  test('bản plugin trên đĩa: đọc installed_plugins.json (dạng có "plugins" hay dạng phẳng), ưu tiên nlh@nlh-governance, bỏ nlh@synced; thiếu loa.mjs thì không tin', () => {
    const home = temp('loa-installed');
    const root1 = join(home, 'cache', 'nlh-governance', 'nlh', '0.19.0');
    mkdirSync(join(root1, '.claude-plugin'), { recursive: true });
    mkdirSync(join(root1, 'speaker'), { recursive: true });
    writeFileSync(join(root1, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'nlh', version: '0.19.0' }));
    writeFileSync(join(root1, 'speaker', 'loa.mjs'), '');
    const file = join(home, 'plugins', 'installed_plugins.json');
    mkdirSync(join(home, 'plugins'), { recursive: true });
    const env = { CLAUDE_CONFIG_DIR: home };
    const entry = { scope: 'user', installPath: root1, version: '0.19.0' };
    writeFileSync(file, JSON.stringify({ version: 2, plugins: { 'nlh@synced': [{ scope: 'user', installPath: 'khác' }], 'nlh@nlh-governance': [{ scope: 'project', installPath: 'khác' }, entry] } }));
    assert.deepEqual(installedPlugin({ env }), { version: '0.19.0', root: root1 });
    writeFileSync(file, JSON.stringify({ 'nlh@nlh-governance': [entry] }));
    assert.deepEqual(installedPlugin({ env }), { version: '0.19.0', root: root1 });
    rmSync(join(root1, 'speaker', 'loa.mjs'));
    assert.equal(installedPlugin({ env }), null, 'bản cũ chưa có loa.mjs không tự khởi động lại được');
    writeFileSync(file, 'không phải json');
    assert.equal(installedPlugin({ env }), null);
    assert.equal(installedPlugin({ env: { CLAUDE_CONFIG_DIR: join(home, 'khong-co') } }), null);
  });

  test('khi nào khởi động lại: bản trên đĩa mới hơn, không còn tin chờ gửi, và một phút không có dòng mới', () => {
    const installed = { version: '0.19.0', root: 'r' };
    assert.equal(restartDue({ running: '0.18.2', installed }), true);
    assert.equal(restartDue({ running: '0.18.2', installed, pending: 1 }), false, 'còn tin chờ SendMessage');
    assert.equal(restartDue({ running: '0.18.2', installed, sinceLastLine: 10_000 }), false, 'vừa có tin');
    assert.equal(restartDue({ running: '0.18.2', installed, sinceLastLine: 60_000 }), true);
    assert.equal(restartDue({ running: '0.19.0', installed }), false);
    assert.equal(restartDue({ running: '0.20.0', installed }), false);
    assert.equal(restartDue({ running: '0.18.2', installed: null }), false);
    // Bản chạy không biết số bản (bản sao của biểu tượng cũ): không tự khởi động lại.
    assert.equal(restartDue({ running: null, installed }), false);
  });

  test('khởi động lại: bản mới chạy loa.mjs của chính nó, tách rời, không mang biến của Loa', () => {
    const seen = [];
    let unref = 0;
    startRelaunch({ root: '/cache/nlh/0.19.0', env: { PATH: 'p', NLH_TOWER: '1', NLH_LOA: 'monitor', NLH_TOWER_DIR: 'd', NLH_TOWER_WORK: 'w', TOWER_KEY: KEY, TOWER_KEY_FILE: 'f' }, node: '/usr/bin/node', spawnImpl: (...call) => (seen.push(call), { on: () => {}, unref: () => (unref += 1) }) });
    // Mất NLH_TOWER thì ensureLoa mới mở được; chỗ ở và chỗ làm của Loa này thì giữ, để khoá và phiên mới ở đúng chỗ cũ.
    assert.deepEqual(seen, [['/usr/bin/node', [join('/cache/nlh/0.19.0', 'speaker', 'loa.mjs'), 'relaunch'], { env: { PATH: 'p', NLH_TOWER_DIR: 'd', NLH_TOWER_WORK: 'w' }, detached: true, stdio: 'ignore', windowsHide: true }]]);
    assert.equal(unref, 1);
  });

  test('relaunch: mở Loa mới trước, thấy phiên mới chạy rồi mới dừng đúng phiên nền Loa cũ (không đụng phiên khác hay phiên cửa sổ); mở không được thì để yên Loa cũ', async () => {
    const dir = temp('loa-relaunch');
    const env = { TOWER_KEY: KEY, NLH_TOWER_DIR: dir };
    const events = [];
    const old = [
      { pid: 1, id: 'aaaa1111', kind: 'background', name: 'Loa Làng' },
      { pid: 2, id: 'bbbb2222', kind: 'background', name: 'Ô CTO (son/cto)' },
      { pid: 3, id: 'cccc3333', kind: 'interactive', name: 'Loa tỉnh NhiLe' },
      { id: 'dddd4444', kind: 'background', name: 'Loa Làng', state: 'stopped' },
      { pid: 5, id: '../../x', kind: 'background', name: 'Loa Làng' },
    ];
    let opened = false;
    const common = {
      env,
      platform: 'linux',
      home: dir,
      exists: () => false,
      alive: () => true,
      stop: (_claude, id) => events.push(`stop:${id}`),
      wait: async () => {},
    };
    const done = await relaunch({
      ...common,
      list: () => (opened ? [...old, { pid: 9, id: 'eeee5555', kind: 'background', name: 'Loa Làng' }] : old),
      launch: () => {
        opened = true;
        events.push('launch');
      },
    });
    assert.equal(done, 'restarted');
    assert.deepEqual(events, ['launch', 'stop:aaaa1111'], 'mở trước, dừng sau, chỉ phiên nền Loa còn tiến trình và mã đúng dạng');

    // Phiên mới không bao giờ hiện trong danh sách: Loa cũ ở lại, không ai bị dừng.
    events.length = 0;
    rmSync(join(dir, 'loa-launch.lock'), { force: true });
    const stuck = await relaunch({ ...common, list: () => old, launch: () => events.push('launch'), waitMs: 1000 });
    assert.equal(stuck, 'new-not-started');
    assert.deepEqual(events, ['launch']);

    // Khởi động lại không cần khoá trong môi trường (nó không mang khoá); không chạy được claude thì không dừng gì.
    events.length = 0;
    assert.equal(await relaunch({ ...common, env: { NLH_TOWER_DIR: dir }, list: () => old, launch: () => events.push('launch'), waitMs: 500 }), 'new-not-started');
    events.length = 0;
    assert.equal(await relaunch({ ...common, list: () => null, launch: () => events.push('launch') }), 'no-claude');
    assert.deepEqual(events, []);
  });

  test('lời lệnh "bật Loa": mỗi kết quả đều có một câu lời thường, có tên Loa Làng, không lộ khoá, không ép gõ lệnh', () => {
    for (const code of ['launched', 'running', 'launching', 'is-loa', 'no-claude', 'no-key']) {
      assert.ok(SAYS[code], code);
      assert.match(SAYS[code], /Loa Làng/, code);
      assert.doesNotMatch(SAYS[code], /nlh_tower_|tỉnh NhiLe|powershell|setup\./i, code);
    }
    assert.equal(say('không-biết'), SAYS['no-claude']);
    assert.match(SAYS['no-key'], /Khoá cho Loa trên máy.*Tạo khoá mới.*Khoá cho Loa.*cài đặt plugin Nếp/);
  });
});

describe('monitor watch.mjs: từng dòng file của server thành một dòng LOA {json}', () => {
  test('chỉ đọc dòng đủ (có xuống dòng), nhớ chỗ đã đọc; file ngắn lại (Loa mới) thì đọc từ đầu', () => {
    const dir = temp('loa-watch');
    const file = join(dir, OUTBOX_FILE);
    assert.deepEqual(readLines(file, 0), { lines: [], offset: 0 }, 'chưa có file');
    writeFileSync(file, '{"a":1}\n{"b":');
    const first = readLines(file, 0);
    assert.deepEqual(first, { lines: ['{"a":1}'], offset: 8 });
    appendFileSync(file, '2}\r\n\n{"c":3}\n');
    const second = readLines(file, first.offset);
    assert.deepEqual(second.lines, ['{"b":2}', '{"c":3}']);
    assert.deepEqual(readLines(file, second.offset), { lines: [], offset: second.offset });
    writeFileSync(file, '{"d":4}\n');
    assert.deepEqual(readLines(file, second.offset).lines, ['{"d":4}']);
    assert.equal(printable('{"x":1}'), 'LOA {"x":1}');
    assert.ok(printable('x'.repeat(5000)).length < 4010);
  });

  test('chạy thật bằng node: in mỗi dòng mới đúng một lần, kể cả dòng có chữ có dấu; không in gì khi chưa có việc', async () => {
    const dir = temp('loa-watch-run');
    const file = join(dir, OUTBOX_FILE);
    writeFileSync(file, `${JSON.stringify({ action: 'send', text: 'Loa báo: ô cto có việc mới' })}\n`);
    const child = spawn(process.execPath, [join(plugin, 'speaker/watch.mjs')], { env: { ...process.env, NLH_TOWER_DIR: dir }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (out += chunk));
    try {
      await until(() => out.includes('\n'), 8000);
      assert.equal(out, `LOA ${JSON.stringify({ action: 'send', text: 'Loa báo: ô cto có việc mới' })}\n`);
      appendFileSync(file, `${JSON.stringify({ action: 'opened', text: 'Đã mở phiên mới' })}\n`);
      await until(() => out.split('\n').length >= 3, 8000);
      assert.deepEqual(out.trim().split('\n').map((line) => JSON.parse(line.slice(4)).action), ['send', 'opened']);
    } finally {
      child.kill();
    }
  });

  test('watch() trong tiến trình: hàm out nhận từng dòng', async () => {
    const dir = temp('loa-watch-fn');
    writeFileSync(join(dir, OUTBOX_FILE), '{"n":1}\n');
    const got = [];
    const timer = watch({ dir, out: (text) => got.push(text), everyMs: 20 });
    appendFileSync(join(dir, OUTBOX_FILE), '{"n":2}\n');
    await until(() => got.length === 2);
    clearInterval(timer);
    assert.deepEqual(got, ['LOA {"n":1}', 'LOA {"n":2}']);
  });
});

// Server trong tiến trình, chế độ monitor: luồng giả thay stdio, hub giả thay fetch.
function monitorServer({ feed = () => [], sessions = [], state, extra = {}, env = {}, begin = false } = {}) {
  const dir = temp('loa-monitor');
  if (state) writeFileSync(join(dir, 'tower-state.json'), JSON.stringify(state));
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  let buffer = '';
  output.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) messages.push(JSON.parse(line));
  });
  const rows = [];
  const fetchImpl = async (url, init = {}) => {
    if (url.includes('/tower/forwards')) {
      rows.push(JSON.parse(init.body));
      return Response.json({ recorded: true }, { status: 201 });
    }
    return Response.json({ entries: feed(), more: false });
  };
  const server = startServer({
    input,
    output,
    env: { NLH_TOWER: '1', NLH_LOA: 'monitor', TOWER_KEY: KEY, TOWER_ORIGIN: 'https://governance-dev.nlh.vn', NLH_TOWER_DIR: dir, NLH_MACHINE_DIR: dir, NLH_TOWER_WORK: dir, TOWER_CONFIRM_MS: '0', ...env },
    fetchImpl,
    keyStore: { read: () => null, forget: () => {} },
    run: () => JSON.stringify(sessions),
    spawnClaude: async () => true,
    cwdOf: () => null,
    log: () => {},
    onClose: () => {},
    ...extra,
  });
  const write = (message) => input.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  write({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  if (begin) write({ method: 'notifications/initialized' });
  const lines = () => (existsSync(join(dir, OUTBOX_FILE)) ? readFileSync(join(dir, OUTBOX_FILE), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
  const call = async (id, name, args) => {
    write({ id, method: 'tools/call', params: { name, arguments: args } });
    await until(() => messages.some((message) => message.id === id));
    return messages.find((message) => message.id === id);
  };
  return { server, messages, lines, rows, call, dir, close: () => input.end() };
}
const entry = (id, at, extra = {}) => ({ id, at, kind: 'your_cell', ticket_id: TICKET, cell: 'cto', title: 'Việc bí mật', ...extra });
const LIVE = '5e22aee8-b510-4a5b-b071-046ba1d93b23';

describe('server speaker ở chế độ monitor (NLH_LOA=monitor)', () => {
  test('không khai kênh (phiên nền không đăng ký được), vẫn có công cụ forwarded và pending; mỗi tin là một dòng JSON trong file, không phải thông báo kênh', async () => {
    const loa = monitorServer({
      feed: () => [entry('your_cell:t:1', '2026-10-23T02:00:00.000Z', { session_id: LIVE, session_name: 'Ô CTO (son/cto)' })],
      sessions: [{ pid: 7, kind: 'interactive', sessionId: LIVE, name: 'Ô CTO (son/cto) trên máy anh Sơn' }],
    });
    await loa.server.tick();
    const init = loa.messages.find((message) => message.id === 1).result;
    assert.deepEqual(init.capabilities, { tools: {} });
    assert.match(init.instructions, /Loa Làng/);
    assert.equal(loa.messages.filter((message) => message.method === 'notifications/claude/channel').length, 0);
    assert.deepEqual(loa.lines(), [
      {
        action: 'send',
        kind: 'your_cell',
        cell: 'cto',
        ticket: TICKET,
        entry_id: 'your_cell:t:1',
        to: 'Ô CTO (son/cto) trên máy anh Sơn',
        session_id: LIVE,
        text: `Loa báo: ô cto có việc mới, phiếu ${TICKET}. Mở phiếu, nhận việc nếu chưa ai nhận, rồi làm theo ô.`,
      },
    ]);
    assert.ok(!readFileSync(join(loa.dir, OUTBOX_FILE), 'utf8').includes('bí mật'), 'không có tiêu đề phiếu');
    assert.equal((await loa.call(2, 'forwarded', { entry_id: 'your_cell:t:1', ok: true })).result.content[0].text, 'Recorded.');
    assert.deepEqual(loa.rows.map((row) => [row.via, row.ok]), [['send', true]]);
    loa.close();
  });

  test('Loa mới bắt đầu file trống, và đưa lại lên đầu những tin gửi mà Loa trước chưa xác nhận', async () => {
    const stale = { entry_id: 'your_cell:t:9', kind: 'your_cell', ticket: TICKET, cell: 'cto', at: '2026-10-23T01:00:00.000Z', session_id: LIVE, to: 'Ô CTO (son/cto)', text: 'Loa báo: tin cũ chưa gửi', queued_at: Date.now() };
    const dir = temp('loa-old');
    writeFileSync(join(dir, OUTBOX_FILE), '{"cũ":"đã đọc rồi"}\n');
    writeFileSync(join(dir, 'tower-state.json'), JSON.stringify({ since: null, seen: [], pending: [stale], told: [], held: [] }));
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    startServer({
      input,
      output,
      env: { NLH_TOWER: '1', NLH_LOA: 'monitor', TOWER_KEY: KEY, NLH_TOWER_DIR: dir, NLH_MACHINE_DIR: dir, TOWER_ORIGIN: 'https://governance-dev.nlh.vn' },
      fetchImpl: async () => Response.json({ entries: [], more: false }),
      run: () => '[]',
      log: () => {},
      onClose: () => {},
    });
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    await until(() => existsSync(join(dir, OUTBOX_FILE)) && readFileSync(join(dir, OUTBOX_FILE), 'utf8').includes('tin cũ chưa gửi'));
    const lines = readFileSync(join(dir, OUTBOX_FILE), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((line) => [line.action, line.entry_id, line.text]), [['send', 'your_cell:t:9', 'Loa báo: tin cũ chưa gửi']]);
    input.end();
  });

  test('thông báo của chính server (thiếu khoá) cũng vào file, với lời cho chế độ nền: dán khoá vào cài đặt plugin, không "biểu tượng"', async () => {
    const loa = monitorServer({ env: { TOWER_KEY: '' } });
    await loa.server.tick();
    const [line] = loa.lines();
    assert.equal(line.kind, 'system');
    assert.match(line.text, /^Loa chưa có khoá\. Dán khoá vào ô "Khoá cho Loa" trong cài đặt plugin Nếp, rồi mở phiên mới\./);
    assert.doesNotMatch(line.text, /biểu tượng|cửa sổ/);
    loa.close();
  });

  test('bản plugin trên đĩa mới hơn: khởi động lại đúng một lần khi rảnh; không khởi động khi còn tin chờ gửi hay vừa có tin', async () => {
    let now = Date.parse('2026-10-23T03:00:00.000Z');
    const restarts = [];
    const found = { version: '0.19.0', root: '/cache/nlh/0.19.0' };
    const loa = monitorServer({
      feed: () => [entry('your_cell:t:5', '2026-10-23T02:59:00.000Z', { session_id: LIVE })],
      sessions: [{ pid: 7, kind: 'interactive', sessionId: LIVE, name: 'Ô CTO (son/cto)' }],
      extra: {
        clock: () => now,
        runningVersion: '0.18.2',
        loa: async () => ({ installedPlugin: () => found, restartDue, startRelaunch: (options) => restarts.push(options.root) }),
      },
    });
    await loa.server.tick();
    assert.deepEqual(restarts, [], 'vừa có tin và còn tin chờ SendMessage');
    await loa.call(2, 'forwarded', { entry_id: 'your_cell:t:5', ok: true });
    now += 61_000;
    await loa.server.tick();
    assert.deepEqual(restarts, ['/cache/nlh/0.19.0']);
    now += 61_000;
    await loa.server.tick();
    assert.equal(restarts.length, 1, 'không khởi động lại liên tục khi lần trước chưa thành');
    loa.close();
  });

  test('cùng bản: không khởi động lại; phiên của biểu tượng cũ (không NLH_LOA) không bao giờ tự khởi động lại', async () => {
    let now = Date.parse('2026-10-23T03:00:00.000Z');
    const restarts = [];
    const same = monitorServer({ extra: { clock: () => now, runningVersion: '0.19.0', loa: async () => ({ installedPlugin: () => ({ version: '0.19.0', root: 'r' }), restartDue, startRelaunch: () => restarts.push('x') }) } });
    await same.server.tick();
    now += 61_000;
    await same.server.tick();
    const old = monitorServer({ env: { NLH_LOA: '' }, extra: { clock: () => now, runningVersion: '0.1.0', loa: async () => ({ installedPlugin: () => ({ version: '9.0.0', root: 'r' }), restartDue, startRelaunch: () => restarts.push('y') }) } });
    await old.server.tick();
    now += 61_000;
    await old.server.tick();
    assert.deepEqual(restarts, []);
    assert.equal(old.messages.find((message) => message.id === 1).result.capabilities.experimental['claude/channel'] !== undefined, true, 'cửa sổ cũ vẫn khai kênh');
    same.close();
    old.close();
  });

  test('Loa mới gặp khoá của Loa cũ: im lặng chờ, không đọc hub; khoá nhả thì nhận việc (khởi động lại mở Loa mới trước khi dừng Loa cũ); cửa sổ cũ (không NLH_LOA) vẫn báo "một Loa khác đang chạy"', async () => {
    const dir = temp('loa-wait');
    // Một tiến trình khác còn sống giữ khoá: tiến trình cha của phép thử (cùng pid thì server coi là của chính nó).
    writeFileSync(join(dir, 'tower.lock'), String(process.ppid));
    const hub = [];
    const open = (extraEnv) => {
      const input = new PassThrough();
      const output = new PassThrough();
      const out = [];
      let buffer = '';
      output.on('data', (chunk) => {
        buffer += chunk;
        const parts = buffer.split('\n');
        buffer = parts.pop();
        for (const part of parts) if (part.trim()) out.push(JSON.parse(part));
      });
      startServer({
        input,
        output,
        env: { NLH_TOWER: '1', TOWER_KEY: KEY, NLH_TOWER_DIR: dir, NLH_MACHINE_DIR: dir, TOWER_ORIGIN: 'https://governance-dev.nlh.vn', TOWER_LOCK_RETRY_MS: '50', ...extraEnv },
        fetchImpl: async (url) => {
          hub.push(url);
          return Response.json({ entries: [], more: false });
        },
        keyStore: { read: () => null, forget: () => {} },
        run: () => '[]',
        log: () => {},
        onClose: () => {},
      });
      input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      return { out, close: () => input.end() };
    };
    const waiting = open({ NLH_LOA: 'monitor' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(hub.length, 0, 'chưa có khoá thì chưa đọc');
    assert.ok(!existsSync(join(dir, OUTBOX_FILE)), 'chờ trong im lặng, không ghi gì');
    // Loa cũ đi (pid không còn sống): Loa mới nhận khoá và đọc.
    writeFileSync(join(dir, 'tower.lock'), '999999999');
    await until(() => hub.length > 0, 4000);
    assert.equal(readFileSync(join(dir, 'tower.lock'), 'utf8'), String(process.pid));
    waiting.close();
    // Cửa sổ cũ: không chờ, báo một tin kênh như trước.
    writeFileSync(join(dir, 'tower.lock'), String(process.ppid));
    const legacy = open({ NLH_LOA: '' });
    await until(() => legacy.out.some((message) => message.method === 'notifications/claude/channel'));
    assert.match(legacy.out.find((message) => message.method === 'notifications/claude/channel').params.content, /Một Loa khác đang chạy trên máy này/);
    legacy.close();
  });

  test('phiên thường của plugin (không NLH_TOWER): một giây sau khi nối gọi ensure một lần, không đọc hub, không ghi file', async () => {
    const dir = temp('loa-other');
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    let ensured = 0;
    let fetched = 0;
    startServer({
      input,
      output,
      env: { TOWER_KEY: KEY, NLH_TOWER_DIR: dir },
      fetchImpl: async () => {
        fetched += 1;
        return Response.json({});
      },
      ensure: () => {
        ensured += 1;
        throw new Error('lỗi không được làm hỏng phiên');
      },
      log: () => {},
      onClose: () => {},
    });
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    assert.equal(ensured, 0, 'không chặn lúc bắt tay');
    await until(() => ensured === 1, 4000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ensured, 1);
    assert.equal(fetched, 0);
    assert.ok(!existsSync(join(dir, OUTBOX_FILE)));
    input.end();
  });
});

describe('hook auto-update.mjs: bật cập nhật tự động của Claude Code cho danh mục nlh-governance', () => {
  const source = { source: 'github', repo: 'NLH-GOVERNANCE/claude-plugin', ref: 'main' };

  test('withAutoUpdate: chỉ thêm khi chưa ai đặt; ý người dùng (đã tắt bằng nút ở /plugin) giữ nguyên; mọi khoá khác không đổi', () => {
    const settings = { permissions: { allow: ['Bash(ls)'] }, extraKnownMarketplaces: { 'nlh-governance': { source }, khac: { source: { source: 'github', repo: 'a/b' } } } };
    const next = withAutoUpdate(settings, null);
    assert.deepEqual(next.extraKnownMarketplaces['nlh-governance'], { source, autoUpdate: true });
    assert.deepEqual(next.extraKnownMarketplaces.khac, settings.extraKnownMarketplaces.khac);
    assert.deepEqual(next.permissions, settings.permissions);
    assert.equal(settings.extraKnownMarketplaces['nlh-governance'].autoUpdate, undefined, 'không sửa bản gốc');
    // Đã đặt (đúng hay sai) ở cài đặt, hay ở known_marketplaces.json: giữ.
    for (const value of [true, false]) assert.equal(withAutoUpdate({ extraKnownMarketplaces: { 'nlh-governance': { source, autoUpdate: value } } }, null), null);
    for (const value of [true, false]) assert.equal(withAutoUpdate(settings, { 'nlh-governance': { source, autoUpdate: value } }), null);
    // Danh mục đã tải về nhưng không khai trong cài đặt (thêm bằng app): khai với đúng nguồn đã tải.
    const declared = withAutoUpdate({ theme: 'dark' }, { 'nlh-governance': { source, installLocation: 'x' } });
    assert.deepEqual(declared, { theme: 'dark', extraKnownMarketplaces: { 'nlh-governance': { source, autoUpdate: true } } });
    // Không có danh mục này ở máy (plugin cài từ claude.ai) hay cài đặt lạ: không làm gì.
    assert.equal(withAutoUpdate({ theme: 'dark' }, {}), null);
    assert.equal(withAutoUpdate({ theme: 'dark' }, null), null);
    assert.equal(withAutoUpdate({ extraKnownMarketplaces: { 'nlh-governance': {} } }, null), null);
    assert.equal(withAutoUpdate({ extraKnownMarketplaces: [] }, { 'nlh-governance': { source } }), null);
    for (const bad of [null, [], 'x', 5]) assert.equal(withAutoUpdate(bad, { 'nlh-governance': { source } }), null);
  });

  function config(settingsText, known) {
    const dir = temp('loa-config');
    if (settingsText !== undefined) writeFileSync(join(dir, 'settings.json'), settingsText);
    if (known) {
      mkdirSync(join(dir, 'plugins'), { recursive: true });
      writeFileSync(join(dir, 'plugins', 'known_marketplaces.json'), JSON.stringify(known));
    }
    return dir;
  }

  test('enableAutoUpdate: sửa đúng một khoá, giữ thụt dòng và dòng cuối; chạy lại không đổi gì; không để lại file tạm', () => {
    const text = `${JSON.stringify({ model: 'opus', extraKnownMarketplaces: { 'nlh-governance': { source } }, hooks: {} }, null, 4)}\n`;
    const dir = config(text);
    assert.equal(enableAutoUpdate({ env: { CLAUDE_CONFIG_DIR: dir } }), 'enabled');
    const after = readFileSync(join(dir, 'settings.json'), 'utf8');
    assert.equal(after, `${JSON.stringify({ model: 'opus', extraKnownMarketplaces: { 'nlh-governance': { source, autoUpdate: true } }, hooks: {} }, null, 4)}\n`);
    assert.equal(enableAutoUpdate({ env: { CLAUDE_CONFIG_DIR: dir } }), 'nothing');
    assert.equal(readFileSync(join(dir, 'settings.json'), 'utf8'), after);
    assert.deepEqual(readdirSync(dir), ['settings.json']);
    // Không có dòng cuối thì không thêm.
    const noNewline = config(JSON.stringify({ extraKnownMarketplaces: { 'nlh-governance': { source } } }, null, 2));
    enableAutoUpdate({ env: { CLAUDE_CONFIG_DIR: noNewline } });
    assert.ok(!readFileSync(join(noNewline, 'settings.json'), 'utf8').endsWith('\n'));
  });

  test('enableAutoUpdate: không có file cài đặt thì không tạo; file hỏng thì không đụng; người đã tắt bằng nút (known_marketplaces.json) thì giữ', () => {
    const none = config(undefined);
    assert.equal(enableAutoUpdate({ env: { CLAUDE_CONFIG_DIR: none } }), 'no-settings');
    assert.ok(!existsSync(join(none, 'settings.json')));
    const broken = config('{ không phải json', { 'nlh-governance': { source } });
    assert.equal(enableAutoUpdate({ env: { CLAUDE_CONFIG_DIR: broken } }), 'nothing');
    assert.equal(readFileSync(join(broken, 'settings.json'), 'utf8'), '{ không phải json');
    const off = config(JSON.stringify({ extraKnownMarketplaces: { 'nlh-governance': { source } } }), { 'nlh-governance': { source, autoUpdate: false } });
    assert.equal(enableAutoUpdate({ env: { CLAUDE_CONFIG_DIR: off } }), 'nothing');
    assert.ok(!readFileSync(join(off, 'settings.json'), 'utf8').includes('autoUpdate'));
    // Danh mục có ở đĩa mà chưa khai trong cài đặt: khai với đúng nguồn.
    const disk = config(JSON.stringify({ theme: 'dark' }), { 'nlh-governance': { source, installLocation: 'x', lastUpdated: 'y' } });
    assert.equal(enableAutoUpdate({ env: { CLAUDE_CONFIG_DIR: disk } }), 'enabled');
    assert.deepEqual(JSON.parse(readFileSync(join(disk, 'settings.json'), 'utf8')), { theme: 'dark', extraKnownMarketplaces: { 'nlh-governance': { source, autoUpdate: true } } });
  });

  test('chạy thật như Claude Code chạy hook: node auto-update.mjs với JSON trên stdin; thoát 0, không in gì', () => {
    const dir = config(JSON.stringify({ extraKnownMarketplaces: { 'nlh-governance': { source } } }, null, 2));
    const run = spawnSync(process.execPath, [join(plugin, 'hooks/auto-update.mjs')], { input: JSON.stringify({ session_id: 'abc', hook_event_name: 'SessionStart' }), encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: dir } });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '');
    assert.equal(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).extraKnownMarketplaces['nlh-governance'].autoUpdate, true);
    // Thư mục cài đặt không có: vẫn thoát 0.
    const missing = spawnSync(process.execPath, [join(plugin, 'hooks/auto-update.mjs')], { input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'khong-co') } });
    assert.equal(missing.status, 0);
  });
});

describe('gói plugin: monitor, tên Loa Làng, README ba bước, không cần script', () => {
  const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const readme = readFileSync(join(root, 'README.md'), 'utf8').replace(/\r/g, '');

  test('monitors/monitors.json: một monitor loa chạy watch.mjs có thật, chỉ khi skill speaker-loop của plugin chạy; chỉ những khoá Claude Code nhận', () => {
    const monitors = readJson('plugins/tinh-nlh/monitors/monitors.json');
    assert.equal(monitors.length, 1);
    const [monitor] = monitors;
    assert.deepEqual(Object.keys(monitor).sort(), ['command', 'description', 'name', 'when']);
    assert.equal(monitor.name, 'loa');
    assert.equal(monitor.command, 'node "${CLAUDE_PLUGIN_ROOT}/speaker/watch.mjs"');
    assert.ok(existsSync(join(plugin, 'speaker/watch.mjs')));
    // Tên đủ dạng <plugin>:<skill>; viết riêng tên skill thì monitor không bao giờ khởi động (thử trên Claude Code 2.1.309).
    assert.equal(monitor.when, 'on-skill-invoke:nlh:speaker-loop');
    assert.ok(existsSync(join(plugin, 'skills/speaker-loop/SKILL.md')));
    assert.equal(readJson('plugins/tinh-nlh/.claude-plugin/plugin.json').name, 'nlh');
    assert.match(monitor.description, /Loa Làng/);
    // Không đọc cấu hình người dùng (monitor không nhận ${user_config}) và không gọi mạng.
    assert.doesNotMatch(readFileSync(join(plugin, 'speaker/watch.mjs'), 'utf8'), /fetch|https?:|node:(http|net|https|child_process)/);
  });

  test('tên người dùng thấy là Loa Làng: tên kênh, tên phiên, tin báo, skill, lệnh; "Loa tỉnh NhiLe" chỉ còn ở chỗ nói về biểu tượng cũ', () => {
    const manifest = readJson('plugins/tinh-nlh/.claude-plugin/plugin.json');
    assert.equal(manifest.channels[0].displayName, 'Loa Làng');
    for (const path of ['plugins/tinh-nlh/.claude-plugin/plugin.json', 'plugins/tinh-nlh/skills/speaker-loop/SKILL.md', 'plugins/tinh-nlh/monitors/monitors.json']) {
      assert.doesNotMatch(readFileSync(join(root, path), 'utf8'), /Loa tỉnh NhiLe/, path.replace(/^plugins\/tinh-nlh\//, ''));
    }
    const speaker = readFileSync(join(plugin, 'speaker/speaker.mjs'), 'utf8');
    assert.doesNotMatch(speaker, /Loa tỉnh NhiLe/);
    // Cửa sổ và tên phiên của cách cũ (start.ps1, start.sh) giữ tên cũ, để PR một việc không đụng quá 15 file (R03); đổi ở PR sau.
    for (const line of readme.split('\n').filter((item) => item.includes('Loa tỉnh NhiLe'))) assert.match(line, /cũ|trước|Cách cũ|biểu tượng|tác vụ|lối tắt/i, line.slice(0, 80));
  });

  test('README: cài đúng ba bước bấm, không bắt chạy script hay lệnh cho Loa; có nói Loa Làng tự chạy và tự khởi động lại, không nhắc mở lại Claude', () => {
    const install = readme.split('## Cài')[1].split('\n## ')[0];
    const steps = install.split('\n').filter((line) => /^\d\. /.test(line));
    assert.equal(steps.length, 3);
    assert.doesNotMatch(install, /setup\.ps1|setup\.sh|powershell|chmod/i);
    const loa = readme.split('### Loa Làng')[1].split('\n## ')[0];
    const loaSteps = loa.split('\n').filter((line) => /^\d\. /.test(line));
    assert.equal(loaSteps.length, 3);
    assert.doesNotMatch(loa.split('Máy đã bật Loa bằng biểu tượng')[0], /setup\.ps1|setup\.sh|powershell|biểu tượng Loa|bấm đúp/i);
    assert.match(loa, /tự khởi động lại khi rảnh/);
    assert.match(loa, /Không phải mở lại Claude, không có lời nhắc mở lại/);
    assert.doesNotMatch(readFileSync(join(plugin, 'skills/speaker-loop/SKILL.md'), 'utf8'), /mở lại Claude/);
  });

  test('plugin hợp lệ với Claude Code (claude plugin validate), nếu máy có claude', { skip: spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0 ? false : 'không có claude' }, () => {
    for (const target of [plugin, root]) {
      const run = spawnSync('claude', ['plugin', 'validate', target], { encoding: 'utf8' });
      assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
      assert.match(run.stdout, /Validation passed/);
    }
  });
});
