// Phép thử cổng trên máy (việc 6c4e1825): mỗi kiểm có lỗi thì chặn, sạch thì cho qua; hook chặn git commit kèm
// tsconfig.tsbuildinfo, bỏ file thì qua; repo ngoài NLH-OS, NLH-GOVERNANCE, NLH-NEDU-* thì không đụng.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  blockReason,
  commitFlags,
  gateFindings,
  gitOps,
  matchesPath,
  pushRecord,
  pushTarget,
  repeatedFindings,
  scopedRepo,
  splitCommands,
  statedCommitCount,
  tickedItems,
} from '../plugins/tinh-nlh/gate/checks.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const hook = join(root, 'plugins/tinh-nlh/gate/hook.mjs');
const repeated = JSON.parse(readFileSync(join(root, 'plugins/tinh-nlh/gate/repeated-errors.json'), 'utf8'));

// Luật cổng giả, cùng dạng gate/rules.mjs của NLH-OS/api: đủ để thử hook lọc và chuyển lời, không chép luật thật.
const RULES_STUB = `
export const SEVERITY = { block: 'block', note: 'note' };
export function checkPullRequest({ pr, now }) {
  const out = [];
  if (now - Date.parse(pr.createdAt) > 864e5) out.push({ rule: 'R01', severity: 'block', message: 'PR cũ' });
  if (pr.commitCount > 3) out.push({ rule: 'R02', severity: 'block', message: 'PR có ' + pr.commitCount + ' commit' });
  if (!['dev', 'main'].includes(pr.head) && !/^(feat|fix|chore)\\/[a-z0-9-]+$/.test(pr.head)) out.push({ rule: 'R17 (tên nhánh tiếng Anh)', severity: 'block', message: 'Tên nhánh ' + pr.head });
  if (!pr.body) out.push({ rule: 'R04', severity: 'block', message: 'Thiếu mục "## Summary".' });
  out.push({ rule: 'R12', severity: 'note', message: 'ghi chú' });
  return out;
}
`;
const rules = await import(`data:text/javascript,${encodeURIComponent(RULES_STUB)}`);

const facts = (extra = {}) => ({
  op: 'push',
  branch: 'feat/x',
  base: 'dev',
  pr: null,
  force: false,
  files: [],
  commitCount: 1,
  changedFiles: 1,
  commitAuthorDates: [],
  now: Date.parse('2026-10-22T13:00:00Z'),
  ...extra,
});
const ids = (findings) => findings.map((finding) => finding.id);
const pr = (body, extra = {}) => ({ number: 7, body, baseRefName: 'dev', createdAt: '2026-10-22T12:00:00Z', ...extra });

