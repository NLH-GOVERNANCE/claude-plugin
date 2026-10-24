// The push of autopush-hook.mjs (ticket eca924c5), run in the background for one repo folder. The steps are in
// runAutoPush (autopush.mjs): read the facts, ask the local gate (gate/hook.mjs) about exactly that commit, read the facts
// again, push `<sha>:refs/heads/<branch>` with the id that was checked. The gate says no, nothing is pushed. One quiet line
// in autopush.log per try; a network error or a refusal is not retried here, the next commit pushes the branch again.
// Never a force push. Always exits 0.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateCommand, redact, runAutoPush } from './autopush.mjs';
import { repoFacts } from './autopush-git.mjs';

const dir = process.env.NLH_AUTOPUSH_DIR || join(homedir(), '.tinh-nlh', 'autopush');
const gateHook = fileURLToPath(new URL('../gate/hook.mjs', import.meta.url));
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

// The gate, as for a push typed by hand, about exactly the checked commit. A deny stops the push; the gate failing
// itself lets it run, as the gate does.
function gate(facts) {
  const result = spawnSync(process.execPath, [gateHook], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: facts.root, tool_input: { command: gateCommand(facts.sha, facts.branch) } }),
    encoding: 'utf8',
    timeout: 280_000,
    windowsHide: true,
  });
  return { denied: /"permissionDecision":\s*"deny"/.test(result.stdout ?? '') };
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
  if (root) {
    mkdirSync(dir, { recursive: true });
    const first = repoFacts(root);
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
      runAutoPush(root, { env: process.env, facts: repoFacts, gate, push, afterPush, log });
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
