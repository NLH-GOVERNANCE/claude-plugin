// SessionStart hook of plugin nlh, self-update part (28/10, 26f86f3d: a laptop never got the new version without the person
// closing Claude for good). Two jobs, no question to the user, no command for the user:
// 1. A newer version of this plugin is already downloaded (installed_plugins.json is ahead of the running plugin.json):
//    tell Claude to say, once per version, the one click that makes it start (a new session is not enough in the Claude app:
//    only quitting the app from its tray icon reloads plugins).
// 2. Nothing newer is downloaded yet: fetch it in the background (claude plugin marketplace update, claude plugin update),
//    at most every 6 hours, so the next time the person quits Claude the new version is there.
// Failures are silent; the files are ~/.tinh-nlh/self-update.json and ~/.claude/plugins/installed_plugins.json.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN = 'nlh@nlh-governance';
export const MARKETPLACE = 'nlh-governance';
export const TRY_GAP_MS = 6 * 60 * 60 * 1000;

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

// The click that restarts Claude for good, in words a person who does not know computers can follow.
export function restartSentence(platform = process.platform) {
  if (platform === 'win32') return 'bấm chuột phải vào biểu tượng Claude ở góc phải dưới màn hình (có thể nằm trong mũi tên ^), chọn Thoát, rồi mở lại Claude';
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
  if (installed && newer(installed, running)) {
    if (state.told === installed) return { line: '', state, fetch: false };
    const line = `Nếp ${installed} is downloaded but this session still runs ${running}. After doing what the user asked, say exactly one sentence: "Nếp có bản mới rồi. Để dùng bản mới, bạn ${restartSentence(platform)}." (say it in the user's own form of address, no other words, no command, no /reload-plugins, no question).\n`;
    return { line, state: { ...state, told: installed }, fetch: false };
  }
  if (!claude || now - (state.tried ?? 0) < TRY_GAP_MS) return { line: '', state, fetch: false };
  return { line: '', state: { ...state, tried: now }, fetch: true };
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
  if (result.state !== state) writeState(file, result.state);
  if (result.fetch) fetchInBackground(claude);
  if (result.line) write(result.line);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
