// PostToolUse hook of plugin nlh (ticket eca924c5): after a Bash or PowerShell `git commit` on a work branch of our
// organisations, push the branch to origin in the background, so a machine that turns off loses no work. The decision
// is in autopush.mjs. This hook never blocks and never fails: any error, it does nothing and exits 0. Off by default: it
// runs only on a machine that sets NLH_AUTOPUSH to exactly "1" (CTO, eca924c5; claude-plugin#59 review): anything else and
// it runs no git, no network, no log.
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoPushOn, commitDirs, decideAutoPush } from './autopush.mjs';
import { repoFacts } from './autopush-git.mjs';

const worker = fileURLToPath(new URL('./autopush-worker.mjs', import.meta.url));

try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  const command = String(input.tool_input?.command ?? '');
  const dirs =
    input.hook_event_name === 'PostToolUse' && /^(Bash|PowerShell)$/.test(String(input.tool_name ?? '')) && autoPushOn(process.env)
      ? commitDirs(command, input.cwd || process.cwd(), (from, to) => resolve(from, to.replace(/^~(?=$|[\\/])/, homedir())))
      : [];
  const notices = [];
  const pushed = new Set();
  for (const dir of dirs) {
    const facts = repoFacts(dir);
    if (!facts || pushed.has(facts.root)) continue;
    const decision = decideAutoPush({ env: process.env, ...facts });
    if (decision.notice) notices.push(decision.notice);
    if (!decision.push) continue;
    pushed.add(facts.root);
    if (process.env.NLH_AUTOPUSH_SYNC === '1') {
      spawnSync(process.execPath, [worker, facts.root], { stdio: 'ignore', windowsHide: true });
    } else {
      // Detached: the push (the gate check, the network) never holds the session up.
      spawn(process.execPath, [worker, facts.root], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
  }
  if (notices.length) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notices.join('\n') } }));
  }
} catch {
  // A hook that fails must not hurt the session.
}
process.exit(0);
