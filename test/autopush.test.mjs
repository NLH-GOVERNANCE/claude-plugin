// Phép thử tự đẩy nhánh sau commit và báo lịch máy (việc eca924c5): hàm quyết định (đẩy hay không), lệnh đẩy không có cờ
// force, hook chạy thật trên repo git (lỗi mạng vẫn thoát 0), đọc lịch Claude desktop chỉ ra tên, giờ, bật/tắt.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { allowedRemote, commitDirs, decideAutoPush, isProtectedBranch, isSafePushArgs, pushArgs, redact, secretFindings } from '../plugins/tinh-nlh/hooks/autopush.mjs';
import { dataDirs, localSchedules, scheduleFiles, summarizeSchedules } from '../plugins/tinh-nlh/hooks/local-schedules.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const hook = join(root, 'plugins/tinh-nlh/hooks/autopush-hook.mjs');
const scheduleHook = join(root, 'plugins/tinh-nlh/hooks/local-schedules-hook.mjs');

// Chuỗi giống khoá, ghép từ mảnh để file này và PR không tự khớp mẫu bí mật.
const FAKE_GH = `gh${'p_'}${'a1'.repeat(15)}`;
const FAKE_AGE = `AGE-SECRET${'-'}KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ`;
const FAKE_PEM = `-----BEGIN RSA PRIVATE ${'KEY'}-----`;
const FAKE_SLACK = `xox${'b-'}1234567890-abcdefghij`;

const base = { env: {}, isCommit: true, branch: 'feat/x', remoteUrl: 'https://github.com/NLH-OS/api.git', names: ['a.mjs'], patch: '+const a = 1;\n' };
const decide = (extra = {}) => decideAutoPush({ ...base, ...extra });

