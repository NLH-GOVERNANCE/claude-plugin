// SessionStart hook of plugin nlh, self-update part (28/10, 26f86f3d: a laptop never got the new version without the person
// closing Claude for good). Two jobs, no question to the user, no command for the user:
// 1. A newer version of this plugin is already downloaded (installed_plugins.json is ahead of the running plugin.json):
//    tell Claude to say, once per version, the one click that makes it start (a new session is not enough in the Claude app:
//    only quitting the app from its tray icon reloads plugins).
// 2. Nothing newer is downloaded yet: fetch it in the background (claude plugin marketplace update, claude plugin update),
//    at most every 6 hours, so the next time the person quits Claude the new version is there.
// 29/10 (1cbe0ab5, old versions failing on members' machines): three more jobs, still no question and no command for the user:
// 3. Claude never runs update commands itself (in the Claude app all three failed and printed English progress): every session
//    starts with one status line, and "update Nếp" is answered from it.
// 4. The marketplace is switched to auto-update (known_marketplaces.json), so the Claude app fetches new versions when it opens.
// 5. Windows: Loa (when set up on this machine) is started and its login start is made again, so it comes back after a restart
//    even when the plugin was upgraded without running setup.
// Failures are silent; the files are ~/.tinh-nlh/self-update.json and ~/.claude/plugins/installed_plugins.json.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN = 'nlh@nlh-governance';
export const MARKETPLACE = 'nlh-governance';
export const TRY_GAP_MS = 60 * 60 * 1000;

const parts = (version) => String(version ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);

