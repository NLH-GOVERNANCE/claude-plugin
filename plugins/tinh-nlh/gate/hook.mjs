// PreToolUse and PostToolUse hook of plugin nlh: the local gate (ticket 6c4e1825). Before a Bash or PowerShell command
// runs git commit or git push in a repo of NLH-OS, NLH-GOVERNANCE or NLH-NEDU-*, run the checks Review would fail on:
// the counted rules of the PR gate (gate/rules.mjs of NLH-OS/api, fetched with the user's gh and cached for 6 hours),
// the repo's `test:fast` script when package.json declares one, and the repeated errors in repeated-errors.json.
// Anything fails: deny the command with one line per finding. After a push that passed, tell Claude to write one line
// on its ticket. Other repos, other commands, or the hook itself failing: the command runs as usual.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  blockReason,
  commitFlags,
  gateFindings,
  gitOps,
  isBaseBranch,
  parseAddedLines,
  pushRecord,
  pushTarget,
  repeatedFindings,
  retiredWords,
  scopedRepo,
} from './checks.mjs';

const RULES_TTL_MS = 6 * 60 * 60 * 1000;
const RULES_SOURCE = 'repos/NLH-OS/api/contents/gate/rules.mjs?ref=main';
const NAMES_SOURCE = 'repos/NLH-GOVERNANCE/decisions/contents/rules/pr-review.md?ref=main';
const TEST_TIMEOUT_MS = 240_000;
const stateDir = process.env.NLH_GATE_DIR || join(homedir(), '.tinh-nlh', 'gate');
const repeated = JSON.parse(readFileSync(new URL('./repeated-errors.json', import.meta.url), 'utf8'));

function run(file, args, timeout = 15_000, maxBuffer = 1024 * 1024) {
  try {
    return execFileSync(file, args, { cwd: homedir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout, maxBuffer, windowsHide: true }).trim();
  } catch {
    return null;
  }
}
// git runs with -C, not in the repo folder: on Windows a git.exe inside the repo would be found before PATH.
const git = (dir, ...args) => run('git', ['-C', dir, '-c', 'core.quotepath=off', ...args]);
// A big diff must not silently turn a check off (the default 1 MB buffer would): up to 64 MB, 60 s.
const gitBig = (dir, ...args) => run('git', ['-C', dir, '-c', 'core.quotepath=off', ...args], 60_000, 64 * 1024 * 1024);

// git diff --name-status -z: status, path (renames and copies: status, old path, new path).
function nameStatus(cwd, ...args) {
  const out = git(cwd, 'diff', '--name-status', '-z', ...args);
  if (!out) return [];
  const parts = out.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i += 1) {
    const status = parts[i];
    if (/^[RC]/.test(status)) i += 1;
    files.push({ status, path: parts[(i += 1)] });
  }
  return files;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(join(stateDir, file), 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, value) {
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, file), JSON.stringify(value));
  } catch {
    // State is a convenience: without it the gate still checks, it only re-runs tests and forgets earlier blocks.
  }
}

// gate/rules.mjs of NLH-OS/api: the cached copy while fresh, else a new copy through gh, else the stale copy.
// It runs as code here, as it does in the PR gate: only from main of NLH-OS/api (reviewed, protected), through the
// user's own gh sign-in; the ticket asks to read the rules there, never to copy them into the plugin.
async function loadRules() {
  const file = join(stateDir, 'rules.mjs');
  const age = existsSync(file) ? Date.now() - statSync(file).mtimeMs : Infinity;
  if (age > RULES_TTL_MS) {
    const text = run('gh', ['api', '-H', 'Accept: application/vnd.github.raw', RULES_SOURCE]);
    if (text && /export function checkPullRequest/.test(text)) {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(file, `${text}\n`);
    }
  }
  if (!existsSync(file)) return null;
  try {
    return await import(`${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`);
  } catch {
    return null;
  }
}

// Words D-0067 retires (R19): read from rules/pr-review.md of NLH-GOVERNANCE/decisions, cached like the rules file. No
// text, no words: the two name checks stay silent rather than guess a list.
function loadRetiredWords() {
  const file = join(stateDir, 'pr-review.md');
  const age = existsSync(file) ? Date.now() - statSync(file).mtimeMs : Infinity;
  if (age > RULES_TTL_MS) {
    const text = run('gh', ['api', '-H', 'Accept: application/vnd.github.raw', NAMES_SOURCE]);
    if (text && /R19/.test(text)) {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(file, text);
    }
  }
  try {
    return existsSync(file) ? retiredWords(readFileSync(file, 'utf8')) : [];
  } catch {
    return [];
  }
}

