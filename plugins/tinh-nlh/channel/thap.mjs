// Kênh "thap" của plugin tinh-nlh (phiếu 98bd8b93, kế hoạch 8962ce51): MCP server chạy trên máy, đẩy việc mới của
// người dùng vào phiên Claude Code đang ngồi ô Tháp hệ thống (channel của Claude Code, research preview). Mỗi 15 giây
// đọc luồng việc của hub (GET /thap/feed, hub#186) bằng khoá riêng có hạn, từ mốc đã lưu trên máy; mục chưa đẩy thì
// đẩy bằng notifications/claude/channel, meta có ticket, cell, kind. Không trùng: nhớ mã các mục đã đẩy. Khởi động thì
// đọc lại từ mốc đã lưu, nên bù được tin sót lúc tắt máy.
//
// Chỉ chạy khi NLH_THAP=1 (Thap.cmd đặt). Phiên Claude Code khác trên máy cũng nạp server này qua plugin, nhưng không
// có biến đó thì không khai kênh, không gọi mạng, không đọc khoá: chỉ một phiên Tháp đọc luồng việc, không phiên nào
// khác "ăn" mất tin. Một máy chỉ một Tháp (file khoá thap.lock).
//
// Một chiều: không có công cụ trả lời, không khai claude/channel/permission (nút duyệt không đi qua kênh). Không thư
// viện: MCP qua stdio là JSON-RPC, mỗi dòng một tin. Khoá không ghi ra đâu, kể cả stderr.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.2.0';
const POLL_MS = Number(process.env.THAP_POLL_MS) || 15_000;
// Đọc lùi một chút so với mốc: mục ghi cùng lúc với lần đọc trước vẫn tới. Mã đã đẩy chặn trùng.
const OVERLAP_MS = 5 * 60 * 1000;
// Lần đầu trên máy (chưa có mốc): bù việc của 24 giờ qua.
const FIRST_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SEEN_MAX = 1000;
const DEFAULT_ORIGIN = 'https://governance.nlh.vn';
// Như SDK MCP 1.32 (phép thử thap-test chạy được): Claude Code không nhận kênh nói bản giao thức 2026-07-28.
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];

// Chỉ gửi khoá tới hub của tỉnh (https, tên miền nlh.vn). Riêng localhost được dùng http, cho phép thử trên máy.
export function hubOrigin(value) {
  let url;
  try {
    url = new URL(String(value || DEFAULT_ORIGIN));
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'https:' && (url.hostname === 'nlh.vn' || url.hostname.endsWith('.nlh.vn'))) return url.origin;
  if (url.protocol === 'http:' && local) return url.origin;
  return null;
}

const quote = (value) => `"${String(value ?? '').replace(/\s+/g, ' ').trim()}"`;

// Một mục của luồng việc thành một tin kênh: một câu đủ nghĩa, rồi lời dặn của hub.
export function channelEvent(entry) {
  const by = entry.by_name ? `${entry.by_name} ` : '';
  const ticket = entry.ticket_id ? ` Phiếu ${entry.ticket_id}.` : '';
  const headline = {
    your_cell: `Phiếu mới cho ô ${entry.cell}${entry.work_type ? ` (gửi @${entry.work_type})` : ''}: ${quote(entry.title)}.${by ? ` Người nhờ: ${entry.by_name}.` : ''}${ticket}`,
    your_turn: `Phiếu ${quote(entry.title)} của ô ${entry.cell} có câu trả lời mới.${ticket}`,
    mention: `${by || 'Có người '}gọi ô ${entry.cell} trong nhóm ${quote(entry.title)}: ${quote(entry.body)}.${ticket}`,
    plan_signed: `Kế hoạch ${quote(entry.title)} (ô ${entry.cell}) vừa được ${entry.by_name ?? 'người duyệt'} ký.${ticket}`,
    you: `Phiếu ${quote(entry.title)} (ô ${entry.cell}) chờ chính người dùng trả lời hay ký. Tháp không làm thay.${ticket}`,
  }[entry.kind] ?? `${entry.kind}: ${quote(entry.title)}.${ticket}`;
  const meta = { kind: String(entry.kind), cell: String(entry.cell ?? ''), ticket: String(entry.ticket_id ?? ''), entry_id: String(entry.id) };
  if (entry.by_name) meta.by = String(entry.by_name);
  if (entry.work_type) meta.work_type = String(entry.work_type);
  if (entry.kind === 'mention') {
    for (const key of ['space_id', 'thread_id', 'message_id', 'external_id']) if (entry[key]) meta[key] = String(entry[key]);
  }
  return { content: entry.reason ? `${headline}\n${entry.reason}` : headline, meta };
}

// Mốc và mã đã đẩy, giữ trong thư mục dữ liệu của plugin (CLAUDE_PLUGIN_DATA), qua các lần cập nhật plugin.
export function loadState(dir) {
  try {
    const state = JSON.parse(readFileSync(join(dir, 'thap-state.json'), 'utf8'));
    return { since: typeof state.since === 'string' ? state.since : null, seen: Array.isArray(state.seen) ? state.seen : [] };
  } catch {
    return { since: null, seen: [] };
  }
}

function saveState(dir, state) {
  writeFileSync(join(dir, 'thap-state.json'), JSON.stringify({ since: state.since, seen: state.seen.slice(-SEEN_MAX) }));
}

// Một máy một Tháp: file khoá ghi pid. Tháp cũ đã tắt (pid không còn) thì lấy lại.
export function takeLock(dir, pid = process.pid) {
  const path = join(dir, 'thap.lock');
  if (existsSync(path)) {
    const other = Number(readFileSync(path, 'utf8'));
    if (other && other !== pid) {
      try {
        process.kill(other, 0);
        return false;
      } catch (error) {
        if (error.code === 'EPERM') return false;
      }
    }
  }
  writeFileSync(path, String(pid));
  return true;
}

