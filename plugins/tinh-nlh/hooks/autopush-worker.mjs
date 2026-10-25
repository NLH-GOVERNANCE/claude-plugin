// The push of autopush-hook.mjs (ticket eca924c5), run in the background for one repo folder. The steps are in
// runAutoPush (autopush.mjs): read the facts, ask the local gate (gate/hook.mjs) about exactly that commit, read the facts
// again, push `<sha>:refs/heads/<branch>` with the id that was checked. The gate says no, nothing is pushed. One quiet line
// in autopush.log per try; a network error or a refusal is not retried here, the next commit pushes the branch again.
// Never a force push. Always exits 0.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoPushOn, gateCommand, gateVerdict, redact, runAutoPush } from './autopush.mjs';
import { pushFacts, repoFacts } from './autopush-git.mjs';

const dir = process.env.NLH_AUTOPUSH_DIR || join(homedir(), '.tinh-nlh', 'autopush');
const gateHook = fileURLToPath(new URL('../gate/hook.mjs', import.meta.url));
const gateDir = process.env.NLH_GATE_DIR || join(homedir(), '.tinh-nlh', 'gate');
const LOCK_TTL_MS = 5 * 60 * 1000;
const LOG_MAX = 100 * 1024;

function log(line) {
  try {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'autopush.log');
    try {
      if (statSync(file).size > LOG_MAX) writeFileSync(file, `${readFileSync(file, 'utf8').split('\n').slice(-100).join('\n')}\n`);
    } catch {
      // no log yet
    }
    appendFileSync(file, `${new Date().toISOString()} ${redact(line)}\n`);
  } catch {
    // The log is a convenience.
  }
}

// The gate (gate/hook.mjs, unchanged), as for a push typed by hand, about exactly the checked commit. It gets a tool_use_id
// of its own, so for a push it lets through it writes push-<id>.json: the proof that it checked this commit with its rules
// (see gateVerdict). The record is read and removed here. Silence or a missing record is not a yes.
function gate(facts, decision) {
  const id = `nlh_autopush_${randomBytes(8).toString('hex')}`;
  const result = spawnSync(process.execPath, [gateHook], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: id, cwd: facts.root, tool_input: { command: gateCommand(facts.sha, facts.branch) } }),
    encoding: 'utf8',
    timeout: 280_000,
    windowsHide: true,
  });
  const file = join(gateDir, `push-${id}.json`);
  let records = null;
  try {
    records = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    records = null;
  }
  try {
    rmSync(file);
  } catch {
    // nothing to remove
  }
  return gateVerdict(result, { records, sha: facts.sha, branch: facts.branch, repo: decision.repo, root: facts.root });
}

function push(args) {
  const result = spawnSync('git', args, {
    cwd: homedir(),
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  if (result.status === 0) return { ok: true };
  const last = `${result.stderr ?? ''}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
  return { ok: false, message: last ?? (result.error ? 'git did not run' : 'no message') };
}

// Upstream tracking, best effort, only after a push that went through (a push by url and id does not set it).
function afterPush(facts) {
  const config = (key, value) => spawnSync('git', ['-C', facts.root, 'config', key, value], { cwd: homedir(), stdio: 'ignore', timeout: 20_000, windowsHide: true });
  config(`branch.${facts.branch}.remote`, 'origin');
  config(`branch.${facts.branch}.merge`, `refs/heads/${facts.branch}`);
}

let lock = null;
try {
  const root = process.argv[2];
  // Off by default: checked before any folder, git or network, even when the worker is started by hand.
  if (root && autoPushOn(process.env)) {
    mkdirSync(dir, { recursive: true });
    const first = repoFacts(root, { scan: false });
    const lockFile = join(dir, `${Buffer.from(first?.root ?? root).toString('hex').slice(-40)}.lock`);
    let busy = false;
    try {
      busy = Date.now() - statSync(lockFile).mtimeMs < LOCK_TTL_MS;
    } catch {
      busy = false;
    }
    if (!busy) {
      lock = lockFile;
      writeFileSync(lock, String(process.pid));
      runAutoPush(root, { env: process.env, facts: (r) => pushFacts(r), gate, push, afterPush, log });
    }
  }
} catch {
  // Never hurt the session.
} finally {
  if (lock) {
    try {
      rmSync(lock);
    } catch {
      // A stale lock ends by itself after LOCK_TTL_MS.
    }
  }
}
process.exit(0);