// True only when git says the branch cannot merge into the base cleanly (merge-tree exits 1); git older than 2.38, or any
// other failure, is "unknown" and passes.
function conflictsWith(root, base, source) {
  const result = spawnSync('git', ['-C', root, 'merge-tree', '--write-tree', '--no-messages', base, source], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
  return result.status === 1;
}

function openPullRequest(repo, branch) {
  const out = run('gh', ['pr', 'view', branch, '-R', repo, '--json', 'number,state,body,baseRefName,createdAt']);
  try {
    const pr = JSON.parse(out);
    return pr.state === 'OPEN' ? pr : null;
  } catch {
    return null;
  }
}

// The repo's quick tests: `test:fast` in the root package.json. Skipped when this tree already passed. Only repos of
// the organisations in scope get here, the same code the user is about to commit and push.
function quickTests(root, tree) {
  let scripts;
  try {
    scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    return null;
  }
  if (!scripts['test:fast']) return null;
  const passed = readJson('test-pass.json', {});
  if (tree && passed[root] === tree) return { ran: false };
  const manager = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, 'yarn.lock')) ? 'yarn' : 'npm';
  const result = spawnSync(manager, ['run', 'test:fast'], {
    cwd: root,
    encoding: 'utf8',
    timeout: TEST_TIMEOUT_MS,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.status === 0) {
    if (tree) writeJson('test-pass.json', { ...passed, [root]: tree });
    return { ran: true };
  }
  const last = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  return { ran: true, failure: { id: 'test:fast', message: `${manager} run test:fast lỗi${result.error ? ' (quá giờ)' : ''}: ${(last ?? '').slice(0, 200)}` } };
}

