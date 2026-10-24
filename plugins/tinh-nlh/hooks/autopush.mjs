// Auto-push after a commit (ticket eca924c5): pure decisions, no git, no network, no files. autopush-hook.mjs collects
// the facts and calls these; autopush-worker.mjs runs the push. The rule: a commit on a work branch of our own
// organisations goes to origin at once, so a machine that turns off loses no work. Never a force push, never a base
// branch, never when the commits waiting to be pushed hold something that looks like a secret.
import { gitOps } from '../gate/checks.mjs';

// Organisations whose repos may be pushed to (allow list, exact names). Other owners: never.
export const PUSH_OWNERS = ['NLH-OS', 'NLH-GOVERNANCE', 'NLH-NEDU-CORE'];

const PROTECTED_BRANCH = /^(dev|main|master|HEAD)$|^(release|hotfix)\//i;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

// owner/repo of a GitHub remote url when the owner is on the allow list, else null.
export function allowedRemote(url) {
  const match = String(url ?? '').trim().match(/^(?:https:\/\/(?:[^/@\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  const owner = PUSH_OWNERS.find((name) => name.toLowerCase() === match[1].toLowerCase());
  return owner ? `${owner}/${match[2]}` : null;
}

export const isProtectedBranch = (branch) => !branch || PROTECTED_BRANCH.test(branch) || !SAFE_BRANCH.test(branch) || branch.includes('..');

// Folders where the command ran `git commit` (after cd / git -C). `join` resolves a folder against the current one.
export function commitDirs(line, cwd, join) {
  if (!/\bgit(\.exe)?\b/i.test(line) || !/\bcommit\b/.test(line)) return [];
  return [...new Set(gitOps(line, cwd, join).filter((op) => op.op === 'commit').map((op) => op.dir))];
}

// Secrets: names of files, and added lines. The key patterns are built from parts so this file does not match itself.
const SECRET_NAME = [
  /^\.env(?!.*\.(example|sample|template)$)(\.|$)/i,
  /\.(pem|p12|pfx|ppk|jks|keystore)$/i,
  /key/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /token/i,
];
const SECRET_LINE = [
  new RegExp(`AGE-SECRET${'-'}KEY-`),
  new RegExp(`gh[pousr]${'_'}[A-Za-z0-9]{20,}`),
  new RegExp(`github${'_'}pat_[A-Za-z0-9_]{20,}`),
  new RegExp(`xox[abposr]${'-'}[A-Za-z0-9-]{10,}`),
  new RegExp(`-----BEGIN [A-Z ]*PRIVATE ${'KEY'}-----`),
];

// Names of files in the commits waiting to be pushed, and their patch text. Findings name a file or a kind, never the value.
export function secretFindings({ names = [], patch = '' }) {
  const found = [];
  for (const name of names) {
    const base = String(name).split('/').pop();
    if (SECRET_NAME.some((pattern) => pattern.test(base))) found.push(`file ${name}`);
  }
  const added = String(patch).split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  if (added.some((line) => SECRET_LINE.some((pattern) => pattern.test(line)))) found.push('a line that looks like a key');
  return found;
}

// The command that pushes: current branch to the same name on origin, upstream set. No force flag, no + refspec.
export const pushArgs = (root) => ['-C', root, 'push', '-u', 'origin', 'HEAD'];

// Last guard before spawning: only the exact shape pushArgs makes.
export function isSafePushArgs(args) {
  return (
    args.length === 6 &&
    args[0] === '-C' &&
    args[2] === 'push' &&
    args[3] === '-u' &&
    args[4] === 'origin' &&
    args[5] === 'HEAD' &&
    !args.some((arg, i) => i !== 1 && (/^--?f/.test(arg) || /^--force/.test(arg) || arg.startsWith('+')))
  );
}

// Facts: { env, isCommit, branch, remoteUrl, pushUrl, names, patch }. Returns { push, reason, notice }:
// notice is the one line for Claude, only when a secret stopped the push; every other "no" is silent.
export function decideAutoPush({ env = {}, isCommit = true, branch, remoteUrl, pushUrl = remoteUrl, names = [], patch = '' }) {
  if (String(env.NLH_AUTOPUSH ?? '').trim() === '0') return { push: false, reason: 'off' };
  if (!isCommit) return { push: false, reason: 'not-a-commit' };
  if (isProtectedBranch(branch)) return { push: false, reason: 'protected-branch' };
  const repo = allowedRemote(remoteUrl);
  if (!repo || !allowedRemote(pushUrl)) return { push: false, reason: 'remote-not-allowed' };
  const found = secretFindings({ names, patch });
  if (found.length) {
    return { push: false, reason: 'secret', notice: `Nếp did not auto-push ${branch}: the commits waiting to be pushed hold ${found.slice(0, 3).join(', ')}. Check, then push by hand.` };
  }
  return { push: true, reason: 'ok', repo };
}

// Strip credentials from a line of git output before it is logged.
export const redact = (text) =>
  String(text ?? '')
    .replace(/:\/\/[^@/\s]+@/g, '://***@')
    .replace(new RegExp(`(gh[pousr]${'_'}|github${'_'}pat_|xox[abposr]${'-'})[A-Za-z0-9_-]+`, 'g'), '$1***')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 160);