// Một vòng đọc: trả mục mới (chưa đẩy) theo thứ tự cũ trước, và trạng thái mới. Hàm không tự đẩy để test được.
export function nextEntries(state, entries) {
  const seen = new Set(state.seen);
  const fresh = entries.filter((entry) => entry?.id && !seen.has(entry.id));
  let since = state.since;
  for (const entry of fresh) if (!since || Date.parse(entry.at) > Date.parse(since)) since = entry.at;
  return { fresh, state: { since, seen: [...state.seen, ...fresh.map((entry) => entry.id)].slice(-SEEN_MAX) } };
}

export function feedUrl(origin, since, now = Date.now()) {
  const from = since ? Date.parse(since) - OVERLAP_MS : now - FIRST_LOOKBACK_MS;
  return `${origin}/thap/feed?since=${encodeURIComponent(new Date(from).toISOString())}`;
}

const INSTRUCTIONS = `Kênh thap của tỉnh NhiLe: mỗi tin <channel source="...thap" kind cell ticket> là một việc mới của người dùng, hệ đẩy tới. Phiên này ngồi ô Tháp hệ thống: chuyển mỗi việc tới đúng phiên đang ngồi ô đó theo skill tinh-nlh:thap, không tự làm việc của ô, không trả lời hay ký thay người. kind you là việc chờ chính người dùng: không chuyển, không làm. kind system là tin của chính kênh (khoá hết hạn, Tháp khác đang chạy): báo người dùng, không làm gì khác. Kênh một chiều, không có công cụ trả lời.`;

export function startServer({
  input = process.stdin,
  output = process.stdout,
  env = process.env,
  fetchImpl = fetch,
  log = (line) => process.stderr.write(`thap: ${line}\n`),
  onClose = () => process.exit(0),
} = {}) {
  const enabled = env.NLH_THAP === '1';
  const dir = env.CLAUDE_PLUGIN_DATA || env.THAP_STATE_DIR || null;
  const send = (message) => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const push = (content, meta) => send({ method: 'notifications/claude/channel', params: { content, meta } });
  const said = new Set();
  // Tin của chính kênh, mỗi loại một lần cho tới khi trạng thái đổi.
  const notice = (key, content) => {
    if (said.has(key)) return;
    said.add(key);
    push(content, { kind: 'system', cell: 'thap', ticket: '', entry_id: `system:${key}` });
  };
  let timer = null;
  let state = { since: null, seen: [] };

  async function tick() {
    const key = env.THAP_KEY;
    const origin = hubOrigin(env.THAP_ORIGIN);
    if (!key) return notice('no_key', 'Kênh Tháp chưa có khoá. Tạo khoá ở web tỉnh NhiLe (Kết nối, thẻ "Khoá cho Tháp trên máy"), rồi dán vào cấu hình kênh Tháp của plugin tinh-nlh.');
    if (!origin) return notice('bad_origin', 'Địa chỉ hub trong cấu hình kênh Tháp không phải https của nlh.vn. Kênh không gửi khoá tới đó.');
    let response;
    try {
      response = await fetchImpl(feedUrl(origin, state.since), { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    } catch (error) {
      log(`chưa đọc được luồng việc: ${error?.code ?? error?.name ?? 'lỗi mạng'}`);
      return;
    }
    if (response.status === 401) return notice('rejected', 'Hub không nhận khoá của Tháp (sai, hết hạn 30 ngày hay đã thu hồi). Tạo khoá mới ở web, thẻ "Khoá cho Tháp trên máy", rồi dán vào cấu hình kênh.');
    if (response.status === 403) return notice('not_allowed', 'Người dùng không còn trong danh sách được dùng hệ. Kênh Tháp dừng đọc.');
    if (!response.ok) {
      log(`hub trả ${response.status}`);
      return;
    }
    said.delete('rejected');
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.entries)) return log('hub trả dữ liệu lạ');
    const { fresh, state: next } = nextEntries(state, data.entries);
    for (const entry of fresh) {
      const event = channelEvent(entry);
      push(event.content, event.meta);
    }
    state = next;
    if (dir) saveState(dir, state);
    if (data.more && fresh.length) await tick();
  }

  function begin() {
    if (!enabled || timer) return;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      if (!takeLock(dir)) return notice('locked', 'Một Tháp khác đang chạy trên máy này, nên phiên này không đọc luồng việc. Tắt bớt một cửa sổ Tháp.');
      process.on('exit', () => rmSync(join(dir, 'thap.lock'), { force: true }));
      state = loadState(dir);
    }
    const loop = () => tick().catch((error) => log(`vòng đọc lỗi: ${error?.name ?? 'Error'}`));
    loop();
    timer = setInterval(loop, POLL_MS);
  }

  const lines = createInterface({ input });
  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.method === 'initialize') {
      const asked = message.params?.protocolVersion;
      send({
        id: message.id,
        result: {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: enabled ? { experimental: { 'claude/channel': {} } } : {},
          serverInfo: { name: 'thap', version: VERSION },
          ...(enabled ? { instructions: INSTRUCTIONS } : {}),
        },
      });
    } else if (message.method === 'notifications/initialized') {
      begin();
    } else if (message.method === 'ping') {
      send({ id: message.id, result: {} });
    } else if (message.id !== undefined && message.method) {
      send({ id: message.id, error: { code: -32601, message: `Kênh thap không có ${message.method}` } });
    }
  });
  lines.on('close', () => {
    clearInterval(timer);
    onClose();
  });
  return { tick: () => tick() };
}

// Chạy thẳng (node thap.mjs) thì mở server; import trong test thì không. Windows không phân biệt hoa thường.
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) startServer();