describe('tự đẩy: hàm quyết định', () => {
  test('nhánh làm việc của repo trong danh sách trắng thì đẩy', () => {
    for (const branch of ['feat/x', 'fix/y', 'wt/plugin-push-safe', 'chore/z', 'plugin-push-safe']) assert.equal(decide({ branch }).push, true, branch);
    for (const url of ['https://github.com/NLH-OS/api.git', 'https://github.com/NLH-GOVERNANCE/claude-plugin', 'git@github.com:NLH-NEDU-CORE/web.git', 'https://x-access-token@github.com/nlh-os/api.git']) {
      assert.equal(decide({ remoteUrl: url }).push, true, url);
    }
  });

  test('dev, main, master, release/*, hotfix/*, nhánh rời hay tên lạ thì không đẩy', () => {
    for (const branch of ['dev', 'main', 'master', 'release/round-3', 'hotfix/x', 'Release/x', 'HEAD', '', null, undefined, '-x', '+feat/x', 'a b', 'feat/../dev']) {
      assert.equal(decide({ branch }).push, false, String(branch));
      assert.equal(isProtectedBranch(branch), true, String(branch));
    }
  });

  test('remote lạ thì không đẩy: tổ chức khác, host khác, đường local, url khác ở pushurl', () => {
    for (const remoteUrl of ['https://github.com/someone/else.git', 'https://github.com/NLH-OS-evil/api.git', 'https://gitlab.com/NLH-OS/api.git', 'https://evil.example/github.com/NLH-OS/api.git', 'C:/work/origin.git', '/tmp/origin.git', 'https://github.com/NLH-NEDU-OTHER/web.git', '', null]) {
      assert.equal(decide({ remoteUrl }).push, false, String(remoteUrl));
      assert.equal(allowedRemote(remoteUrl), null, String(remoteUrl));
    }
    assert.equal(decide({ pushUrl: 'https://github.com/someone/else.git' }).push, false);
  });

  test('file hay dòng giống bí mật thì không đẩy và báo một dòng, không lộ giá trị', () => {
    for (const name of ['.env', '.env.local', 'config/.env.production', 'cert.pem', 'id_rsa', 'api_key.json', 'github-token.txt', 'deploy.key', 'x/private.p12']) {
      const result = decide({ names: ['a.mjs', name] });
      assert.equal(result.push, false, name);
      assert.equal(result.reason, 'secret');
      assert.equal(result.notice.split('\n').length, 1);
      assert.match(result.notice, /did not auto-push feat\/x/);
    }
    for (const line of [FAKE_GH, FAKE_AGE, FAKE_PEM, FAKE_SLACK]) {
      const result = decide({ patch: `+++ b/a.mjs\n+const k = '${line}';\n` });
      assert.equal(result.push, false, line.slice(0, 8));
      assert.ok(!result.notice.includes(line), 'không in giá trị');
    }
    // Chỉ dòng thêm vào tính; dòng bị xoá hay ngữ cảnh thì không; mẫu .env.example thì qua.
    assert.equal(decide({ patch: `-const k = '${FAKE_GH}';\n  ${FAKE_GH}\n` }).push, true);
    assert.equal(decide({ names: ['.env.example', 'a.env.sample', 'README.md'] }).push, true);
    assert.deepEqual(secretFindings({ names: ['a.mjs'], patch: '+x\n' }), []);
  });

  test('NLH_AUTOPUSH=0 thì không đẩy; lệnh không phải git commit thì không đẩy', () => {
    assert.deepEqual(decide({ env: { NLH_AUTOPUSH: '0' } }), { push: false, reason: 'off' });
    assert.equal(decide({ env: { NLH_AUTOPUSH: '1' } }).push, true);
    assert.equal(decide({ isCommit: false }).push, false);
    const join = (from, to) => posix.resolve(from, to);
    assert.deepEqual(commitDirs('git status && git log -1', '/w', join), []);
    assert.deepEqual(commitDirs('git push -u origin HEAD', '/w', join), []);
    assert.deepEqual(commitDirs('npm test', '/w', join), []);
    assert.deepEqual(commitDirs('git commit -m "feat: a"', '/w', join), ['/w']);
    assert.deepEqual(commitDirs('cd sub && git add . && git commit -m x', '/w', join), ['/w/sub']);
    assert.deepEqual(commitDirs('git -C /other commit -am x; git -C /other commit --amend', '/w', join), ['/other']);
  });

  test('lệnh đẩy dựng ra không bao giờ có cờ force, +refspec hay đích khác; đã đẩy sai hình thì từ chối', () => {
    const args = pushArgs('/work/wt/x');
    assert.deepEqual(args, ['-C', '/work/wt/x', 'push', '-u', 'origin', 'HEAD']);
    assert.equal(isSafePushArgs(args), true);
    assert.doesNotMatch(args.join(' '), /force|(^| )-f( |$)|\+/);
    for (const bad of [
      [...args, '--force'],
      [...args, '--force-with-lease'],
      [...args, '-f'],
      ['-C', '/w', 'push', '-u', 'origin', '+HEAD'],
      ['-C', '/w', 'push', '--force', 'origin', 'HEAD'],
      ['-C', '/w', 'push', '-u', 'origin', 'HEAD:dev'],
      ['-C', '/w', 'push', '-u', 'upstream', 'HEAD'],
      ['push', '-u', 'origin', 'HEAD'],
    ]) assert.equal(isSafePushArgs(bad), false, bad.join(' '));
    // Hook, worker và đọc git không có chữ force ngoài dòng ghi chú.
    for (const file of ['autopush-hook.mjs', 'autopush-worker.mjs', 'autopush-git.mjs']) {
      const code = readFileSync(join(root, 'plugins/tinh-nlh/hooks', file), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
      assert.doesNotMatch(code, /force|--force|-f['"]/i, file);
    }
  });

  test('log không lộ khoá hay mật khẩu trong url', () => {
    assert.equal(redact('fatal: https://user:pw@github.com/x failed'), 'fatal: https://***@github.com/x failed');
    assert.ok(!redact(`remote: ${FAKE_GH}`).includes(FAKE_GH));
    assert.equal(redact('a\nb').includes('\n'), false);
  });
});

describe('tự đẩy: hook chạy thật trên repo git', () => {
  const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const run = (input, env) =>
    new Promise((done) => {
      const child = spawn(process.execPath, [hook], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...env } });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.on('exit', (code) => done({ code, out: out ? JSON.parse(out) : null }));
      child.stdin.end(JSON.stringify(input));
    });

  function makeRepo(url, branch = 'feat/auto') {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-autopush-'));
    const work = join(dir, 'work');
    mkdirSync(work);
    sh(work, 'init', '-b', 'dev');
    sh(work, 'config', 'user.email', 'build@nlh.vn');
    sh(work, 'config', 'user.name', 'build');
    writeFileSync(join(work, 'README.md'), 'x\n');
    sh(work, 'add', '.');
    sh(work, 'commit', '-m', 'init');
    sh(work, 'checkout', '-b', branch);
    sh(work, 'remote', 'add', 'origin', url);
    // Luật cổng giả không có luật nào: cổng cho qua, chỉ để thử đường đi của hook.
    const gateDir = join(dir, 'gate');
    mkdirSync(gateDir);
    writeFileSync(join(gateDir, 'rules.mjs'), 'export function checkPullRequest() { return []; }\n');
    const env = {
      NLH_AUTOPUSH_SYNC: '1',
      NLH_AUTOPUSH_DIR: join(dir, 'state'),
      NLH_GATE_DIR: gateDir,
      // Không có mạng: mọi lần đẩy thật hỏng ngay, không chạm GitHub.
      HTTPS_PROXY: 'http://127.0.0.1:9',
      https_proxy: 'http://127.0.0.1:9',
      GIT_TERMINAL_PROMPT: '0',
    };
    return { dir, work, env, log: join(dir, 'state', 'autopush.log') };
  }
  const commitInput = (work, command = 'git commit -m "feat: a"') => ({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'toolu_1', cwd: work, tool_input: { command } });
  const commit = (work, name = 'a.mjs', body = 'export {};\n') => {
    writeFileSync(join(work, name), body);
    sh(work, 'add', '.');
    sh(work, 'commit', '-m', `add ${name}`);
  };

  test('lỗi mạng: thoát 0, không in gì, một dòng lặng lẽ trong log, không lộ khoá', async () => {
    const { dir, work, env, log } = makeRepo('https://github.com/NLH-OS/demo.git');
    commit(work);
    const { code, out } = await run(commitInput(work), env);
    assert.equal(code, 0);
    assert.equal(out, null);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /NLH-OS\/demo feat\/auto push failed \(retry at next commit\)/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('commit có file bí mật: không đẩy, hook báo một dòng cho Claude; commit sạch sau đó vẫn không đẩy (commit bí mật còn chờ)', async () => {
    const { dir, work, env, log } = makeRepo('https://github.com/NLH-OS/demo.git');
    commit(work, '.env', 'A=1\n');
    let result = await run(commitInput(work), env);
    assert.equal(result.code, 0);
    const [note] = result.out.hookSpecificOutput.additionalContext.split('\n');
    assert.match(note, /^Nếp did not auto-push feat\/auto: .*file \.env/);
    assert.equal(existsSync(log), false);
    commit(work, 'b.mjs');
    result = await run(commitInput(work), env);
    assert.match(result.out.hookSpecificOutput.additionalContext, /file \.env/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('không đụng: nhánh dev, remote lạ, cờ tắt, lệnh không phải commit; hook không có dữ liệu thì thoát 0', async () => {
    const dev = makeRepo('https://github.com/NLH-OS/demo.git', 'dev-tmp');
    sh(dev.work, 'checkout', '-B', 'dev');
    commit(dev.work);
    const stranger = makeRepo('https://github.com/someone/else.git');
    commit(stranger.work);
    const off = makeRepo('https://github.com/NLH-OS/demo.git');
    commit(off.work);
    const other = makeRepo('https://github.com/NLH-OS/demo.git');
    commit(other.work);
    for (const [repo, input, extra] of [
      [dev, commitInput(dev.work), {}],
      [stranger, commitInput(stranger.work), {}],
      [off, commitInput(off.work), { NLH_AUTOPUSH: '0' }],
      [other, commitInput(other.work, 'git status; git log -1'), {}],
      [other, { ...commitInput(other.work), hook_event_name: 'PreToolUse' }, {}],
    ]) {
      const { code, out } = await run(input, { ...repo.env, ...extra });
      assert.equal(code, 0);
      assert.equal(out, null);
      assert.equal(existsSync(repo.log), false);
    }
    assert.equal((await run({}, other.env)).code, 0);
    for (const repo of [dev, stranger, off, other]) rmSync(repo.dir, { recursive: true, force: true });
  });
});

describe('lịch chạy trên máy: chỉ tên, giờ, bật/tắt', () => {
  const file = {
    scheduledTasks: [
      { id: 'nhip-lang', displayName: 'Nhịp làng (15 phút)', cronExpression: '*/15 8-23 * * *', enabled: true, filePath: 'C:\\Users\\X\\.claude\\scheduled-tasks\\nhip-lang\\SKILL.md', cwd: 'C:\\Users\\X\\work', prompt: 'ĐỌC KHOÁ NÀY', env: { SECRET: 'x' }, approvedPermissions: [{ toolName: 'mcp__x' }] },
      { id: 'mot-lan', displayName: 'Báo một lần', fireAt: Date.parse('2026-10-23T01:00:00Z'), enabled: false, notifySessionId: 'local_1' },
      { id: 'khong-gio', displayName: 'Thiếu giờ', enabled: true },
      { id: 'bat-mac-dinh', cronExpression: '0 9 * * *' },
    ],
    recordedSkips: { x: [] },
  };

  test('summarizeSchedules: ba trường, không prompt, không đường dẫn, không biến môi trường', () => {
    const list = summarizeSchedules(file);
    assert.deepEqual(list, [
      { name: 'Nhịp làng (15 phút)', when: '*/15 8-23 * * *', enabled: true },
      { name: 'Báo một lần', when: 'once 2026-10-23T01:00:00.000Z', enabled: false },
      { name: 'bat-mac-dinh', when: '0 9 * * *', enabled: true },
    ]);
    for (const item of list) assert.deepEqual(Object.keys(item).sort(), ['enabled', 'name', 'when']);
    const text = JSON.stringify(list);
    assert.doesNotMatch(text, /KHOÁ|SECRET|Users|SKILL|cwd|prompt|local_1|mcp__/);
    assert.deepEqual(summarizeSchedules(null), []);
    assert.deepEqual(summarizeSchedules({ scheduledTasks: 'x' }), []);
  });

  test('tên có ký tự lạ được làm sạch và cắt ngắn', () => {
    const [item] = summarizeSchedules({ scheduledTasks: [{ displayName: `a<b>"c\`d\n${'x'.repeat(300)}`, cronExpression: '* * * * *' }] });
    assert.doesNotMatch(item.name, /[<>"`\n]/);
    assert.ok(item.name.length <= 120);
  });

  test('đọc từ thư mục dữ liệu app: chỉ file scheduled-tasks.json dưới claude-code-sessions/<tài khoản>/<tổ chức>, bỏ trùng', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-sched-'));
    for (const org of ['acc1/org1', 'acc1/org2']) {
      mkdirSync(join(dir, 'claude-code-sessions', org), { recursive: true });
      writeFileSync(join(dir, 'claude-code-sessions', org, 'scheduled-tasks.json'), JSON.stringify(file));
    }
    mkdirSync(join(dir, 'claude-code-sessions', 'acc1', 'org3'), { recursive: true });
    writeFileSync(join(dir, 'claude-code-sessions', 'acc1', 'org3', 'scheduled-tasks.json'), '{hỏng');
    assert.equal(scheduleFiles([dir]).length, 3);
    const list = localSchedules({ NLH_CLAUDE_DATA_DIR: dir }, 'win32', '/home');
    assert.equal(list.length, 3);
    assert.deepEqual(localSchedules({ NLH_CLAUDE_DATA_DIR: join(dir, 'none') }, 'win32', '/home'), []);
    assert.deepEqual(dataDirs({}, 'linux', '/home'), []);
    assert.ok(dataDirs({}, 'darwin', '/Users/x')[0].replace(/\\/g, '/').endsWith('Library/Application Support/Claude'));
    rmSync(dir, { recursive: true, force: true });
  });

  test('hook đầu phiên in một dòng dặn gọi report_session kèm local_schedules; không có lịch thì không in gì', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-sched-'));
    const runHook = (env) =>
      new Promise((done) => {
        const child = spawn(process.execPath, [scheduleHook], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...env } });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('exit', (code) => done({ code, out }));
        child.stdin.end('{}');
      });
    assert.deepEqual(await runHook({ NLH_CLAUDE_DATA_DIR: dir }), { code: 0, out: '' });
    mkdirSync(join(dir, 'claude-code-sessions', 'a', 'o'), { recursive: true });
    writeFileSync(join(dir, 'claude-code-sessions', 'a', 'o', 'scheduled-tasks.json'), JSON.stringify(file));
    const { code, out } = await runHook({ NLH_CLAUDE_DATA_DIR: dir });
    assert.equal(code, 0);
    assert.equal(out.trim().split('\n').length, 1);
    assert.match(out, /report_session/);
    assert.match(out, /local_schedules/);
    assert.match(out, /Nhịp làng/);
    assert.doesNotMatch(out, /KHOÁ|SECRET|Users|SKILL|prompt":/);
    rmSync(dir, { recursive: true, force: true });
  });
});
