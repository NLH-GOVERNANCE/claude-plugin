// SessionStart hook of plugin nlh: Loa starts with the plugin (29/10, 0f936d79). No setup script, same on Windows and macOS.
// Before: Loa needed setup.ps1 (PowerShell, Windows only), and died after a plugin rename until the script ran again.
// Now each session start does, silently, no question and no command for the user:
// 1. Put the Loa files of this very plugin (CLAUDE_PLUGIN_ROOT, whatever the plugin is called) in ~/.tinh-nlh/speaker, the
//    fixed place the launchers and the login start use. Never goes back to an older version.
// 2. Open Loa when none runs: Windows `loa.vbs login` (hidden; the login start is made again once per plugin version),
//    macOS `open -a Terminal start.sh`. The launcher itself asks the person for the one "Cho phép" button the first time.
// Never inside Loa's own session (NLH_TOWER=1). At most one open per 10 minutes, because the app starts many sessions.
// setup.ps1 and setup.sh stay for old machines and are no longer needed. Failures are silent.
// State: ~/.tinh-nlh/loa-boot.json. macOS is not tried on a real Mac yet.
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPEN_GAP_MS = 10 * 60 * 1000;
export const FILES = {
  win32: ['speaker.mjs', 'pair.mjs', 'policy.mjs', 'prepare.mjs', 'toast.ps1', 'loa.vbs', 'start.ps1'],
  darwin: ['speaker.mjs', 'pair.mjs', 'policy.mjs', 'start.sh'],
};

const parts = (version) => String(version ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);
const olderThan = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};
const sameFile = (a, b) => {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
};
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) ?? {};
  } catch {
    return {};
  }
};

// Copy the Loa files of this plugin to dir. A new file is written next to the old one and renamed over it, so a launcher
// that is reading the old one never sees half a file. Returns true when the machine now has this plugin's Loa.
export function installLoa({ root, dir, platform = process.platform, version }) {
  const names = FILES[platform];
  if (!names || !version) return false;
  try {
    const have = existsSync(join(dir, 'version.txt')) ? readFileSync(join(dir, 'version.txt'), 'utf8').trim() : '';
    if (have && olderThan(version, have)) return true; // a newer Loa is already there: never go back
    mkdirSync(dir, { recursive: true });
    for (const name of names) {
      const from = join(root, 'speaker', name);
      const to = join(dir, name);
      if (!existsSync(from)) return false;
      if (sameFile(from, to)) continue;
      const temp = `${to}.new`;
      try {
        copyFileSync(from, temp);
        renameSync(temp, to);
      } catch {
        rmSync(temp, { force: true });
        return false;
      }
    }
    if (platform !== 'win32') chmodSync(join(dir, 'start.sh'), 0o755);
    if (have !== version) writeFileSync(join(dir, 'version.txt'), `${version}\n`);
    return true;
  } catch {
    return false;
  }
}

// Is a Loa alive here? The Loa server writes its pid to tower.lock while it runs (speaker.mjs takeLock).
export function loaRunning(dir, kill = process.kill) {
  try {
    const pid = Number(readFileSync(join(dir, 'tower.lock'), 'utf8'));
    if (!pid) return false;
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

// The command that opens Loa on this system, or null.
export function openCommand({ dir, platform, env, registerLogin }) {
  if (platform === 'win32') {
    const system = join(env.SystemRoot || 'C:\\Windows', 'System32');
    const register = registerLogin ? `"${join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${join(dir, 'start.ps1')}" -RegisterOnly & ` : '';
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${register}"${join(system, 'wscript.exe')}" "${join(dir, 'loa.vbs')}" login"`], options: { windowsVerbatimArguments: true } };
  }
  if (platform === 'darwin') return { file: '/usr/bin/open', args: ['-a', 'Terminal', join(dir, 'start.sh')], options: {} };
  return null;
}

// One start. state: { openedAt, loginFor }. Returns { state, started }.
export function bootLoa({ root, version, home = homedir(), env = process.env, platform = process.platform, state = {}, now = Date.now(), running = loaRunning, spawnFn = spawn }) {
  if (!FILES[platform] || env.NLH_TOWER === '1') return { state, started: false };
  const dir = join(home, '.tinh-nlh', 'speaker');
  if (!installLoa({ root, dir, platform, version })) return { state, started: false };
  if (running(dir) || now - (state.openedAt ?? 0) < OPEN_GAP_MS) return { state, started: false };
  const command = openCommand({ dir, platform, env, registerLogin: platform === 'win32' && state.loginFor !== version });
  try {
    const child = spawnFn(command.file, command.args, { detached: true, stdio: 'ignore', windowsHide: true, ...command.options });
    child.on?.('error', () => {});
    child.unref?.();
    return { state: { ...state, openedAt: now, ...(platform === 'win32' ? { loginFor: version } : {}) }, started: true };
  } catch {
    return { state, started: false };
  }
}

export function main(env = process.env) {
  const root = env.CLAUDE_PLUGIN_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
  const version = readJson(join(root, '.claude-plugin', 'plugin.json')).version;
  const file = join(env.NLH_MACHINE_DIR || join(homedir(), '.tinh-nlh'), 'loa-boot.json');
  const state = readJson(file);
  const result = bootLoa({ root, version, env, state });
  if (result.state !== state) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(result.state));
    } catch {
      // Not saving only means one more try next session.
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