// Is version a newer than version b ("0.25.6" > "0.25.5")?
export function newer(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

// The version of this plugin that is downloaded (the user-scope entry of installed_plugins.json), or null.
export function installedVersion(home = homedir()) {
  try {
    const list = JSON.parse(readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    const entries = list?.plugins?.[PLUGIN] ?? list?.[PLUGIN] ?? [];
    const versions = entries.map((entry) => String(entry?.version ?? '')).filter(Boolean);
    return versions.sort((a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0))[0] ?? null;
  } catch {
    return null;
  }
}

// Switch the marketplace to auto-update when it is not (Claude then downloads new versions every time the app opens).
// Only the one key of this marketplace is touched; a file that cannot be read or has no such entry is left alone.
export function ensureAutoUpdate(home = homedir()) {
  try {
    const file = join(home, '.claude', 'plugins', 'known_marketplaces.json');
    const list = JSON.parse(readFileSync(file, 'utf8'));
    if (!list?.[MARKETPLACE] || list[MARKETPLACE].autoUpdate === true) return false;
    list[MARKETPLACE].autoUpdate = true;
    writeFileSync(file, JSON.stringify(list, null, 2));
    return true;
  } catch {
    return false;
  }
}

// Windows: make the login start of Loa again (once per plugin version) and start Loa (a second one ends by itself).
// Only where Loa was set up on this machine (its key and launcher exist); never inside Loa's own session.
export function ensureLoa({ home = homedir(), env = process.env, platform = process.platform, running, state, spawnFn = spawn }) {
  if (platform !== 'win32' || env.NLH_TOWER === '1') return { state, started: false };
  const dir = join(home, '.tinh-nlh', 'speaker');
  if (!existsSync(join(dir, 'tower-key.dpapi')) || !existsSync(join(dir, 'loa.vbs')) || !existsSync(join(dir, 'start.ps1'))) return { state, started: false };
  const system = join(env.SystemRoot || 'C:\\Windows', 'System32');
  const register = state.loginFor === running ? '' : `"${join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${join(dir, 'start.ps1')}" -RegisterOnly & `;
  const script = `${register}"${join(system, 'wscript.exe')}" "${join(dir, 'loa.vbs')}" login`;
  try {
    const child = spawnFn('cmd.exe', ['/d', '/s', '/c', `"${script}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
    child.on?.('error', () => {});
    child.unref?.();
    return { state: { ...state, loginFor: running }, started: true };
  } catch {
    return { state, started: false };
  }
}

// The click that restarts Claude for good, in words a person who does not know computers can follow.
export function restartSentence(platform = process.platform) {
  if (platform === 'win32') return 'bấm chuột phải vào biểu tượng Claude ở góc phải dưới màn hình (có thể nằm trong mũi tên ^), chọn Thoát (hay Exit), rồi mở lại Claude; bấm X chỉ ẩn Claude xuống khay, chưa mở lại được';
  if (platform === 'darwin') return 'bấm Claude trên thanh menu trên cùng, chọn Thoát Claude, rồi mở lại Claude';
  return 'đóng hẳn Claude (không chỉ đóng cửa sổ) rồi mở lại';
}

const readState = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) ?? {};
  } catch {
    return {};
  }
};
const writeState = (file, state) => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state));
  } catch {
    // Not saving only means asking again next session.
  }
};

// Run both commands one after the other in a hidden background process; nothing waits for them.
export function fetchInBackground(claude, spawnFn = spawn) {
  const run = (args) => `"${claude}" ${args}`;
  const script = `${run(`plugin marketplace update ${MARKETPLACE}`)} && ${run(`plugin update ${PLUGIN}`)}`;
  try {
    const child = spawnFn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', process.platform === 'win32' ? ['/d', '/s', '/c', `"${script}"`] : ['-c', script], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
    child.on?.('error', () => {});
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}

// What the hook prints (a line for Claude, or ''), and whether it started a download. now: ms.
export function decide({ running, installed, state, claude, now, platform = process.platform }) {
  if (!running) return { line: '', state, fetch: false };
  const waiting = installed && newer(installed, running);
  const fetch = !waiting && Boolean(claude) && now - (state.tried ?? 0) >= TRY_GAP_MS;
  const status = waiting
    ? `Nếp update: ${installed} is downloaded, this session runs ${running}. If the user asks to update Nếp: run no command, show no progress, say only: "Nếp có bản mới rồi. Để dùng bản mới, bạn ${restartSentence(platform)}." (in their own form of address).\n`
    : `Nếp update: this session runs ${running}, the newest downloaded is ${installed && newer(installed, running) ? installed : running}; a check for a newer one runs by itself in the background. If the user asks to update Nếp: run no command, show no progress, say only: "Nếp đã là bản mới nhất." (in their own form of address).\n`;
  if (waiting) {
    if (state.told === installed) return { line: status, state, fetch: false };
    const line = `Nếp ${installed} is downloaded but this session still runs ${running}. After doing what the user asked, say exactly one sentence: "Nếp có bản mới rồi. Để dùng bản mới, bạn ${restartSentence(platform)}." (say it in the user's own form of address, no other words, no command, no /reload-plugins, no question).\n${status}`;
    return { line, state: { ...state, told: installed }, fetch: false };
  }
  return { line: status, state: fetch ? { ...state, tried: now } : state, fetch };
}

export function main(env = process.env, write = (text) => process.stdout.write(text)) {
  const root = env.CLAUDE_PLUGIN_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
  let running = null;
  try {
    running = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null;
  } catch {
    return;
  }
  const file = join(env.NLH_MACHINE_DIR || join(homedir(), '.tinh-nlh'), 'self-update.json');
  const claude = env.CLAUDE_CODE_EXECPATH && existsSync(env.CLAUDE_CODE_EXECPATH) ? env.CLAUDE_CODE_EXECPATH : '';
  const state = readState(file);
  const result = decide({ running, installed: installedVersion(), state, claude, now: Date.now() });
  const loa = ensureLoa({ env, running, state: result.state });
  ensureAutoUpdate();
  if (loa.state !== state) writeState(file, loa.state);
  if (result.fetch) fetchInBackground(claude);
  if (result.line) write(result.line);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
