// Loa Làng starts with the plugin (ticket 0f936d79, 23/10). No setup script, no desktop icon, the same on Windows and macOS.
//
// Why a background session and not the channel: a channel only registers when the session was opened with
// --channels or --dangerously-load-development-channels, and the second asks a question at every start; a plugin cannot
// turn either on, and a background session ignores them (tried on Claude Code 2.1.309). What a plugin can do alone:
// - its MCP server `speaker` runs in every session that loads the plugin (it was always loaded, inert without NLH_TOWER);
// - a plugin monitor starts a process in a session and every line it prints wakes that session, even an idle
//   background one (tried), and SendMessage reaches another session by name (tried).
// So: the first session of the day that finds a Loa key and no Loa running opens one background session named
// "Loa Làng" (`claude --bg`). Its settings carry NLH_TOWER=1 and NLH_LOA=monitor, so the plugin's own server becomes the
// reader of the hub feed and writes what the old channel pushed into a file (loa-outbox.jsonl); the plugin monitor
// `loa` (speaker/watch.mjs) prints those lines, and the skill speaker-loop turns each into a SendMessage. No tokens are
// spent while nothing arrives. The old launcher (start.ps1, start.sh, a window with the channel flag) keeps working
// and still wins the one-Loa-per-machine lock when it is already open.
//
// This file holds the decisions as small functions, so tests drive them without a Claude: where claude is, whether a
// key exists, whether a Loa runs, what to start, whether a newer plugin version means Loa should restart.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOA_NAME = 'Loa Làng';
// The session name before 23/10 counts as Loa too, so an old Loa window is never doubled.
export const LOA_NAMES = [LOA_NAME, 'Loa tỉnh NhiLe'];
export const OUTBOX_FILE = 'loa-outbox.jsonl';
export const KEY_FILE = 'tower-key.dpapi';
// Same service and account the launcher saves and speaker.mjs reads.
export const KEYCHAIN = { service: 'tinh-nlh-tower', account: 'tinh-nlh' };
export const TOWER_KEY = /^nlh_tower_[0-9a-f]{64}$/;
export const PLUGIN = 'nlh';
export const MARKETPLACE = 'nlh-governance';
// A session Loa opens is a normal session: without the Loa variables it neither starts its own Loa nor holds the lock.
// The key variables too: a session Loa opens must never carry the Loa key in its environment (the Loa session's own server
// reads the key from the plugin setting, DPAPI or the Keychain).
export const KEY_ENV = ['TOWER_KEY', 'TOWER_KEY_FILE'];
export const TOWER_ENV = ['NLH_TOWER', 'NLH_TOWER_DIR', 'NLH_TOWER_WORK', 'NLH_LOA', ...KEY_ENV];
export const childEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([key]) => !TOWER_ENV.includes(key)));
// The restart is not a Loa itself (ensureLoa would answer 'is-loa'), but it keeps where this Loa lives and works.
export const restartEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([key]) => key !== 'NLH_TOWER' && key !== 'NLH_LOA' && !KEY_ENV.includes(key)));

// The launch lock stops many sessions that start together from opening several Loa.
export const LAUNCH_LOCK_MS = 3 * 60 * 1000;
// A new plugin version restarts Loa only when it has been quiet this long and nothing waits for a SendMessage.
export const IDLE_MS = 60 * 1000;

export const loaDir = (env = process.env, home = homedir()) => env.NLH_TOWER_DIR || join(home, '.tinh-nlh', 'speaker');
export const workDir = (env = process.env, home = homedir()) => env.NLH_TOWER_WORK || join(home, 'TinhNhiLe');
export const configDir = (env = process.env, home = homedir()) => env.CLAUDE_CONFIG_DIR || join(home, '.claude');

