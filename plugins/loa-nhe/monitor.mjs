// "Loa nhẹ" (trial, branch exp/loa-monitor, ticket cfa2bcdf): a Claude Code plugin monitor, not a Loa. It runs inside the
// session the person already has open, reads the person's own work feed with the key Loa already saved, and prints ONE
// line per new item; Claude Code shows each stdout line to Claude as a notification, so the person sees it in the open
// session with nothing else running. It never opens, wakes or messages a session, never writes to the hub (GET only),
// never prints a ticket title or reason (only the cell's title and a short ticket id), and has no port or key of its own.
// Self-contained on purpose: the branch is a trial and must not touch plugin nlh. Helpers copy speaker/speaker.mjs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLL_MS = 30_000;
const OVERLAP_MS = 5 * 60 * 1000;
const FIRST_LOOKBACK_MS = 60 * 1000;
// Away this long (machine off, session closed): start from now, one line with the count, no backlog.
export const AWAY_MS = 2 * 60 * 60 * 1000;
const SEEN_MAX = 500;
const DEFAULT_ORIGIN = 'https://api.nlh.vn';
const KEY_SHAPE = /^nlh_tower_[0-9a-f]{64}$/;
const MACHINE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const KINDS = ['your_cell', 'your_turn', 'mention', 'plan_signed', 'you'];

// Only send the key to the hub (https *.nlh.vn); http only for localhost trials.
export function hubOrigin(value) {
  let url;
  try {
    url = new URL(String(value && !String(value).startsWith('${') ? value : DEFAULT_ORIGIN));
  } catch {
    return null;
  }
  if (url.protocol === 'https:' && (url.hostname === 'nlh.vn' || url.hostname.endsWith('.nlh.vn'))) return url.origin;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return url.origin;
  return null;
}

// Free text from others is data: drop control and bidi characters and anything that builds tags or quotes, cut short.
export function plain(value, max = 40) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>"`@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
const NAME = /^[a-z0-9]+([-_][a-z0-9]+)*$/;
const cellName = (value) => String(value ?? '').split(',').map((part) => part.trim()).find((part) => NAME.test(part) && part.length <= 64) ?? '';
const shortId = (value) => (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value ?? '')) ? String(value).slice(0, 8) : '');

// The line for one item, or '' when it is not for this person to be told (own line, or already held by someone).
const taken = (entry) => !entry?.held_here && Boolean(entry?.held_elsewhere || entry?.held_by || entry?.claimed_by || entry?.claimed === true || entry?.held === true);
const ownLine = (entry) => entry?.kind === 'your_cell' && Boolean(cellName(entry.from_cell)) && cellName(entry.cell) === cellName(entry.from_cell);
const isPrivate = (entry) => entry?.private === true || entry?.sensitive === true || entry?.visibility === 'private';
export function line(entry) {
  if (!entry?.id || !KINDS.includes(entry.kind) || ownLine(entry) || taken(entry)) return '';
  if (isPrivate(entry)) return 'Nếp: có việc riêng mới.';
  const place = plain(entry.cell_title) || cellName(entry.cell) || 'một chòi';
  const ticket = shortId(entry.ticket_id);
  const of = ticket ? ` (phiếu ${ticket})` : '';
  switch (entry.kind) {
    case 'your_cell':
      return `Nếp: ${place} có việc mới${of}. Gõ "làm tiếp" để nhận.`;
    case 'your_turn':
      return `Nếp: ${place} có câu trả lời mới${of}. Gõ "làm tiếp".`;
    case 'mention':
      return `Nếp: có người gọi ${place} trong nhóm. Gõ "làm tiếp".`;
    case 'plan_signed':
      return `Nếp: kế hoạch của ${place} vừa được ký${of}. Gõ "làm tiếp".`;
    default:
      return 'Nếp: có việc chờ chính bạn trả lời hay ký. Gõ "việc của tôi".';
  }
}

// New items (not seen yet), oldest first, and the next state { since, seen }.
export function nextEntries(state, entries) {
  const seen = new Set(state.seen);
  const fresh = entries.filter((entry) => entry?.id && !seen.has(entry.id));
  let since = state.since;
  for (const entry of fresh) if (!since || Date.parse(entry.at) > Date.parse(since)) since = entry.at;
  return { fresh, state: { since, seen: [...state.seen, ...fresh.map((entry) => entry.id)].slice(-SEEN_MAX) } };
}

export function feedUrl(origin, since, now = Date.now(), machine = null) {
  const from = since ? Date.parse(since) - OVERLAP_MS : now - FIRST_LOOKBACK_MS;
  const seat = MACHINE_ID.test(String(machine ?? '')) ? `&machine_id=${encodeURIComponent(machine)}` : '';
  return `${origin}/tower/feed?since=${encodeURIComponent(new Date(from).toISOString())}${seat}`;
}

