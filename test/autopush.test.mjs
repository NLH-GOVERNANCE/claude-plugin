// Phép thử tự đẩy nhánh sau commit và báo lịch máy (việc eca924c5): hàm quyết định (đẩy hay không), url lách, quét bí mật
// trên đúng thứ sẽ đẩy (commit gộp, tệp nhị phân, dòng "+++"), ghim SHA lúc kiểm và lúc đẩy, lệnh đẩy không có cờ force,
// hook chạy thật trên repo git (lỗi mạng vẫn thoát 0), đọc lịch Claude desktop chỉ ra tên, giờ, bật/tắt.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addedLines, allowedRemote, commitDirs, decideAutoPush, gateCommand, isProtectedBranch, isSafePushArgs, pushArgs, redact, runAutoPush, secretFindings } from '../plugins/tinh-nlh/hooks/autopush.mjs';
import { lsRemote, pushFacts, repoFacts } from '../plugins/tinh-nlh/hooks/autopush-git.mjs';
import { dataDirs, localSchedules, scheduleFiles, summarizeSchedules } from '../plugins/tinh-nlh/hooks/local-schedules.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const hook = join(root, 'plugins/tinh-nlh/hooks/autopush-hook.mjs');
const scheduleHook = join(root, 'plugins/tinh-nlh/hooks/local-schedules-hook.mjs');

// Chuỗi giống khoá, ghép từ mảnh để file này và PR không tự khớp mẫu bí mật.
const FAKE_GH = `gh${'p_'}${'a1'.repeat(15)}`;
const FAKE_AGE = `AGE-SECRET${'-'}KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ`;
const FAKE_PEM = `-----BEGIN RSA PRIVATE ${'KEY'}-----`;
const FAKE_SLACK = `xox${'b-'}1234567890-abcdefghij`;

const URL_OK = 'https://github.com/NLH-OS/api.git';
const SHA = 'a'.repeat(40);
const base = { env: {}, isCommit: true, branch: 'feat/x', sha: SHA, remoteUrls: [URL_OK], pushUrls: [URL_OK], names: ['a.mjs'], patch: 'diff --git a/a.mjs b/a.mjs\n--- a/a.mjs\n+++ b/a.mjs\n@@ -0,0 +1 @@\n+const a = 1;\n' };
const decide = (extra = {}) => decideAutoPush({ ...base, ...extra });
const hunk = (...added) => `diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -0,0 +${added.length} @@\n${added.map((line) => `+${line}`).join('\n')}\n`;

