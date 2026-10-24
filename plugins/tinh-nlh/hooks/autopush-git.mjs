// Auto-push, the git side (ticket eca924c5): reads the facts decideAutoPush needs from one repo folder. Read-only git,
// no network. Any git failure gives null, and the caller does not push (fail closed).
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const MAX_PATCH = 20 * 1024 * 1024;

function git(dir, args, maxBuffer = 1024 * 1024) {
  try {
    // Run from the home folder with -C: on Windows a git.exe inside the repo would be found before PATH.
    return execFileSync('git', ['-C', dir, '-c', 'core.quotepath=off', ...args], {
      cwd: homedir(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
      maxBuffer,
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

// Facts of the repo at `dir`: top folder, current branch, origin urls, and what the commits not yet on any origin branch
// hold (file names, patch). Those commits all go out with the next push, so they are all checked, not only the last one.
export function repoFacts(dir) {
  const root = git(dir, ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  const branch = git(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const remoteUrl = git(root, ['remote', 'get-url', 'origin']);
  const pushUrl = git(root, ['remote', 'get-url', '--push', 'origin']);
  const names = git(root, ['log', '--format=', '--name-only', '--no-renames', 'HEAD', '--not', '--remotes=origin']);
  const patch = git(root, ['log', '--format=', '-p', '--no-color', '--no-renames', 'HEAD', '--not', '--remotes=origin'], MAX_PATCH);
  if (branch === null || remoteUrl === null || pushUrl === null || names === null || patch === null) return null;
  return { root, branch, remoteUrl, pushUrl, names: names.split('\n').filter(Boolean), patch };
}