async function checkOp({ op, dir, args }, pending, now) {
  const root = git(dir, 'rev-parse', '--show-toplevel');
  if (!root) return null;
  const repo = scopedRepo(git(root, 'remote', 'get-url', 'origin'));
  const current = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (!repo || !current || current === 'HEAD') return null;

  let branch = current;
  let source = 'HEAD';
  let remote = 'origin';
  let force = false;
  let files = [];
  const carried = pending.get(root) ?? { count: 0, files: [] };
  let extraCount = carried.count;
  let extraFiles = carried.files;
  let merging = null;
  if (op === 'commit') {
    const { amend, all } = commitFlags(args);
    merging = amend ? null : git(root, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD');
    files = [...nameStatus(root, '--cached'), ...(all ? nameStatus(root) : [])];
    // A merge commit adds no commit to the count, as in the PR gate (D-0017).
    extraCount += amend || merging ? 0 : 1;
  } else {
    const target = pushTarget(args, current);
    if (target.skip) return null;
    ({ branch, remote, force } = target);
    source = target.src;
    if (!git(root, 'rev-parse', '--verify', '--quiet', `${source}^{commit}`)) return null;
  }

  const pr = op === 'push' && !isBaseBranch(branch) ? openPullRequest(repo, branch) : null;
  const base = pr?.baseRefName ?? (git(root, 'rev-parse', '--verify', '--quiet', 'origin/dev') ? 'dev' : 'main');
  const remoteBase = `origin/${isBaseBranch(branch) ? branch : base}`;
  const hasBase = Boolean(git(root, 'rev-parse', '--verify', '--quiet', remoteBase));
  let range = hasBase ? nameStatus(root, `${remoteBase}...${source}`) : [];
  // Bringing the base into the branch (ticket 9ea10c50): the index against HEAD holds every file the base changed. Count
  // what the PR will differ by, as the PR gate does: the index against the merge-base of the base and the merged result.
  const forkPoint = merging && hasBase ? git(root, 'merge-base', remoteBase, 'HEAD', merging) : null;
  if (forkPoint) {
    const { all } = commitFlags(args);
    files = [...nameStatus(root, '--cached', forkPoint), ...(all ? nameStatus(root, forkPoint) : [])];
    range = [];
  }
  if (op === 'commit') {
    extraFiles = [...extraFiles, ...files];
    pending.set(root, { count: extraCount, files: extraFiles });
  }
  if (op === 'push') files = [...range, ...extraFiles];
  const commitCount = (hasBase ? Number(git(root, 'rev-list', '--count', '--no-merges', `${remoteBase}..${source}`)) || 0 : 0) + extraCount;
  const dates = hasBase ? (git(root, 'log', '--format=%aI', `${remoteBase}..${source}`) ?? '').split('\n').filter(Boolean) : [];
  const retired = loadRetiredWords();
  // A merge commit brings in lines other people wrote: they are not this author's new text, so nothing is scanned.
  const diffArgs = op === 'push' ? (hasBase ? [`${remoteBase}...${source}`] : null) : merging ? null : ['--cached'];
  const diff = retired.length && diffArgs ? gitBig(root, 'diff', '-U0', '--no-color', '--no-ext-diff', ...diffArgs) : null;
  const facts = {
    repo,
    retired,
    addedLines: parseAddedLines(diff),
    conflictsWithBase: op === 'push' && hasBase && !isBaseBranch(branch) ? conflictsWith(root, remoteBase, source) : null,
    op,
    branch,
    base,
    pr,
    force,
    files,
    commitCount,
    changedFiles: new Set([...range, ...extraFiles].map((file) => file.path)).size,
    commitAuthorDates: extraCount ? [...dates, new Date(now).toISOString()] : dates,
    now,
  };

  const findings = [];
  const checks = [];
  const rules = await loadRules();
  if (rules) {
    try {
      findings.push(...gateFindings(rules, facts));
      checks.push('luật cổng');
    } catch {
      // A rules file this hook cannot run: Review's gate still checks on the PR.
    }
  }
  const gateIds = new Set(findings.map((finding) => finding.id.split(' ')[0]));
  findings.push(
    ...repeatedFindings(repeated, facts).filter((finding) => !(finding.id === 'vietnamese-branch-name' && gateIds.has('R17'))),
  );
  checks.push(`lỗi lặp (${repeated.filter((check) => check.on.includes(op)).length})`);
  if (!findings.length) {
    const tree = op === 'commit' ? git(root, 'write-tree') : git(root, 'rev-parse', `${source}^{tree}`);
    const tests = quickTests(root, tree);
    if (tests?.failure) findings.push(tests.failure);
    if (tests) checks.push('test:fast');
  }
  const sha = op === 'push' ? git(root, 'rev-parse', source) : null;
  return { op, root, repo, branch, remote, sha, checks, findings, rulesMissing: !rules };
}

async function pre(input) {
  const command = String(input.tool_input?.command ?? '');
  if (!/\bgit\b/.test(command) || !/\b(commit|push)\b/.test(command)) return;
  const cwd = input.cwd || process.cwd();
  const ops = gitOps(command, cwd, (from, to) => resolve(from, to.replace(/^~(?=$|[\\/])/, homedir())));
  const pending = new Map();
  const now = Date.now();
  const results = [];
  for (const op of ops) {
    const result = await checkOp(op, pending, now);
    if (result) results.push(result);
  }
  const failed = results.filter((result) => result.findings.length);
  const blocked = readJson('blocked.json', {});
  if (failed.length) {
    for (const result of failed) {
      const key = `${result.repo}@${result.branch}`;
      blocked[key] = [...(blocked[key] ?? []), ...result.findings.map((finding) => finding.id)];
    }
    writeJson('blocked.json', blocked);
    const reason = failed.map((result) => blockReason(result.op, result.findings)).join('\n');
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }),
    );
    return;
  }
  const pushes = results.filter((result) => result.op === 'push' && result.sha);
  if (pushes.length && /^[A-Za-z0-9_-]{1,100}$/.test(String(input.tool_use_id ?? ''))) {
    writeJson(`push-${input.tool_use_id}.json`, pushes.map(({ root, repo, branch, remote, sha, checks, rulesMissing }) => ({ root, repo, branch, remote, sha, checks, rulesMissing })));
  }
}

// After the command ran: for each push that reached the remote, one line for Claude to record on its ticket.
function post(input) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(input.tool_use_id ?? ''))) return;
  const file = `push-${input.tool_use_id}.json`;
  const pushes = readJson(file, null);
  if (!pushes) return;
  rmSync(join(stateDir, file), { force: true });
  const blocked = readJson('blocked.json', {});
  const lines = [];
  for (const push of pushes) {
    if (git(push.root, 'rev-parse', `${push.remote}/${push.branch}`) !== push.sha) continue;
    const key = `${push.repo}@${push.branch}`;
    const checks = push.rulesMissing ? [...push.checks, 'luật cổng chưa tải được (gh chưa đăng nhập?)'] : push.checks;
    lines.push(pushRecord({ repo: push.repo, branch: push.branch, sha: push.sha, checks, blocked: blocked[key] ?? [] }));
    delete blocked[key];
  }
  if (!lines.length) return;
  writeJson('blocked.json', blocked);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: lines.join('\n') } }));
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (input.hook_event_name === 'PostToolUse') post(input);
  else await pre(input);
} catch {
  // The gate never stops work by failing itself.
}
