// hooks/self-update.mjs (28/10, 26f86f3d): the new version is fetched without a question, and the one click that starts it is said once.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decide, ensureAutoUpdate, ensureLoa, fetchInBackground, installedVersion, MARKETPLACE, newer, PLUGIN, restartSentence, TRY_GAP_MS } from '../plugins/tinh-nlh/hooks/self-update.mjs';

const hook = join(fileURLToPath(new URL('..', import.meta.url)), 'plugins/tinh-nlh/hooks/self-update.mjs');
const temp = (name) => mkdtempSync(join(tmpdir(), `${name}-`));

describe('self-update', () => {
  test('so phiên bản theo số, không theo chữ', () => {
    assert.equal(newer('0.25.6', '0.25.5'), true);
    assert.equal(newer('0.26.0', '0.25.9'), true);
    assert.equal(newer('0.25.10', '0.25.9'), true);
    assert.equal(newer('0.25.5', '0.25.5'), false);
    assert.equal(newer('0.25.4', '0.25.5'), false);
    assert.equal(newer(null, '0.25.5'), false);
  });

  test('bản đã tải: lấy bản cao nhất của gói nlh trong installed_plugins.json; không có tệp thì null', () => {
    const home = temp('su-home');
    assert.equal(installedVersion(home), null);
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { [PLUGIN]: [{ scope: 'user', version: '0.25.4' }, { scope: 'project', version: '0.25.6' }], 'other@x': [{ version: '9.9.9' }] } }));
    assert.equal(installedVersion(home), '0.25.6');
  });

  test('câu dặn bấm đúng chỗ: Windows chuột phải biểu tượng góc phải, chọn Thoát; không có chữ kỹ thuật', () => {
    const win = restartSentence('win32');
    assert.match(win, /chuột phải.*biểu tượng Claude.*góc phải dưới.*Thoát.*mở lại/);
    assert.match(restartSentence('darwin'), /Thoát Claude/);
    for (const platform of ['win32', 'darwin', 'linux']) assert.doesNotMatch(restartSentence(platform), /plugin|reload|\/|lệnh|terminal/i);
  });

  test('quyết định: bản mới đã tải thì dặn nói một câu, một lần cho mỗi bản; chưa có thì tải ngầm, tối đa một giờ một lần; không tìm thấy claude thì thôi', () => {
    const base = { running: '0.25.5', claude: 'C:\\c\\claude.exe', now: 10 * TRY_GAP_MS, platform: 'win32' };
    const ready = decide({ ...base, installed: '0.25.6', state: {} });
    assert.equal(ready.fetch, false);
    assert.match(ready.line, /Nếp có bản mới rồi\. Để dùng bản mới, bạn bấm chuột phải/);
    assert.equal(ready.state.told, '0.25.6');
    const again = decide({ ...base, installed: '0.25.6', state: ready.state }).line;
    assert.doesNotMatch(again, /After doing what the user asked/, 'đã nói rồi thì không nói lại câu dặn');
    assert.match(again, /^Nếp update: 0\.25\.6 is downloaded.*run no command.*Nếp có bản mới rồi/, 'nhưng dòng trạng thái luôn có');
    assert.match(ready.line, /Nếp update: 0\.25\.6 is downloaded/);
    assert.match(decide({ ...base, installed: '0.25.7', state: ready.state }).line, /0\.25\.7/, 'bản mới hơn nữa thì nói lại');

    const fetching = decide({ ...base, installed: '0.25.5', state: {} });
    assert.deepEqual([fetching.fetch, fetching.state.tried], [true, base.now]);
    assert.match(fetching.line, /^Nếp update: this session runs 0\.25\.5.*run no command.*Nếp đã là bản mới nhất\./);
    assert.equal(decide({ ...base, installed: '0.25.5', state: { tried: base.now - 1000 } }).fetch, false, 'chưa đủ một giờ');
    assert.equal(decide({ ...base, installed: '0.25.5', state: { tried: base.now - TRY_GAP_MS - 1 } }).fetch, true);
    assert.equal(decide({ ...base, claude: '', installed: '0.25.5', state: {} }).fetch, false);
    assert.equal(decide({ ...base, running: null, installed: '0.25.6', state: {} }).line, '');
    assert.match(decide({ ...base, installed: '0.25.5', claude: '', state: {} }).line, /^Nếp update: this session runs 0\.25\.5, the newest downloaded is 0\.25\.5/);
    assert.match(decide({ ...base, running: '0.25.9', installed: '0.25.4', state: {} }).line, /runs 0\.25\.9, the newest downloaded is 0\.25\.9/, 'bản đã tải cũ hơn bản đang chạy thì không nói bản cũ');
  });

  test('tải ngầm: một tiến trình tách rời chạy cập nhật kho rồi cập nhật gói, không chờ', () => {
    const calls = [];
    const child = { on: () => {}, unref: () => calls.push('unref') };
    assert.equal(fetchInBackground('C:\\c\\claude.exe', (command, args, options) => (calls.push([command, args.join(' '), options.detached, options.stdio, options.windowsHide]), child)), true);
    const [command, args, detached, stdio, hidden] = calls[0];
    assert.match(command, /cmd\.exe$|\/bin\/sh$/);
    assert.ok(args.includes(`plugin marketplace update ${MARKETPLACE}`) && args.includes(`plugin update ${PLUGIN}`));
    assert.deepEqual([detached, stdio, hidden, calls[1]], [true, 'ignore', true, 'unref']);
    assert.equal(fetchInBackground('x', () => { throw new Error('no'); }), false);
  });

  test('chạy thật: bản mới đã tải thì in một dòng một lần; hai lần chạy liền chỉ một dòng; không có claude thì im', () => {
    const home = temp('su-real');
    const plugin = join(home, 'plugin');
    mkdirSync(join(plugin, '.claude-plugin'), { recursive: true });
    writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'nlh', version: '0.25.5' }));
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { [PLUGIN]: [{ version: '0.25.6' }] } }));
    const dir = join(home, 'state');
    const run = () => spawnSync(process.execPath, [hook], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: plugin, NLH_MACHINE_DIR: dir, CLAUDE_CODE_EXECPATH: '' } });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Nếp có bản mới rồi/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'self-update.json'), 'utf8')).told, '0.25.6');
    assert.doesNotMatch(run().stdout, /Nếp có bản mới rồi\. Để dùng bản mới, bạn bấm chuột phải.*\(say it/s, 'lần hai không lặp câu dặn');
    assert.equal(existsSync(join(dir, 'self-update.json')), true);
  });

  test('bật tự cập nhật cho kho nlh-governance: chỉ đổi đúng một khoá, không đụng kho khác, tệp hỏng thì thôi', () => {
    const home = temp('su-auto');
    assert.equal(ensureAutoUpdate(home), false, 'chưa có tệp');
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
    const file = join(home, '.claude', 'plugins', 'known_marketplaces.json');
    writeFileSync(file, JSON.stringify({ other: { source: { repo: 'x/y' } }, [MARKETPLACE]: { source: { repo: 'a/b' }, lastUpdated: 't' } }));
    assert.equal(ensureAutoUpdate(home), true);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { other: { source: { repo: 'x/y' } }, [MARKETPLACE]: { source: { repo: 'a/b' }, lastUpdated: 't', autoUpdate: true } });
    assert.equal(ensureAutoUpdate(home), false, 'đã bật thì không ghi lại');
    writeFileSync(file, '{ not json');
    assert.equal(ensureAutoUpdate(home), false);
    assert.equal(readFileSync(file, 'utf8'), '{ not json');
  });

  test('Loa tự bật lại (Windows): chỉ khi máy đã cài Loa, không trong phiên của Loa; làm lại khoá khởi động một lần cho mỗi bản; máy khác Windows thì im', () => {
    const home = temp('su-loa');
    const calls = [];
    const spawnFn = (command, args, options) => (calls.push([command, args.join(' '), options.detached, options.windowsHide]), { on: () => {}, unref: () => calls.push('unref') });
    const base = { home, env: { SystemRoot: 'C:\\Windows' }, platform: 'win32', running: '0.25.9', state: {}, spawnFn };
    assert.equal(ensureLoa(base).started, false, 'chưa cài Loa');
    const speaker = join(home, '.tinh-nlh', 'speaker');
    mkdirSync(speaker, { recursive: true });
    for (const name of ['tower-key.dpapi', 'loa.vbs', 'start.ps1']) writeFileSync(join(speaker, name), 'x');
    const first = ensureLoa(base);
    assert.equal(first.started, true);
    assert.equal(first.state.loginFor, '0.25.9');
    assert.match(calls[0][1], /start\.ps1.* -RegisterOnly & .*wscript\.exe.*loa\.vbs.* login/);
    assert.deepEqual([calls[0][2], calls[0][3]], [true, true]);
    calls.length = 0;
    const second = ensureLoa({ ...base, state: first.state });
    assert.equal(second.started, true);
    assert.doesNotMatch(calls[0][1], /RegisterOnly/);
    assert.match(calls[0][1], /loa\.vbs.* login/);
    assert.equal(ensureLoa({ ...base, platform: 'darwin' }).started, false);
    assert.equal(ensureLoa({ ...base, env: { NLH_TOWER: '1' } }).started, false, 'không tự gọi trong phiên của Loa');
    assert.equal(ensureLoa({ ...base, spawnFn: () => { throw new Error('no'); } }).started, false);
  });
});