// The key Loa saved on this machine (read only), or '' . Windows: DPAPI file read by absolute-path Windows PowerShell with the
// file path in an environment variable; macOS: the Keychain item Loa made. TOWER_KEY in the environment wins when set.
const POWERSHELL = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export function savedKey(home = homedir(), env = process.env, platform = process.platform) {
  const given = String(env.TOWER_KEY ?? '').trim();
  if (KEY_SHAPE.test(given)) return given;
  try {
    let key = '';
    if (platform === 'win32') {
      const file = join(home, '.tinh-nlh', 'speaker', 'tower-key.dpapi');
      if (!existsSync(file)) return '';
      const script =
        '$s = (Get-Content -LiteralPath $env:TOWER_KEY_FILE -Raw).Trim() | ConvertTo-SecureString; ' +
        '$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); ' +
        'try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }';
      key = execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], { cwd: dirname(file), env: { ...process.env, TOWER_KEY_FILE: file }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, windowsHide: true });
    } else if (platform === 'darwin') {
      key = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'tinh-nlh-tower', '-a', 'tinh-nlh', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 });
    }
    key = key.trim();
    return KEY_SHAPE.test(key) ? key : '';
  } catch {
    return '';
  }
}

const machineId = (home) => {
  try {
    const text = readFileSync(join(home, '.tinh-nlh', 'machine-id'), 'utf8').trim();
    return MACHINE_ID.test(text) ? text : null;
  } catch {
    return null;
  }
};

// What the monitors on this machine already printed (ids and the time of the last read), so a new session does not tell
// the same items again. Each monitor still keeps its own memory: two open sessions both hear a new item.
const readState = (file) => {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { since: typeof data.since === 'string' ? data.since : null, seen: Array.isArray(data.seen) ? data.seen.filter((id) => typeof id === 'string') : [], read_at: Number(data.read_at) || 0 };
  } catch {
    return { since: null, seen: [], read_at: 0 };
  }
};
const writeState = (file, state, mine, now) => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const merged = readState(file);
    const seen = [...new Set([...merged.seen, ...state.seen, ...mine])].slice(-SEEN_MAX);
    writeFileSync(file, JSON.stringify({ since: state.since ?? merged.since, seen, read_at: now }));
  } catch {
    // Not saving only means a new session may tell an item twice.
  }
};

export async function run({ env = process.env, home = homedir(), fetchImpl = globalThis.fetch, write = (text) => process.stdout.write(`${text}\n`), clock = () => Date.now(), once = false } = {}) {
  if (env.CLAUDE_CODE_REMOTE === 'true') return;
  const origin = hubOrigin(env.TOWER_ORIGIN);
  if (!origin) return write('Nếp: địa chỉ hub không đúng, Loa nhẹ dừng.');
  const key = savedKey(home, env);
  if (!key) return write('Nếp: Loa nhẹ chưa có khoá. Mở Loa tỉnh NhiLe một lần rồi mở lại Claude.');
  const file = join(home, '.tinh-nlh', 'loa-nhe.json');
  const machine = machineId(home);
  let state = readState(file);
  const away = !state.read_at || clock() - state.read_at > AWAY_MS;
  if (away) state = { since: new Date(clock() - FIRST_LOOKBACK_MS).toISOString(), seen: [], read_at: 0 };
  const mine = [];

  const poll = async () => {
    let response;
    try {
      response = await fetchImpl(feedUrl(origin, state.since, clock(), machine), { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    } catch {
      return 'retry';
    }
    if (response.status === 401) { write('Nếp: khoá của Loa hết hạn. Mở Loa tỉnh NhiLe để cho phép lại, Loa nhẹ dừng.'); return 'stop'; }
    if (response.status === 403) { write('Nếp: bạn không còn trong danh sách dùng Nếp, Loa nhẹ dừng.'); return 'stop'; }
    if (!response.ok) return 'retry';
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.entries)) return 'retry';
    const { fresh, state: next } = nextEntries(state, data.entries);
    state = next;
    const lines = fresh.map(line).filter(Boolean);
    // Away before: the feed since a minute ago, nothing older. A burst on one read is one line, not twenty.
    if (lines.length > 3) write(`Nếp: có ${lines.length} việc mới. Gõ "việc của tôi".`);
    else for (const text of lines) write(text);
    mine.push(...fresh.map((entry) => entry.id));
    writeState(file, state, mine, clock());
    return 'ok';
  };

  for (;;) {
    const result = await poll();
    if (result === 'stop' || once) return;
    await new Promise((resolve) => setTimeout(resolve, Number(env.LOA_NHE_POLL_MS) || POLL_MS));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run().catch(() => {});
