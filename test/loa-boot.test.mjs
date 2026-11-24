// hooks/loa-boot.mjs (29/10, 0f936d79): Loa starts with the plugin, no setup script, same on Windows and macOS.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bootLoa, FILES, installLoa, loaRunning, OPEN_GAP_MS } from '../plugins/tinh-nlh/hooks/loa-boot.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const hook = join(repo, 'plugins/tinh-nlh/hooks/loa-boot.mjs');
const temp = (name) => mkdtempSync(join(tmpdir(), `${name}-`));
// A plugin folder under any name: only the speaker files and the manifest matter.
const fakePlugin = (version = '0.26.0', name = 'nlh') => {
  const root = temp('lb-plugin');
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  mkdirSync(join(root, 'speaker'));
  writeFileSync(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version }));
  for (const file of new Set([...FILES.win32, ...FILES.darwin])) writeFileSync(join(root, 'speaker', file), `${file} ${version}`);
  return root;
};
const recorder = () => {
  const calls = [];
  const spawnFn = (file, args, options) => (calls.push({ file, args, options }), { on: () => {}, unref: () => {} });
  return { calls, spawnFn };
};

describe('loa-boot', () => {
  test('danh sách file của Loa khớp với những gì setup.ps1 và setup.sh vẫn chép', () => {
    const ps1 = readFileSync(join(repo, 'plugins/tinh-nlh/speaker/setup.ps1'), 'utf8');
    const sh = readFileSync(join(repo, 'plugins/tinh-nlh/speaker/setup.sh'), 'utf8');
    for (const name of FILES.win32) assert.ok(ps1.includes(`'${name}'`), `setup.ps1 chép ${name}`);
    for (const name of FILES.darwin) assert.ok(sh.includes(`/${name}"`), `setup.sh chép ${name}`);
    for (const name of [...FILES.win32, ...FILES.darwin]) assert.ok(existsSync(join(repo, 'plugins/tinh-nlh/speaker', name)), `${name} có trong gói`);
  });

  test('chép Loa từ chính gói (tên gói nào cũng được), ghi số bản; chạy lần hai không đổi gì; không lùi về bản cũ', () => {
    const dir = join(temp('lb-home'), 'speaker');
    assert.equal(installLoa({ root: fakePlugin('0.26.0', 'ten-moi'), dir, platform: 'win32', version: '0.26.0' }), true);
    for (const name of FILES.win32) assert.equal(readFileSync(join(dir, name), 'utf8'), `${name} 0.26.0`);
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), '0.26.0');
    assert.equal(existsSync(join(dir, 'start.sh')), false, 'Windows không chép start.sh');
    const before = statSync(join(dir, 'speaker.mjs')).mtimeMs;
    installLoa({ root: fakePlugin('0.26.0'), dir, platform: 'win32', version: '0.26.0' });
    assert.equal(statSync(join(dir, 'speaker.mjs')).mtimeMs, before);
    assert.equal(installLoa({ root: fakePlugin('0.25.0'), dir, platform: 'win32', version: '0.25.0' }), true);
    assert.equal(readFileSync(join(dir, 'speaker.mjs'), 'utf8'), 'speaker.mjs 0.26.0', 'gói cũ hơn không đè');
    assert.equal(installLoa({ root: fakePlugin('0.27.0'), dir, platform: 'win32', version: '0.27.0' }), true);
    assert.equal(readFileSync(join(dir, 'speaker.mjs'), 'utf8'), 'speaker.mjs 0.27.0');
    assert.equal(readFileSync(join(dir, 'version.txt'), 'utf8').trim(), '0.27.0');
  });

  test('thiếu file trong gói hay hệ điều hành lạ thì không chép, không báo lỗi', () => {
    const root = fakePlugin();
    const dir = join(temp('lb-home'), 'speaker');
    assert.equal(installLoa({ root, dir, platform: 'linux', version: '0.26.0' }), false);
    writeFileSync(join(root, 'speaker', 'broken'), '');
    assert.equal(installLoa({ root: temp('lb-empty'), dir, platform: 'win32', version: '0.26.0' }), false);
  });

  test('Windows: lần đầu làm lại khoá khởi động rồi mở Loa ẩn; chưa đủ 10 phút thì không mở lại; sau đó mở không làm lại khoá', () => {
    const home = temp('lb-home');
    const { calls, spawnFn } = recorder();
    const base = { root: fakePlugin(), version: '0.26.0', home, env: { SystemRoot: 'C:\\Windows' }, platform: 'win32', running: () => false, spawnFn };
    const first = bootLoa({ ...base, state: {}, now: 1_000_000 });
    assert.equal(first.started, true);
    assert.equal(calls[0].file, 'cmd.exe');
    assert.match(calls[0].args.join(' '), /start\.ps1" -RegisterOnly & .*wscript\.exe" ".*loa\.vbs" login/);
    assert.deepEqual([calls[0].options.detached, calls[0].options.windowsHide], [true, true]);
    assert.equal(first.state.loginFor, '0.26.0');
    assert.equal(existsSync(join(home, '.tinh-nlh', 'speaker', 'loa.vbs')), true, 'chạy không cần setup.ps1');

    const soon = bootLoa({ ...base, state: first.state, now: 1_000_000 + OPEN_GAP_MS - 1 });
    assert.equal(soon.started, false);
    assert.equal(calls.length, 1);
    const later = bootLoa({ ...base, state: first.state, now: 1_000_000 + OPEN_GAP_MS });
    assert.equal(later.started, true);
    assert.doesNotMatch(calls[1].args.join(' '), /RegisterOnly/);
    assert.match(calls[1].args.join(' '), /loa\.vbs" login/);
  });

  test('macOS: mở start.sh bằng Terminal, start.sh có quyền chạy', () => {
    const home = temp('lb-home');
    const { calls, spawnFn } = recorder();
    const result = bootLoa({ root: fakePlugin(), version: '0.26.0', home, env: {}, platform: 'darwin', state: {}, now: 5_000_000, running: () => false, spawnFn });
    assert.equal(result.started, true);
    assert.equal(calls[0].file, '/usr/bin/open');
    assert.deepEqual(calls[0].args.slice(0, 2), ['-a', 'Terminal']);
    assert.equal(calls[0].args[2], join(home, '.tinh-nlh', 'speaker', 'start.sh'));
    assert.ok(statSync(calls[0].args[2]).mode & 0o100, 'start.sh chạy được');
    assert.equal(result.state.loginFor, undefined);
  });

  test('không mở khi Loa đã chạy, trong phiên của chính Loa, hay trên hệ điều hành khác; spawn hỏng thì im', () => {
    const { calls, spawnFn } = recorder();
    const base = { root: fakePlugin(), version: '0.26.0', home: temp('lb-home'), env: {}, platform: 'win32', state: {}, now: 9_000_000, running: () => false, spawnFn };
    assert.equal(bootLoa({ ...base, running: () => true }).started, false);
    assert.equal(bootLoa({ ...base, env: { NLH_TOWER: '1' } }).started, false);
    assert.equal(bootLoa({ ...base, platform: 'linux' }).started, false);
    assert.equal(calls.length, 0);
    assert.equal(bootLoa({ ...base, spawnFn: () => { throw new Error('no'); } }).started, false);
  });

  test('Loa đang chạy = pid trong tower.lock còn sống', () => {
    const dir = temp('lb-lock');
    assert.equal(loaRunning(dir), false, 'không có tệp');
    writeFileSync(join(dir, 'tower.lock'), String(process.pid));
    assert.equal(loaRunning(dir), true);
    writeFileSync(join(dir, 'tower.lock'), '4000000');
    assert.equal(loaRunning(dir, () => { throw Object.assign(new Error('x'), { code: 'ESRCH' }); }), false);
    writeFileSync(join(dir, 'tower.lock'), 'rác');
    assert.equal(loaRunning(dir), false);
  });

  test('chạy hook thật: HOME tạm, trong phiên của Loa thì không chép gì, ngoài phiên thì chép và ghi trạng thái', () => {
    const root = fakePlugin();
    const home = temp('lb-run');
    const machine = join(home, '.tinh-nlh');
    // linux giả lập không được: chạy hook thật chỉ kiểm trong phiên Loa (không đụng máy thật) và đường im lặng.
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: root, NLH_MACHINE_DIR: machine, NLH_TOWER: '1' };
    const run = spawnSync(process.execPath, [hook], { env, encoding: 'utf8' });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
    assert.equal(existsSync(join(machine, 'speaker')), false);
  });

  test('hooks.json gọi loa-boot lúc mở phiên, và không còn bước nào bắt chạy setup.ps1', () => {
    const { hooks } = JSON.parse(readFileSync(join(repo, 'plugins/tinh-nlh/hooks/hooks.json'), 'utf8'));
    const commands = hooks.SessionStart.filter((group) => group.matcher === 'startup|clear').flatMap((group) => group.hooks.map((hook) => (hook.args ?? []).join(' ')));
    assert.ok(commands.some((line) => line.endsWith('hooks/loa-boot.mjs')));
  });
});