describe('cổng trên máy: đọc lệnh', () => {
  test('tách lệnh theo && ; | và xuống dòng, giữ heredoc trong ngoặc là một chữ', () => {
    const line = `cd repo && git commit -m "$(cat <<'EOF'\nfeat: x; y && z\nEOF\n)" ; git push -u origin feat/x`;
    const commands = splitCommands(line);
    assert.deepEqual(commands[0], ['cd', 'repo']);
    assert.equal(commands[1][3], "$(cat <<'EOF'\nfeat: x; y && z\nEOF\n)");
    assert.deepEqual(commands[2], ['git', 'push', '-u', 'origin', 'feat/x']);
  });

  test('tìm git commit và git push với thư mục chạy (cd, Set-Location, git -C); lệnh khác thì bỏ', () => {
    const join = (from, to) => resolve(from, to);
    const base = resolve('/w');
    assert.deepEqual(
      gitOps('cd a && git add . && git commit -m x; Set-Location ../b; git -C c push origin HEAD', base, join).map(({ op, dir }) => [op, dir]),
      [['commit', resolve('/w/a')], ['push', resolve('/w/b/c')]],
    );
    assert.deepEqual(gitOps('git log --oneline; echo "git commit"; git status', base, join), []);
    assert.deepEqual(gitOps('git -c core.quotepath=off --no-pager commit -am x', base, join)[0].args, ['-am', 'x']);
  });

  test('cờ commit: --amend không thêm commit, -a và -am lấy cả file đã sửa; -m "a" thì không', () => {
    assert.deepEqual(commitFlags(['--amend', '--no-edit']), { amend: true, all: false });
    assert.deepEqual(commitFlags(['-am', 'msg']), { amend: false, all: true });
    assert.deepEqual(commitFlags(['-m', 'a b']), { amend: false, all: false });
  });

  test('push: nhánh đích, force (cờ hay dấu +), bỏ qua xoá nhánh và tag', () => {
    assert.deepEqual(pushTarget([], 'feat/x'), { remote: 'origin', src: 'feat/x', branch: 'feat/x', force: false, skip: false });
    assert.equal(pushTarget(['-u', 'origin', 'HEAD:feat/y'], 'feat/x').branch, 'feat/y');
    assert.equal(pushTarget(['--force-with-lease', 'origin', 'feat/x'], 'feat/x').force, true);
    assert.equal(pushTarget(['origin', '+feat/x'], 'feat/x').force, true);
    assert.equal(pushTarget(['origin', '--delete', 'feat/x'], 'dev').skip, true);
    assert.equal(pushTarget(['origin', 'refs/tags/v1'], 'dev').skip, true);
  });

  test('phạm vi: NLH-OS, NLH-GOVERNANCE, NLH-NEDU-*; repo khác thì không', () => {
    assert.equal(scopedRepo('https://github.com/NLH-OS/api.git'), 'NLH-OS/api');
    assert.equal(scopedRepo('git@github.com:NLH-GOVERNANCE/claude-plugin.git'), 'NLH-GOVERNANCE/claude-plugin');
    assert.equal(scopedRepo('https://github.com/NLH-NEDU-LABS/nedu-website'), 'NLH-NEDU-LABS/nedu-website');
    assert.equal(scopedRepo('https://github.com/NhiLe-Team-Webs/nedu.git'), null);
    assert.equal(scopedRepo('https://gitlab.com/NLH-OS/api.git'), null);
    assert.equal(scopedRepo(null), null);
  });
});

describe('cổng trên máy: luật cổng đọc từ rules.mjs', () => {
  test('nhánh sai tên, quá 3 commit thì chặn; sạch thì qua; ghi chú không chặn', () => {
    assert.deepEqual(ids(gateFindings(rules, facts({ branch: 'feat/x' }))), []);
    assert.deepEqual(ids(gateFindings(rules, facts({ branch: 'feat/sửa-lỗi', commitCount: 4 }))), ['R02', 'R17 (tên nhánh tiếng Anh)']);
  });

  test('R04 chỉ khi PR đã mở; R01 không chặn push; nhánh dev, main không đếm commit', () => {
    assert.deepEqual(ids(gateFindings(rules, facts({ pr: pr('') }))), ['R04']);
    assert.deepEqual(ids(gateFindings(rules, facts({ pr: pr('ok', { createdAt: '2026-10-01T00:00:00Z' }) }))), []);
    assert.deepEqual(ids(gateFindings(rules, facts({ branch: 'dev', commitCount: 9 }))), []);
  });
});

