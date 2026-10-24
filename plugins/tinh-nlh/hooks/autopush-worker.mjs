// The push of autopush-hook.mjs (ticket eca924c5), run in the background: `git push -u origin HEAD` for one repo folder.
// It asks the local gate (gate/hook.mjs) first, as for a push by hand: the gate says no, nothing is pushed. It checks the
// facts again (the branch may have changed since the hook ran). One quiet line in autopush.log per try; a network error
// or a refusal is not retried here, the next commit pushes the branch again. Never a force push. Always exits 0.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideAutoPush, isSafePushArgs, pushArgs, redact } from './autopush.mjs';
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

let lock = null;
try {
  const root = process.argv[2];
  const facts = root ? repoFacts(root) : null;
  const decision = facts ? decideAutoPush({ env: process.env, ...facts }) : { push: false, reason: 'no-facts' };
  if (decision.push) {
    mkdirSync(dir, { recursive: true });
    const lockFile = join(dir, `${Buffer.from(facts.root).toString('hex').slice(-40)}.lock`);
    let busy = false;
    try {
      busy = Date.now() - statSync(lockFile).mtimeMs < LOCK_TTL_MS;
    } catch {
      busy = false;
    }
    if (!busy) {
      lock = lockFile;
      writeFileSync(lock, String(process.pid));
      // The gate, as for a push typed by hand (with the branch name: the gate reads a literal HEAD as a branch called HEAD). A deny stops the push; the gate failing itself lets it run, as the gate does.
      const gate = spawnSync(process.execPath, [gateHook], {
        input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: facts.root, tool_input: { command: `git push -u origin ${facts.branch}` } }),
        encoding: 'utf8',
        timeout: 280_000,
        windowsHide: true,
      });
      const args = pushArgs(facts.root);
      if (/"permissionDecision":\s*"deny"/.test(gate.stdout ?? '')) {
        log(`${decision.repo} ${facts.branch} gate said no: not pushed`);
      } else if (!isSafePushArgs(args)) {
        log(`${decision.repo} ${facts.branch} refused: unsafe push command`);
      } else {
        const result = spawnSync('git', args, {
          cwd: homedir(),
          encoding: 'utf8',
          timeout: 120_000,
          windowsHide: true,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
        });
        if (result.status === 0) {
          log(`${decision.repo} ${facts.branch} pushed`);
        } else {
          const last = `${result.stderr ?? ''}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? (result.error ? 'git did not run' : 'no message');
          log(`${decision.repo} ${facts.branch} push failed (retry at next commit): ${last}`);
        }
      }
    }
  } else if (decision.reason === 'secret') {
    log(`${facts.branch} not pushed: secret pattern`);
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
