// Auto-push, the git side (ticket eca924c5): reads the facts decideAutoPush needs from one repo folder. Read-only git,
// no network. Any failure to read the repo, the branch, the commit or a remote url gives null and the caller does not
// push (fail closed). A patch that cannot be read in full gives scanFailed: the caller does not push and says so.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

export const MAX_PATCH = 20 * 1024 * 1024;

function git(dir, args, maxBuffer = 1024 * 1024) {
  try {
    // Run from the home folder with -C: on Windows a git.exe inside the repo would be found before PATH.
    return execFileSync('git', ['-C', dir, '-c', 'core.quotepath=off', ...args], {
      cwd: homedir(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
      maxBuffer,
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

const lines = (text) => (text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

// Facts of the repo at `dir`: top folder, current branch, the checked commit (HEAD now), every fetch and push url of
// origin (--all: a remote can have several, and insteadOf rules are already applied by get-url), and what the commits not
// yet on any origin branch hold: file names (deleted and renamed paths too, NUL separated) and the patch read as text
// (--text: binary files too; -m: a merge commit shows what it changed against each parent; no external diff or textconv).
// Those commits all go out with the next push, so they are all read, not only the last one.
export function repoFacts(dir, maxPatch = MAX_PATCH) {
  const root = git(dir, ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  const branch = git(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const sha = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  const remoteUrls = git(root, ['remote', 'get-url', '--all', 'origin']);
  const pushUrls = git(root, ['remote', 'get-url', '--all', '--push', 'origin']);
  if (!branch || !sha || remoteUrls === null || pushUrls === null) return null;
  const range = ['--not', '--remotes=origin'];
  const common = ['log', '--format=', '-m', '--no-renames', '--text', '--no-ext-diff', '--no-textconv', '--no-color', sha];
  const names = git(root, [...common, '--name-only', '-z', ...range], maxPatch);
  const patch = git(root, [...common, '-p', ...range], maxPatch);
  return {
    root,
    branch,
    sha,
    remoteUrls: lines(remoteUrls),
    pushUrls: lines(pushUrls),
    names: (names ?? '').split('\0').map((name) => name.trim()).filter(Boolean),
    patch: patch ?? '',
    // A binary patch git did not print as text cannot be read: the same as a patch too large to read.
    scanFailed: names === null || patch === null || /^(Binary files .* differ|GIT binary patch)$/m.test(patch ?? ''),
  };
}