describe('cổng trên máy: lỗi đã lặp (repeated-errors.json)', () => {
  test('mỗi dòng một kiểm, có id, kind, on, message', () => {
    const lines = readFileSync(join(root, 'plugins/tinh-nlh/gate/repeated-errors.json'), 'utf8').trim().split(/\r?\n/).slice(1, -1);
    assert.equal(lines.length, repeated.length);
    for (const check of repeated) {
      assert.ok(check.id && check.kind && check.message && check.source, check.id);
      assert.ok(check.on.every((op) => ['commit', 'push'].includes(op)), check.id);
    }
  });

  const only = (id, extra) => ids(repeatedFindings(repeated, facts(extra))).filter((found) => found === id);

  test('file rác: tsbuildinfo, .claude/launch.json thì chặn; file thường hay đã xoá thì qua', () => {
    assert.ok(matchesPath('*.tsbuildinfo', 'web/tsconfig.tsbuildinfo'));
    assert.ok(matchesPath('.claude/launch.json', 'app/.claude/launch.json'));
    assert.ok(!matchesPath('.claude/launch.json', 'docs/launch.json'));
    assert.deepEqual(only('junk-file', { op: 'commit', files: [{ status: 'A', path: 'tsconfig.tsbuildinfo' }] }), ['junk-file']);
    assert.deepEqual(only('junk-file', { files: [{ status: 'M', path: '.claude/launch.json' }] }), ['junk-file']);
    assert.deepEqual(only('junk-file', { files: [{ status: 'D', path: 'tsconfig.tsbuildinfo' }, { status: 'A', path: 'src/a.ts' }] }), []);
  });

  test('tên file mới có dấu thì chặn; file cũ chỉ sửa thì qua', () => {
    assert.deepEqual(only('vietnamese-file-name', { files: [{ status: 'A', path: 'docs/sửa-lỗi.md' }] }), ['vietnamese-file-name']);
    assert.deepEqual(only('vietnamese-file-name', { files: [{ status: 'M', path: 'docs/sửa-lỗi.md' }, { status: 'A', path: 'docs/fix.md' }] }), []);
  });

  test('tên nhánh có dấu thì chặn, tiếng Anh thì qua', () => {
    assert.deepEqual(only('vietnamese-branch-name', { branch: 'feat/lượt-2' }), ['vietnamese-branch-name']);
    assert.deepEqual(only('vietnamese-branch-name', { branch: 'feat/round-2' }), []);
  });

  test('Test Plan: tick mục CI hay post-merge trước push thì chặn; chưa tick, mục khác, chưa mở PR thì qua', () => {
    const body = (items) => `## Summary\n- x\n\n## Test Plan\n${items}\n\n## Risk\n- [x] CI xanh`;
    assert.deepEqual(only('test-plan-ci-ticked', { pr: pr(body('- [x] CI xanh trên commit mới')) }), ['test-plan-ci-ticked']);
    assert.deepEqual(only('test-plan-post-merge-ticked', { pr: pr(body('- [x] Post-merge: thử trên máy')) }), ['test-plan-post-merge-ticked']);
    assert.deepEqual(only('test-plan-ci-ticked', { pr: pr(body('- [ ] CI xanh\n- [x] node --test test/gate.test.mjs')) }), []);
    assert.deepEqual(only('test-plan-post-merge-ticked', { pr: pr(body('- [ ] Post-merge: thử trên máy')) }), []);
    assert.deepEqual(only('test-plan-ci-ticked', { pr: null }), []);
    assert.deepEqual(tickedItems(body('- [x] a\n- [ ] b')), ['a']);
  });

  test('số commit ghi trong mô tả khác thực tế thì chặn; khớp hay không ghi thì qua', () => {
    assert.equal(statedCommitCount('Một commit cộng một commit merge dev'), 1);
    assert.equal(statedCommitCount('PR có 2 commit'), 2);
    assert.equal(statedCommitCount('không ghi số'), null);
    assert.deepEqual(only('description-commit-count', { pr: pr('2 commit'), commitCount: 3 }), ['description-commit-count']);
    assert.deepEqual(only('description-commit-count', { pr: pr('2 commit'), commitCount: 2 }), []);
    assert.deepEqual(only('description-commit-count', { pr: pr('Summary'), commitCount: 3 }), []);
  });

  test('force push nhánh đã mở PR thì chặn; force khi chưa có PR, hay push thường, thì qua', () => {
    assert.deepEqual(only('force-push-open-pr', { force: true, pr: pr('x') }), ['force-push-open-pr']);
    assert.deepEqual(only('force-push-open-pr', { force: true, pr: null }), []);
    assert.deepEqual(only('force-push-open-pr', { force: false, pr: pr('x') }), []);
  });

  test('lời chặn mỗi lỗi một dòng; dòng ghi giếng sau push nói kiểm gì, qua, chặn trước mấy lần', () => {
    assert.equal(blockReason('commit', [{ id: 'junk-file', message: 'File rác' }]), 'Nếp gate blocked git commit: fix these, then run it again (do not bypass the check).\n- junk-file · File rác');
    const record = pushRecord({ repo: 'NLH-OS/api', branch: 'feat/x', sha: 'abcdef1234', checks: ['luật cổng', 'lỗi lặp (7)'], blocked: ['R17', 'R17'] });
    assert.match(record, /add_follow_up kind fact, body "push abcdef1 NLH-OS\/api@feat\/x: kiểm luật cổng, lỗi lặp \(7\); qua; trước đó chặn 2 lần: R17"/);
  });
});