// Where claude is, best first: what Loa was told, the binary running this very session (the Claude app brings its own,
// in a folder that changes with every app update), the official installer's place. Else the PATH name.
export function claudeCandidates({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const exe = platform === 'win32' ? 'claude.exe' : 'claude';
  return [env.CLAUDE_BIN, env.CLAUDE_CODE_EXECPATH, join(home, '.local', 'bin', exe)].filter(Boolean);
}
export const findClaude = (options = {}, exists = existsSync) => claudeCandidates(options).find((path) => exists(path)) ?? 'claude';

// Is there a key for Loa? Never opens it: the plugin setting (TOWER_KEY, filled from the plugin's own settings), the
// DPAPI file the old launcher saved (Windows), or the Keychain item (macOS).
export function hasKey({ env = process.env, dir = loaDir(env), platform = process.platform, exists = existsSync, run = execFileSync } = {}) {
  if (TOWER_KEY.test(String(env.TOWER_KEY ?? ''))) return true;
  if (platform === 'win32') return Boolean(dir) && exists(join(dir, KEY_FILE));
  if (platform === 'darwin') {
    try {
      run('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN.service, '-a', KEYCHAIN.account], { stdio: 'ignore', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function pidAlive(pid, kill = process.kill) {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

// The speaker server of the Loa session keeps the lock file with its pid (speaker.mjs takeLock).
export function loaRunning(dir, alive = pidAlive, read = readFileSync) {
  try {
    const pid = Number(read(join(dir, 'tower.lock'), 'utf8'));
    return pid > 0 && alive(pid);
  } catch {
    return false;
  }
}

export function takeLaunchLock(dir, now = Date.now()) {
  const file = join(dir, 'loa-launch.lock');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, String(now), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') return false;
  }
  let at = 0;
  try {
    at = Number(readFileSync(file, 'utf8'));
  } catch {
    // unreadable: counts as old
  }
  if (now - at < LAUNCH_LOCK_MS) return false;
  try {
    writeFileSync(file, String(now));
    return true;
  } catch {
    return false;
  }
}

// Sessions on this machine (`claude agents --json`), or null when claude cannot list them.
export function listSessions(claude, run = execFileSync) {
  try {
    const list = JSON.parse(run(claude, ['agents', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000, windowsHide: true }));
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}
export const isLoaSession = (session) => LOA_NAMES.includes(String(session?.name ?? '').trim());
export const liveLoaSession = (sessions) => (sessions ?? []).some((session) => session?.pid && isLoaSession(session));

// What the Loa session is told. The prompt goes first: --allowedTools takes several values and would swallow a prompt
// after it. The monitor of the plugin starts when the model runs the skill with the Skill tool (a slash command in the
// prompt does not start it), so the prompt says so. Only these tools run without a question, because nobody sits there.
export const LOA_PROMPT = 'You are Loa Làng. Run the skill nlh:speaker-loop now with the Skill tool, then follow it. Nothing else.';
export const LOA_TOOLS = ['SendMessage', 'Skill', 'mcp__plugin_nlh_speaker__forwarded', 'mcp__plugin_nlh_speaker__pending'];
export const loaSettings = ({ dir, work, claude }) => ({ env: { NLH_TOWER: '1', NLH_LOA: 'monitor', NLH_TOWER_DIR: dir, NLH_TOWER_WORK: work, CLAUDE_BIN: claude } });
export const loaArgs = (options) => [LOA_PROMPT, '--bg', '--model', 'sonnet', '-n', LOA_NAME, '--settings', JSON.stringify(loaSettings(options)), '--allowedTools', LOA_TOOLS.join(' ')];

// Open the background Loa. Returns the command it started, for tests and logs. Never waits for it.
export function launchLoa({ env = process.env, platform = process.platform, home = homedir(), exists = existsSync, spawnImpl = spawn, mkdir = mkdirSync } = {}) {
  const dir = loaDir(env, home);
  const work = workDir(env, home);
  const claude = findClaude({ env, platform, home }, exists);
  mkdir(work, { recursive: true });
  const args = loaArgs({ dir, work, claude });
  const child = spawnImpl(claude, args, { cwd: work, env: childEnv(env), detached: true, stdio: 'ignore', windowsHide: true });
  child?.on?.('error', () => {});
  child?.unref?.();
  return { claude, args };
}

// The decision at every session start: 'is-loa', 'no-key', 'running', 'launching', 'no-claude', 'launched'.
// force: the restart path, which has just stopped the old Loa and must not be stopped by its leftovers.
export function ensureLoa({ env = process.env, platform = process.platform, home = homedir(), force = false, exists = existsSync, alive = pidAlive, list = listSessions, launch = launchLoa, run = execFileSync, now = Date.now() } = {}) {
  if (env.NLH_TOWER === '1') return 'is-loa';
  const dir = loaDir(env, home);
  // A restart (force) follows a Loa that had a key, and its environment no longer carries the plugin setting: not asked again.
  if (!force && !hasKey({ env, dir, platform, exists, run })) return 'no-key';
  if (!force && loaRunning(dir, alive)) return 'running';
  const sessions = list(findClaude({ env, platform, home }, exists));
  if (!sessions) return 'no-claude';
  if (!force && liveLoaSession(sessions)) return 'running';
  // The lock is taken only here, right before opening, so it never keeps a later restart from opening a Loa.
  if (!takeLaunchLock(dir, now) && !force) return 'launching';
  launch({ env, platform, home, exists });
  return 'launched';
}

export function newer(a, b) {
  if (!a || !b) return false;
  const x = String(a ?? '').split('.').map(Number);
  const y = String(b ?? '').split('.').map(Number);
  if ([...x, ...y].some((part) => !Number.isInteger(part))) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export function pluginVersion(root, read = readFileSync) {
  try {
    const version = JSON.parse(read(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

// The version Claude Code has on disk for this plugin (it updates the files by itself when the marketplace has
// auto-update on): { version, root } from installed_plugins.json, or null (plugin from claude.ai, file unreadable).
export function installedPlugin({ env = process.env, home = homedir(), read = readFileSync, exists = existsSync } = {}) {
  try {
    const data = JSON.parse(read(join(configDir(env, home), 'plugins', 'installed_plugins.json'), 'utf8'));
    const plugins = data.plugins ?? data;
    const key = plugins[`${PLUGIN}@${MARKETPLACE}`] ? `${PLUGIN}@${MARKETPLACE}` : Object.keys(plugins).find((name) => name.startsWith(`${PLUGIN}@`) && name !== `${PLUGIN}@synced`);
    const installs = Array.isArray(plugins[key]) ? plugins[key] : [];
    const found = installs.find((item) => item?.scope === 'user') ?? installs[0];
    const root = typeof found?.installPath === 'string' ? found.installPath : null;
    if (!root || !exists(join(root, 'speaker', 'loa.mjs'))) return null;
    const version = pluginVersion(root, read);
    return version ? { version, root } : null;
  } catch {
    return null;
  }
}

// Restart when the disk has a newer version than the one running and Loa is idle: nothing waits for SendMessage and no
// line was written for a minute. Not idle: ask again at the next check.
export function restartDue({ running, installed, pending = 0, sinceLastLine = Infinity, idleMs = IDLE_MS }) {
  return Boolean(installed) && newer(installed.version, running) && pending === 0 && sinceLastLine >= idleMs;
}

// The new version's own loa.mjs does the restart, detached, because stopping the old Loa session ends this process.
export function startRelaunch({ root, env = process.env, spawnImpl = spawn, node = process.execPath }) {
  const child = spawnImpl(node, [join(root, 'speaker', 'loa.mjs'), 'relaunch'], { env: restartEnv(env), detached: true, stdio: 'ignore', windowsHide: true });
  child?.on?.('error', () => {});
  child?.unref?.();
}

// Open the new Loa first, then stop the old one: stopping a session ends the processes under it, this restart among them
// (tried on Windows), so what comes after the stop may never run. The new Loa waits for the lock (speaker.mjs) and takes
// over when the old one is gone. The old one is stopped only when the new session is listed, so a failed start leaves
// the old Loa working. Run by `node loa.mjs relaunch`; returns 'restarted' or why not.
export async function relaunch({ env = restartEnv(process.env), platform = process.platform, home = homedir(), exists = existsSync, alive = pidAlive, list = listSessions, stop = (claude, id) => execFileSync(claude, ['stop', id], { stdio: 'ignore', timeout: 30_000, windowsHide: true }), launch = launchLoa, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), waitMs = 30_000 } = {}) {
  const claude = findClaude({ env, platform, home }, exists);
  const idOf = (session) => String(session?.id || session?.sessionId || '');
  // The Loa session(s) that run now: background, with a process, a name of Loa, an id of the shape claude stop takes.
  const running = (sessions) => (sessions ?? []).filter((item) => item?.kind === 'background' && item.pid && isLoaSession(item) && /^[0-9a-f-]{8,36}$/i.test(idOf(item)));
  const before = list(claude);
  if (!before) return 'no-claude';
  const old = running(before);
  const result = ensureLoa({ env, platform, home, force: true, exists, alive, list: () => before, launch });
  if (result !== 'launched') return result;
  const oldIds = new Set(old.map(idOf));
  let started = false;
  for (let waited = 0; !started && waited <= waitMs; waited += 500) {
    started = running(list(claude)).some((item) => !oldIds.has(idOf(item)));
    if (!started) await wait(500);
  }
  if (!started) return 'new-not-started';
  for (const session of old) {
    try {
      stop(claude, idOf(session));
    } catch {
      // already gone
    }
  }
  return 'restarted';
}

// What the "bật Loa" command tells the user, per answer of ensureLoa (plain Vietnamese, no commands, no ids).
export const SAYS = {
  launched: 'Đã bật Loa Làng. Loa Làng chạy nền trên máy này, không cần cửa sổ nào.',
  running: 'Loa Làng đang chạy trên máy này.',
  launching: 'Loa Làng đang mở. Chờ vài giây là chạy.',
  'is-loa': 'Phiên này chính là Loa Làng.',
  'no-claude': 'Chưa chạy được lệnh claude trên máy này nên chưa bật được Loa Làng. Mở lại app Claude rồi thử lại.',
  'no-key': 'Loa Làng chưa có khoá. Ở web Nếp, mở Kết nối, thẻ "Khoá cho Loa trên máy", bấm Tạo khoá mới, chép khoá, rồi dán vào ô "Khoá cho Loa" trong cài đặt plugin Nếp. Xong mở một phiên Claude mới, Loa Làng tự chạy.',
};
export const say = (code) => SAYS[code] ?? SAYS['no-claude'];

// Run directly: `node loa.mjs relaunch` (the restart, started by the old Loa) or `node loa.mjs ensure` (the "bật Loa"
// command: what a session start decides, said in words). Imported by tests and speaker.mjs: nothing runs. Windows
// paths ignore case.
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) {
  const task = process.argv[2];
  if (task === 'relaunch') await relaunch();
  else if (task === 'ensure') console.log(say(ensureLoa()));
}
