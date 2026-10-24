// Auto-push, the git side (ticket eca924c5): reads the facts decideAutoPush needs from one repo folder. Read-only git.
// Any failure to read the repo, the branch, the commit or a remote url gives null and the caller does not push (fail
// closed). A patch that cannot be read in full gives scanFailed: the caller does not push and says so.
//
// Two kinds of facts:
//  - repoFacts: local only, no network. The boundary of the scan is the remote-tracking refs of origin, which anyone can
//    edit locally, so this is good for a first look (the hook uses it to tell Claude early), never to push.
//  - pushFacts: the boundary is what the push target really has (git ls-remote of the checked url), so the scan covers
//    the commits the target does not have. The remote cannot be read (offline, slow, refused): no push.
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { allowedRemote } from './autopush.mjs';

export const MAX_PATCH = 20 * 1024 * 1024;
const LS_REMOTE_TIMEOUT_MS = 25_000;

function git(dir, args, maxBuffer = 1024 * 1024, input) {
  try {
    // Run from the home folder with -C: on Windows a git.exe inside the repo would be found before PATH.
    return execFileSync('git', ['-C', dir, '-c', 'core.quotepath=off', ...args], {
      cwd: homedir(),
      encoding: 'utf8',
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
      timeout: 60_000,
      maxBuffer,
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

const lines = (text) => (text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

// Does the effective git config (system, global, repo, environment) rewrite urls (url.*.insteadOf, pushInsteadOf)? Then
// the place git pushes to may differ from the url that was checked, so nothing is pushed. A failure to ask counts as yes.
export function hasUrlRewrites(root) {
  const result = spawnSync('git', ['-C', root, 'config', '--get-regexp', '^url\\.'], { cwd: homedir(), encoding: 'utf8', timeout: 20_000, windowsHide: true });
  if (result.error) return true;
  return result.status !== 1;
}

// Facts of the repo at `dir`: top folder, current branch, the checked commit (HEAD now), every fetch and push url of
// origin (--all: a remote can have several), whether url rewrite rules exist, and what the commits to scan hold: file
// names (deleted and renamed paths too, NUL separated) and the patch read as text (--text: binary files too; -m: a merge
// commit shows what it changed against each parent; no external diff or textconv).
// Options: maxPatch (bytes), scan (false: skip the scan), exclude (commit ids the target already has: the scan is the
// commits of HEAD that are not reachable from them; absent: not reachable from the remote-tracking refs of origin).
export function repoFacts(dir, { maxPatch = MAX_PATCH, scan = true, exclude } = {}) {
  const root = git(dir, ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  const branch = git(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const sha = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  const remoteUrls = git(root, ['remote', 'get-url', '--all', 'origin']);
  const pushUrls = git(root, ['remote', 'get-url', '--all', '--push', 'origin']);
  if (!branch || !sha || remoteUrls === null || pushUrls === null) return null;
  const facts = { root, branch, sha, remoteUrls: lines(remoteUrls), pushUrls: lines(pushUrls), urlRewrites: hasUrlRewrites(root), names: [], patch: '', scanFailed: false };
  if (!scan) return facts;
  const base = ['log', '--format=', '-m', '--no-renames', '--text', '--no-ext-diff', '--no-textconv', '--no-color'];
  // Excluded ids go through stdin: a remote with thousands of refs does not fit on a command line.
  const [revs, input] = exclude ? [['--stdin'], `${sha}\n${exclude.map((id) => `^${id}`).join('\n')}\n`] : [[sha, '--not', '--remotes=origin'], undefined];
  const names = git(root, [...base, '--name-only', '-z', ...revs], maxPatch, input);
  const patch = git(root, [...base, '-p', ...revs], maxPatch, input);
  return {
    ...facts,
    names: (names ?? '').split('\0').map((name) => name.trim()).filter(Boolean),
    patch: patch ?? '',
    // A binary patch git did not print as text cannot be read: the same as a patch too large to read.
    scanFailed: names === null || patch === null || /^(Binary files .* differ|GIT binary patch)$/m.test(patch ?? ''),
  };
}

// Commit ids the push target has (git ls-remote of the checked url), or null when it cannot be read in time.
export function lsRemote(url) {
  const result = spawnSync('git', ['ls-remote', url], {
    cwd: homedir(),
    encoding: 'utf8',
    timeout: LS_REMOTE_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  if (result.error || result.status !== 0) return null;
  return [...new Set(lines(result.stdout).map((line) => line.split(/\s+/)[0]).filter((id) => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(id)))];
}

// Of those ids, the ones this repo has as commits (an id the repo does not have cannot be excluded from a log).
function knownCommits(root, ids) {
  if (!ids.length) return [];
  const out = git(root, ['cat-file', '--batch-check'], 64 * 1024 * 1024, `${ids.map((id) => `${id}^{commit}`).join('\n')}\n`);
  if (out === null) return null;
  return lines(out).filter((line) => /^[0-9a-f]+ commit /.test(line)).map((line) => line.split(' ')[0]);
}

// Facts to push on: the scan covers every commit of HEAD that the push target does not have, by what the target says
// (ls-remote of the one checked url), not by the local remote-tracking refs. deps.lsRemote is replaceable for a test.
// Anything that cannot be read in time or in full: remoteUnreadable or scanFailed, and decideAutoPush says no.
export function pushFacts(dir, { lsRemote: ask = lsRemote, maxPatch = MAX_PATCH } = {}) {
  const first = repoFacts(dir, { scan: false });
  if (!first) return null;
  const url = first.pushUrls[0];
  // A url that is not allowed, a second url, or a rewrite rule: decideAutoPush refuses, no network needed.
  if (first.pushUrls.length !== 1 || first.remoteUrls.length !== 1 || first.urlRewrites || !allowedRemote(url)) return first;
  const ids = ask(url);
  const known = ids === null ? null : knownCommits(first.root, ids);
  if (known === null) return { ...first, remoteUnreadable: true };
  const facts = repoFacts(dir, { maxPatch, exclude: known });
  return facts ?? { ...first, remoteUnreadable: true };
}