describe('cổng trên máy: hook chạy thật trên một repo git', () => {
  const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const run = (input, gateDir) =>
    new Promise((done) => {
      const child = spawn(process.execPath, [hook], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, NLH_GATE_DIR: gateDir } });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.on('exit', () => done(out ? JSON.parse(out) : null));
      child.stdin.end(JSON.stringify(input));
    });

  function makeRepo(url) {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-gate-'));
    const origin = join(dir, 'origin.git');
    const work = join(dir, 'work');
    sh(dir, 'init', '--bare', '-b', 'dev', origin);
    sh(dir, 'clone', origin, work);
    sh(work, 'config', 'user.email', 'build@nlh.vn');
    sh(work, 'config', 'user.name', 'build');
    sh(work, 'checkout', '-b', 'dev');
    writeFileSync(join(work, 'README.md'), 'x\n');
    sh(work, 'add', '.');
    sh(work, 'commit', '-m', 'init');
    sh(work, 'push', 'origin', 'dev');
    sh(work, 'checkout', '-b', 'feat/gate');
    sh(work, 'remote', 'set-url', 'origin', url);
    const gateDir = join(dir, 'gate');
    execFileSync(process.execPath, ['-e', `require('fs').mkdirSync(${JSON.stringify(gateDir)});require('fs').writeFileSync(${JSON.stringify(join(gateDir, 'rules.mjs'))}, ${JSON.stringify(RULES_STUB)})`]);
    return { dir, work, gateDir };
  }

  test('commit kèm tsconfig.tsbuildinfo bị chặn với lý do; bỏ file thì qua', async () => {
    const { dir, work, gateDir } = makeRepo('https://github.com/NLH-OS/demo.git');
    writeFileSync(join(work, 'a.mjs'), 'export {};\n');
    writeFileSync(join(work, 'tsconfig.tsbuildinfo'), '{}\n');
    sh(work, 'add', '.');
    const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'toolu_1', cwd: work, tool_input: { command: 'git commit -m "feat: a"' } };
    const denied = await run(input, gateDir);
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /^Nếp gate blocked git commit.*\n- junk-file · File rác trong commit: tsconfig\.tsbuildinfo\./);
    sh(work, 'rm', '--cached', '--quiet', 'tsconfig.tsbuildinfo');
    assert.equal(await run(input, gateDir), null);
    rmSync(dir, { recursive: true, force: true });
  });

  test('repo ngoài phạm vi, hay lệnh không phải commit/push, thì không đụng', async () => {
    const { dir, work, gateDir } = makeRepo('https://github.com/someone/else.git');
    writeFileSync(join(work, 'tsconfig.tsbuildinfo'), '{}\n');
    sh(work, 'add', '.');
    const input = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'PowerShell', tool_use_id: 'toolu_2', cwd: work, tool_input: { command } });
    assert.equal(await run(input('git commit -m x'), gateDir), null);
    sh(work, 'remote', 'set-url', 'origin', 'https://github.com/NLH-GOVERNANCE/demo.git');
    assert.equal(await run(input('git status; git log'), gateDir), null);
    assert.equal((await run(input('git commit -m x'), gateDir)).hookSpecificOutput.permissionDecision, 'deny');
    rmSync(dir, { recursive: true, force: true });
  });
});