describe('tự đẩy: hàm quyết định', () => {
  test('nhánh làm việc của repo trong danh sách trắng thì đẩy, đúng một url fetch và một url đẩy', () => {
    for (const branch of ['feat/x', 'fix/y', 'wt/plugin-push-safe', 'chore/z', 'plugin-push-safe']) assert.equal(decide({ branch }).push, true, branch);
    for (const url of [URL_OK, 'https://github.com/NLH-GOVERNANCE/claude-plugin', 'git@github.com:NLH-NEDU-CORE/web.git', 'https://github.com/nlh-os/api', 'https://github.com/NLH-OS/api/']) {
      const result = decide({ remoteUrls: [url], pushUrls: [url] });
      assert.equal(result.push, true, url);
      assert.equal(result.url, url);
    }
  });

  test('dev, main, master, release/*, hotfix/*, nhánh rời hay tên lạ, thiếu SHA thì không đẩy', () => {
    for (const branch of ['dev', 'main', 'master', 'release/round-3', 'hotfix/x', 'Release/x', 'HEAD', '', null, undefined, '-x', '+feat/x', 'a b', 'feat/../dev']) {
      assert.equal(decide({ branch }).push, false, String(branch));
      assert.equal(isProtectedBranch(branch), true, String(branch));
    }
    for (const sha of [undefined, '', 'HEAD', 'abc', `${'a'.repeat(40)}x`]) assert.equal(decide({ sha }).push, false, String(sha));
  });

  test('url lách thì không đẩy: userinfo, github.com@host, host giả, backslash, tiền tố org, cổng, query, ssh, http', () => {
    for (const url of [
      'https://github.com/someone/else.git',
      'https://user@github.com/NLH-OS/api.git',
      'https://x-access-token@github.com/NLH-OS/api.git',
      'https://user:pw@github.com/NLH-OS/api.git',
      'https://user@github.com.evil/NLH-OS/api.git',
      'https://github.com@evil.example/NLH-OS/api.git',
      'https://github.com.evil/NLH-OS/api.git',
      'https://evil.example/github.com/NLH-OS/api.git',
      'https://github.com\\@evil.example/NLH-OS/api.git',
      'https://github.com\\NLH-OS\\api.git',
      'https://github.com/NLH-OS-evil/api.git',
      'https://github.com/NLH-OS.evil/api.git',
      'https://github.com/NLH-OSX/api.git',
      'https://github.com/NLH-NEDU-OTHER/web.git',
      'https://github.com/NLH-OS/api.git?x=1',
      'https://github.com/NLH-OS/api.git#x',
      'https://github.com:443/NLH-OS/api.git',
      'https://github.com/NLH-OS/api/extra.git',
      'https://github.com/NLH-OS/..',
      'ssh://git@github.com/NLH-OS/api.git',
      'http://github.com/NLH-OS/api.git',
      'git@github.com.evil:NLH-OS/api.git',
      'git@evil.example:NLH-OS/api.git',
      'user@github.com:NLH-OS/api.git',
      'git@github.com:NLH-OS-evil/api.git',
      'git@github.com:NLH-OS/api/x.git',
      'https://github.com/NLH-OS/api.git extra',
      'https://gitlab.com/NLH-OS/api.git',
      'C:/work/origin.git',
      '/tmp/origin.git',
      '-https://github.com/NLH-OS/api.git',
      '',
      null,
    ]) {
      assert.equal(allowedRemote(url), null, String(url));
      assert.equal(decide({ remoteUrls: [url], pushUrls: [url] }).push, false, String(url));
    }
  });

  test('remote nhiều url: một url lạ thì không đẩy; hai url đều hợp lệ cũng không đẩy, báo một dòng; thiếu url thì không đẩy', () => {
    const stranger = 'https://github.com/someone/else.git';
    for (const [remoteUrls, pushUrls] of [
      [[URL_OK], [URL_OK, stranger]],
      [[URL_OK], [stranger, URL_OK]],
      [[URL_OK, stranger], [URL_OK]],
      [[stranger], [URL_OK]],
      [[], [URL_OK]],
      [[URL_OK], []],
    ]) {
      const result = decide({ remoteUrls, pushUrls });
      assert.equal(result.push, false);
      assert.equal(result.reason, 'remote-not-allowed');
      assert.equal(result.notice, undefined);
    }
    const two = decide({ pushUrls: [URL_OK, 'https://github.com/NLH-GOVERNANCE/other.git'] });
    assert.deepEqual([two.push, two.reason], [false, 'many-urls']);
    assert.equal(two.notice.split('\n').length, 1);
    assert.equal(decide({ remoteUrls: [URL_OK, URL_OK] }).reason, 'many-urls');
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
      const result = decide({ patch: hunk(`const k = '${line}';`) });
      assert.equal(result.push, false, line.slice(0, 8));
      assert.ok(!result.notice.includes(line), 'không in giá trị');
    }
    // Dòng bị xoá hay ngữ cảnh thì không tính; mẫu .env.example thì qua.
    assert.equal(decide({ patch: `diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,2 +1 @@\n-const k = '${FAKE_GH}';\n  ${FAKE_GH}\n` }).push, true);
    assert.equal(decide({ names: ['.env.example', 'a.env.sample', 'README.md'] }).push, true);
    assert.deepEqual(secretFindings({ names: ['a.mjs'], patch: hunk('x') }), []);
  });

  test('dòng thêm có nội dung "++ ...": đọc theo vị trí, không loại theo tiền tố "+++"', () => {
    const patch = `diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -0,0 +2 @@\n+++ ${FAKE_AGE}\n+++ b/g\n`;
    assert.deepEqual(addedLines(patch), [`++ ${FAKE_AGE}`, '++ b/g']);
    const result = decide({ patch });
    assert.equal(result.push, false);
    assert.equal(result.reason, 'secret');
    // Dòng tiêu đề thật (trước @@) không bị đếm là dòng thêm, nhiều khối thì mỗi khối một tiêu đề.
    assert.deepEqual(addedLines(`diff --git a/f b/f\n--- /dev/null\n+++ b/f\n@@ -0,0 +1 @@\n+a\ndiff --git a/g b/g\n--- a/g\n+++ b/g\n@@ -0,0 +1 @@\n+b\n`), ['a', 'b']);
  });

  test('patch đọc không hết thì không đẩy và báo một dòng', () => {
    const result = decide({ scanFailed: true });
    assert.deepEqual([result.push, result.reason], [false, 'unscannable']);
    assert.equal(result.notice.split('\n').length, 1);
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

  test('lệnh đẩy: SHA đã kiểm tới đúng một url đã kiểm, không HEAD, không cờ force, không +refspec; sai hình thì từ chối', () => {
    const args = pushArgs('/work/wt/x', URL_OK, SHA, 'feat/x');
    assert.deepEqual(args, ['-C', '/work/wt/x', 'push', URL_OK, `${SHA}:refs/heads/feat/x`]);
    assert.equal(isSafePushArgs(args), true);
    assert.doesNotMatch(args.join(' '), /force|(^| )-f( |$)|\+|HEAD/);
    assert.equal(gateCommand(SHA, 'feat/x'), `git push -u origin ${SHA}:refs/heads/feat/x`);
    for (const bad of [
      [...args, '--force'],
      [...args, '-f'],
      ['-C', '/w', 'push', URL_OK, `+${SHA}:refs/heads/feat/x`],
      ['-C', '/w', 'push', '--force', URL_OK, `${SHA}:refs/heads/feat/x`],
      ['-C', '/w', 'push', URL_OK, 'HEAD'],
      ['-C', '/w', 'push', URL_OK, `${SHA}:refs/heads/dev`],
      ['-C', '/w', 'push', URL_OK, `${SHA}:refs/heads/release/x`],
      ['-C', '/w', 'push', URL_OK, `${SHA}:feat/x`],
      ['-C', '/w', 'push', URL_OK, 'abc:refs/heads/feat/x'],
      ['-C', '/w', 'push', 'origin', `${SHA}:refs/heads/feat/x`],
      ['-C', '/w', 'push', 'https://github.com/someone/else.git', `${SHA}:refs/heads/feat/x`],
      ['push', URL_OK, `${SHA}:refs/heads/feat/x`],
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

describe('tự đẩy: đọc và quét repo git thật', () => {
  const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  function repo(url = URL_OK, branch = 'feat/auto') {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-scan-'));
    const work = join(dir, 'work');
    mkdirSync(work);
    sh(work, 'init', '-b', 'dev');
    sh(work, 'config', 'user.email', 'build@nlh.vn');
    sh(work, 'config', 'user.name', 'build');
    sh(work, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(work, 'README.md'), 'x\n');
    sh(work, 'add', '.');
    sh(work, 'commit', '-m', 'init');
    sh(work, 'checkout', '-b', branch);
    sh(work, 'remote', 'add', 'origin', url);
    return { dir, work };
  }
  const commit = (work, name, body) => {
    writeFileSync(join(work, name), body);
    sh(work, 'add', '.');
    sh(work, 'commit', '-m', `add ${name}`);
  };
  const facts = (work, max) => repoFacts(work, { maxPatch: max });
  const decideFor = (work, max) => decideAutoPush({ env: {}, ...facts(work, max) });

  test('repo sạch: đọc đủ SHA, nhánh, url; đẩy được', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    const f = facts(work);
    assert.equal(f.sha, sh(work, 'rev-parse', 'HEAD'));
    assert.equal(f.branch, 'feat/auto');
    assert.deepEqual(f.remoteUrls, [URL_OK]);
    assert.deepEqual(f.pushUrls, [URL_OK]);
    assert.equal(f.scanFailed, false);
    assert.equal(decideFor(work).push, true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('remote hai url đẩy (một lạ) hay insteadOf về host lạ: không đẩy', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    sh(work, 'remote', 'set-url', '--add', '--push', 'origin', URL_OK);
    sh(work, 'remote', 'set-url', '--add', '--push', 'origin', 'https://github.com/someone/else.git');
    assert.equal(facts(work).pushUrls.length, 2);
    assert.deepEqual([decideFor(work).push, decideFor(work).reason], [false, 'remote-not-allowed']);
    sh(work, 'remote', 'set-url', '--delete', '--push', 'origin', 'someone/else');
    sh(work, 'config', 'url.https://evil.example/.insteadOf', 'https://github.com/');
    assert.deepEqual(facts(work).remoteUrls, ['https://evil.example/NLH-OS/api.git']);
    assert.equal(decideFor(work).push, false);
    rmSync(dir, { recursive: true, force: true });
  });

  test('tệp .env mới (kể cả đã xoá ở commit sau) thì không đẩy: tên tệp của mọi commit chưa đẩy', () => {
    const { dir, work } = repo();
    commit(work, '.env', 'A=1\n');
    assert.match(decideFor(work).notice, /file \.env/);
    sh(work, 'rm', '-q', '.env');
    sh(work, 'commit', '-m', 'rm env');
    assert.match(decideFor(work).notice, /file \.env/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('commit gộp chứa khoá chỉ trong chính commit gộp: vẫn thấy', () => {
    const { dir, work } = repo();
    sh(work, 'checkout', '-q', '-b', 'feat/other', 'dev');
    commit(work, 'b.mjs', 'export const b = 1;\n');
    sh(work, 'checkout', '-q', 'feat/auto');
    commit(work, 'a.mjs', 'export const a = 1;\n');
    sh(work, 'merge', '--no-commit', '--no-ff', 'feat/other');
    writeFileSync(join(work, 'notes.txt'), `${FAKE_GH}\n`);
    sh(work, 'add', '.');
    sh(work, 'commit', '-q', '-m', 'merge');
    assert.equal(sh(work, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3);
    const f = facts(work);
    assert.ok(f.names.includes('notes.txt'));
    const result = decideAutoPush({ env: {}, ...f });
    assert.equal(result.push, false);
    assert.match(result.notice, /looks like a key/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('khoá trong tệp nhị phân (git coi là nhị phân): vẫn thấy', () => {
    const { dir, work } = repo();
    commit(work, 'blob.dat', Buffer.concat([Buffer.from([0, 1, 2, 0, 255]), Buffer.from(`\n${FAKE_AGE}\n`), Buffer.from([0, 0])]).toString('latin1'));
    // Chắc chắn git coi là nhị phân khi không có --text.
    assert.match(sh(work, 'show', '--format=', '-p', 'HEAD'), /Binary files .* differ|GIT binary patch/);
    const f = facts(work);
    assert.equal(f.scanFailed, false);
    assert.match(decideAutoPush({ env: {}, ...f }).notice, /looks like a key/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('dòng thêm "+++ <khoá>" trong tệp thật: vẫn thấy', () => {
    const { dir, work } = repo();
    commit(work, 'a.txt', `++ ${FAKE_AGE}\n`);
    assert.match(decideFor(work).notice, /looks like a key/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('patch vượt giới hạn đọc: không đẩy, báo một dòng', () => {
    const { dir, work } = repo();
    commit(work, 'big.txt', `${'x'.repeat(200)}\n`.repeat(50));
    const result = decideFor(work, 2000);
    assert.equal(facts(work, 2000).scanFailed, true);
    assert.deepEqual([result.push, result.reason], [false, 'unscannable']);
    assert.equal(result.notice.split('\n').length, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  test('url.*.insteadOf / pushInsteadOf về host lạ (cấu hình repo hay toàn máy): không đẩy', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    const globalConfig = join(dir, 'global.gitconfig');
    const saved = process.env.GIT_CONFIG_GLOBAL;
    try {
      for (const [where, key] of [
        ['repo', 'url.https://evil.example/.insteadOf'],
        ['repo', 'url.https://evil.example/.pushInsteadOf'],
        ['global', 'url.https://evil.example/.pushInsteadOf'],
      ]) {
        if (where === 'repo') sh(work, 'config', key, 'https://github.com/');
        else {
          writeFileSync(globalConfig, `[url "https://evil.example/"]\n\tpushInsteadOf = https://github.com/\n`);
          process.env.GIT_CONFIG_GLOBAL = globalConfig;
        }
        const f = pushFacts(work, { lsRemote: () => assert.fail('không được hỏi mạng khi có url.*') });
        assert.ok(f.transportKeys.length > 0, `${where} ${key}`);
        const result = decideAutoPush({ env: {}, ...f });
        // Về host lạ: url sau khi viết lại không qua danh sách trắng; dù lý do nào cũng không đẩy.
        assert.equal(result.push, false, `${where} ${key}`);
        assert.ok(['remote-not-allowed', 'transport'].includes(result.reason), result.reason);
        if (where === 'repo') sh(work, 'config', '--unset-all', key);
      }
      // Viết lại sang url cũng hợp lệ: vẫn không đẩy (đích thật khác url đã kiểm), báo một dòng.
      process.env.GIT_CONFIG_GLOBAL = join(dir, 'empty.gitconfig');
      sh(work, 'config', 'url.https://github.com/NLH-GOVERNANCE/.insteadOf', 'https://github.com/NLH-OS/');
      const swapped = decideAutoPush({ env: {}, ...pushFacts(work, { lsRemote: () => assert.fail('không hỏi mạng') }) });
      assert.deepEqual([swapped.push, swapped.reason], [false, 'transport']);
      assert.equal(swapped.notice.split('\n').length, 1);
      sh(work, 'config', '--unset-all', 'url.https://github.com/NLH-GOVERNANCE/.insteadOf');
      // Hết quy tắc thì đẩy được lại.
      delete process.env.GIT_CONFIG_GLOBAL;
      process.env.GIT_CONFIG_GLOBAL = join(dir, 'empty.gitconfig');
      assert.equal(decideAutoPush({ env: {}, ...pushFacts(work, { lsRemote: () => [] }) }).push, true);
    } finally {
      if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = saved;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('refs/remotes/origin bị chỉnh giả thì vẫn quét đủ khoảng đích chưa có (ranh giới là ls-remote)', () => {
    const { dir, work } = repo();
    commit(work, 'k.txt', `${FAKE_GH}\n`);
    const secret = sh(work, 'rev-parse', 'HEAD');
    commit(work, 'a.mjs', 'export {};\n');
    // Giả: ref theo dõi cục bộ nói đích đã có mọi thứ. Quét cục bộ bị lừa; quét theo ls-remote thì không.
    sh(work, 'update-ref', 'refs/remotes/origin/feat/auto', 'HEAD');
    assert.equal(decideAutoPush({ env: {}, ...repoFacts(work) }).push, true);
    const real = decideAutoPush({ env: {}, ...pushFacts(work, { lsRemote: () => [] }) });
    assert.equal(real.push, false);
    assert.match(real.notice, /looks like a key/);
    // Đích nói nó đã có commit chứa khoá (id lạ cục bộ thì bỏ qua): khoảng quét chỉ còn commit sau đó.
    const ids = [secret, 'b'.repeat(40)];
    const f = pushFacts(work, { lsRemote: () => ids });
    assert.deepEqual(f.names, ['a.mjs']);
    assert.equal(decideAutoPush({ env: {}, ...f }).push, true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('ls-remote lỗi hay quá giờ: không đẩy, không gọi cổng', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    const f = pushFacts(work, { lsRemote: () => null });
    assert.equal(f.remoteUnreadable, true);
    assert.deepEqual([decideAutoPush({ env: {}, ...f }).push, decideAutoPush({ env: {}, ...f }).reason], [false, 'remote-unreadable']);
    const lines = [];
    const result = runAutoPush(work, {
      facts: (r) => pushFacts(r, { lsRemote: () => null }),
      gate: () => assert.fail('không hỏi cổng'),
      push: () => assert.fail('không đẩy'),
      log: (line) => lines.push(line),
    });
    assert.equal(result, 'remote-unreadable');
    assert.match(lines[0], /remote-unreadable \(retry at next commit\)/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('mỗi khoá đổi đường truyền trong cấu hình hiệu lực: không đẩy, báo một dòng, không hỏi mạng', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    const keys = [
      ['url.https://evil.example/.insteadOf', 'https://github.com/'],
      ['url.https://evil.example/.pushInsteadOf', 'https://github.com/'],
      ['core.sshCommand', 'ssh -o ProxyCommand=x'],
      ['core.gitProxy', 'proxy-cmd'],
      ['http.proxy', 'http://127.0.0.1:9'],
      ['http.https://github.com/.proxy', 'http://127.0.0.1:9'],
      ['http.sslVerify', 'false'],
      ['http.https://github.com/.sslVerify', 'false'],
      ['remote.origin.proxy', 'http://127.0.0.1:9'],
      ['remote.origin.receivepack', 'x'],
      ['remote.origin.uploadpack', 'x'],
    ];
    for (const [key, value] of keys) {
      sh(work, 'config', '--add', key, value);
      const f = pushFacts(work, { lsRemote: () => assert.fail(`không hỏi mạng: ${key}`) });
      assert.ok(f.transportKeys.length > 0, key);
      const result = decideAutoPush({ env: {}, ...f });
      assert.equal(result.push, false, key);
      assert.ok(['transport', 'remote-not-allowed'].includes(result.reason), `${key} ${result.reason}`);
      if (result.reason === 'transport') assert.equal(result.notice.split('\n').length, 1);
      sh(work, 'config', '--unset-all', key);
    }
    // Giá trị nào cũng chặn, và credential.helper (cần để đăng nhập) thì không.
    sh(work, 'config', 'credential.helper', 'manager');
    sh(work, 'config', 'http.sslCAInfo', '/etc/ssl/ca.crt');
    assert.equal(decideAutoPush({ env: {}, ...pushFacts(work, { lsRemote: () => [] }) }).push, true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('biến môi trường đổi đường truyền: không đẩy, báo một dòng, không hỏi mạng', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    for (const name of ['GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_PROXY_COMMAND', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'ALL_PROXY']) {
      const env = { [name]: 'x' };
      const f = pushFacts(work, { env, lsRemote: () => assert.fail(`không hỏi mạng: ${name}`) });
      const result = decideAutoPush({ env, ...f });
      assert.deepEqual([result.push, result.reason], [false, 'transport'], name);
      assert.equal(result.notice.split('\n').length, 1);
      assert.match(result.notice, new RegExp(name));
    }
    // Biến rỗng hay NO_PROXY thì không tính.
    assert.equal(decideAutoPush({ env: { HTTPS_PROXY: '', NO_PROXY: 'github.com' }, ...pushFacts(work, { env: {}, lsRemote: () => [] }) }).push, true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('url fetch khác url đẩy: không đẩy; url đổi giữa hai lần đọc (trong lúc ls-remote): không đẩy', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    const other = 'https://github.com/NLH-GOVERNANCE/other.git';
    sh(work, 'remote', 'set-url', '--push', 'origin', other);
    const differ = decideAutoPush({ env: {}, ...pushFacts(work, { lsRemote: () => assert.fail('không hỏi mạng') }) });
    assert.deepEqual([differ.push, differ.reason], [false, 'urls-differ']);
    sh(work, 'remote', 'set-url', '--push', 'origin', URL_OK);
    const shift = (mutate) => {
      const asked = [];
      const f = pushFacts(work, { lsRemote: (url) => (asked.push(url), mutate(), []) });
      return { asked, result: decideAutoPush({ env: {}, ...f }) };
    };
    for (const mutate of [
      () => sh(work, 'remote', 'set-url', 'origin', other),
      () => sh(work, 'remote', 'set-url', '--push', 'origin', other),
      () => sh(work, 'remote', 'set-url', '--add', '--push', 'origin', other),
      () => sh(work, 'config', 'url.https://github.com/NLH-GOVERNANCE/.insteadOf', 'https://github.com/NLH-OS/'),
    ]) {
      const { asked, result } = shift(mutate);
      assert.deepEqual(asked, [URL_OK]);
      assert.equal(result.push, false);
      assert.notEqual(result.reason, 'ok');
      // Về lại như đầu: remote một url, không quy tắc viết lại.
      sh(work, 'remote', 'remove', 'origin');
      sh(work, 'remote', 'add', 'origin', URL_OK);
      try {
        sh(work, 'config', '--remove-section', 'url.https://github.com/NLH-GOVERNANCE/');
      } catch {
        // không có quy tắc nào để xoá
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('ls-remote chạy cùng ngữ cảnh với lệnh đẩy (git -C <repo>): thấy cấu hình của repo', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    const bare = join(dir, 'bare.git');
    sh(dir, 'clone', '-q', '--bare', work, bare);
    // Chỉ cấu hình của repo nói fake://target là bare.git: lsRemote chỉ thành công khi chạy trong repo đó.
    sh(work, 'config', `url.${bare}.insteadOf`, 'fake://target');
    const ids = lsRemote('fake://target', work);
    assert.ok(ids.includes(sh(work, 'rev-parse', 'HEAD')));
    assert.equal(lsRemote('fake://target', dir), null);
    rmSync(dir, { recursive: true, force: true });
  });

  test('HEAD đổi giữa lúc hỏi cổng và lúc đẩy: không đẩy SHA cũ; commit mới được kiểm ở vòng sau', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    const first = sh(work, 'rev-parse', 'HEAD');
    const asked = [];
    const pushed = [];
    let moved = false;
    const deps = {
      facts: (r) => pushFacts(r, { lsRemote: () => [] }),
      gate: (f) => (asked.push(f.sha), { denied: false }),
      push: (args) => (pushed.push(args), { ok: true }),
      // Chèn giữa cổng và lúc đẩy: có commit mới (sạch), một lần.
      between: () => {
        if (moved) return;
        moved = true;
        commit(work, 'b.mjs', 'export const b = 1;\n');
      },
    };
    assert.equal(runAutoPush(work, deps), 'pushed');
    const second = sh(work, 'rev-parse', 'HEAD');
    assert.notEqual(first, second);
    assert.deepEqual(asked, [first, second]);
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0][4], `${second}:refs/heads/feat/auto`);
    assert.ok(!pushed.flat().includes(`${first}:refs/heads/feat/auto`));
    rmSync(dir, { recursive: true, force: true });
  });

  test('giữa chừng có commit chứa khoá, hay đổi sang main: không đẩy gì', () => {
    for (const change of ['secret', 'main']) {
      const { dir, work } = repo();
      commit(work, 'a.mjs', 'export {};\n');
      const pushed = [];
      let moved = false;
      const result = runAutoPush(work, {
        facts: (r) => pushFacts(r, { lsRemote: () => [] }),
        gate: () => ({ denied: false }),
        push: (args) => (pushed.push(args), { ok: true }),
        between: () => {
          if (moved) return;
          moved = true;
          if (change === 'secret') commit(work, 'k.txt', `${FAKE_GH}\n`);
          else sh(work, 'checkout', '-q', 'dev');
        },
      });
      assert.notEqual(result, 'pushed', change);
      assert.deepEqual(pushed, [], change);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('HEAD đổi liên tục thì thôi sau vài vòng, không đẩy; cổng nói không thì không đẩy', () => {
    const { dir, work } = repo();
    commit(work, 'a.mjs', 'export {};\n');
    let n = 0;
    const pushed = [];
    const result = runAutoPush(work, {
      facts: (r) => pushFacts(r, { lsRemote: () => [] }),
      gate: () => ({ denied: false }),
      push: (args) => (pushed.push(args), { ok: true }),
      between: () => commit(work, `m${(n += 1)}.mjs`, 'export {};\n'),
    });
    assert.equal(result, 'moved');
    assert.deepEqual(pushed, []);
    assert.equal(runAutoPush(work, { facts: (r) => pushFacts(r, { lsRemote: () => [] }), gate: () => ({ denied: true }), push: (args) => (pushed.push(args), { ok: true }) }), 'gate');
    assert.deepEqual(pushed, []);
    assert.equal(runAutoPush(work, { env: { NLH_AUTOPUSH: '0' }, facts: (r) => pushFacts(r, { lsRemote: () => [] }), gate: () => ({ denied: false }), push: (args) => (pushed.push(args), { ok: true }) }), 'off');
    assert.equal(runAutoPush(work, { facts: (r) => pushFacts(r, { lsRemote: () => [] }), gate: () => ({ denied: false }), push: () => ({ ok: false, message: 'network' }) }), 'failed');
    rmSync(dir, { recursive: true, force: true });
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
    sh(work, 'config', 'commit.gpgsign', 'false');
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
      // Không có mạng: git chỉ cho giao thức file, nên ls-remote tới github.com hỏng ngay, không chạm GitHub.
      GIT_ALLOW_PROTOCOL: 'file',
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
    assert.match(lines[0], /feat\/auto not pushed: remote-unreadable \(retry at next commit\)/);
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

  test('remote hai url đẩy (một lạ): hook không đẩy, không ghi log', async () => {
    const { dir, work, env, log } = makeRepo('https://github.com/NLH-OS/demo.git');
    sh(work, 'remote', 'set-url', '--add', '--push', 'origin', 'https://github.com/NLH-OS/demo.git');
    sh(work, 'remote', 'set-url', '--add', '--push', 'origin', 'https://github.com/someone/else.git');
    commit(work);
    const { code, out } = await run(commitInput(work), env);
    assert.equal(code, 0);
    assert.equal(out, null);
    assert.equal(existsSync(log), false);
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
