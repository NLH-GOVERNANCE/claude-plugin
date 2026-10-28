// Bộ ca chấm "người không rành kỹ thuật": chạy từng câu người thật đã gõ qua Claude Code không giao diện, với gói ở nhánh
// đang thử (mỗi ca chạy 3 lần, --runs đổi số lần), rồi tự chấm ba điều: (1) chữ đầu tiên trong 15 giây, trung vị của các lần, ghi cả ba số, tính từ lúc phiên đã mở (sự kiện system/init; người thật hỏi trong
// phiên đã mở sẵn), thời gian khởi động riêng thì in thành cột "khởi động" để không mất số; (2) ca có maxLines thì không quá số dòng đó; (3) không có
// chữ cấm và không có câu tiếng Anh, hai điều này phải đạt ở MỌI lần chạy vì người dùng gặp đúng lần sai đó. Điều (4), không chỉ tới nút hay trang không có thật, không tự chấm: script in câu trả lời
// ra cho dân làng Trải nghiệm đọc. Ca và chữ cấm nằm ở scripts/persona-cases.json, sửa không cần đụng code này.
// Cần Claude Code thật và hạn mức, nên không gắn vào CI; chạy trước mỗi lần tăng bản gói.
// Chạy bằng tài khoản thật trên giếng thật: chỉ công cụ đọc của Nếp được tự duyệt (readTools trong file ca), công cụ ghi bị chặn hẳn
// (writeTools, --disallowedTools); lệnh duy nhất được chạy là cập nhật gói (commandTools), nên ca cập nhật thật sự cập nhật gói đã cài
// trên máy chạy bộ ca. Hook của gói thì không chặn được và vẫn chạy: mỗi ca lưu một lượt chat và báo phiên lên giếng.
// Chạy: node scripts/persona-suite.mjs [--plugin <thư mục gói>] [--only <id>,<id>] [--cases <file>] [--out <file json>] [--no-update] [--runs <số lần>]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const DEFAULT_PLUGIN = join(HERE, '../plugins/tinh-nlh');
export const DEFAULT_CASES = join(HERE, 'persona-cases.json');
const TIMEOUT_MS = 180_000;
// Hai tên máy chủ Nếp mà phiên không giao diện thấy: của gói, và connector tài khoản.
const NEP_SERVERS = ['mcp__plugin_nlh_nep__', 'mcp__claude_ai_nhile-governance__'];

// Công cụ được phép gọi thật: công cụ đọc của Nếp (readTools trong file ca), mỗi máy chủ một bản, tên đầy đủ; và đúng các lệnh
// cập nhật gói (commandTools), như người thật bấm Đồng ý trong phiên: ca "cập nhật giúp" đo đường thật, không đo việc bị từ chối quyền.
// Cờ --no-update bỏ các lệnh đó đi (update = false): bộ ca không đụng gói đã cài trên máy.
export function allowedTools(config, { update = true } = {}) {
  return [...NEP_SERVERS.flatMap((server) => config.readTools.map((tool) => server + tool)), ...(update ? config.commandTools ?? [] : [])];
}

// Công cụ ghi bị chặn hẳn: --disallowedTools thắng --allowedTools, nên một công cụ ghi lọt vào readTools cũng không chạy được.
export function blockedTools(config) {
  return NEP_SERVERS.flatMap((server) => config.writeTools.map((tool) => server + tool));
}

// Đọc các dòng stream-json của `claude -p`. lines: [{ t: mili giây từ lúc chạy, text: một dòng JSON }]. Trả về chữ người dùng
// thấy (mọi khối chữ của trợ lý, theo thứ tự), mili giây tới khối chữ đầu tiên, mili giây tới lúc phiên mở (startupMs, sự kiện
// system/init, null nếu không thấy), và dấu vết công cụ: mỗi lần gọi một dòng
// { name, startMs, endMs } (endMs null nếu không thấy kết quả), để biết thời gian đi vào đâu. Bỏ qua dòng không phải JSON.
export function parseStream(lines) {
  const texts = [];
  const tools = [];
  const byId = new Map();
  let firstTextMs = null;
  let startupMs = null;
  for (const { t, text } of lines) {
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      continue;
    }
    if (event?.type === 'system' && event.subtype === 'init' && startupMs === null) startupMs = t;
    if (event?.type === 'user') {
      for (const block of event.message?.content ?? []) {
        const tool = block?.type === 'tool_result' ? byId.get(block.tool_use_id) : null;
        if (tool) tool.endMs = t;
      }
      continue;
    }
    if (event?.type !== 'assistant') continue;
    for (const block of event.message?.content ?? []) {
      if (block?.type === 'tool_use') {
        const tool = { name: String(block.name ?? '').replace(/^mcp__.*?__/, ''), startMs: t, endMs: null };
        byId.set(block.id, tool);
        tools.push(tool);
      }
      if (block?.type !== 'text' || !String(block.text ?? '').trim()) continue;
      if (firstTextMs === null) firstTextMs = t;
      texts.push(block.text);
    }
  }
  return { answer: texts.join('\n').trim(), firstTextMs, startupMs, tools };
}

// Dấu vết một ca, một dòng, giờ tính từ lúc chạy tiến trình: phiên mở lúc nào, công cụ nào gọi lúc nào và mất bao lâu, rồi chữ đầu.
// Ví dụ "mở 8s · my_context 9.1→11s · chữ đầu 12s".
export function renderTrace(parsed) {
  const sec = (ms) => (ms === null ? '?' : (Math.round(ms / 100) / 10).toString());
  const calls = parsed.tools.map((tool) => `${tool.name} ${sec(tool.startMs)}→${sec(tool.endMs)}s`);
  return [...(parsed.startupMs == null ? [] : [`mở ${sec(parsed.startupMs)}s`]), ...calls, `chữ đầu ${sec(parsed.firstTextMs)}s`].join(' · ');
}

const nonEmptyLines = (answer) => answer.split('\n').filter((line) => line.trim());

// Chữ cấm tìm thấy trong câu trả lời, trừ chữ ca đó cho phép (người dùng đã tự nói ra trong câu hỏi).
export function forbiddenHits(answer, forbidden, allow = []) {
  const hits = [];
  for (const { label, re, flags } of forbidden) {
    if (allow.includes(label)) continue;
    if (new RegExp(re, flags ?? '').test(answer)) hits.push(label);
  }
  return hits;
}

// Dòng nào có từ minDistinct chữ khác nhau trở lên trong english.words thì là câu tiếng Anh. Trả về các dòng đó.
export function englishLines(answer, english) {
  const words = new Set(english.words.map((word) => word.toLowerCase()));
  return nonEmptyLines(answer).filter((line) => {
    const found = new Set((line.toLowerCase().match(/[a-z]+/g) ?? []).filter((word) => words.has(word)));
    return found.size >= english.minDistinct;
  });
}

// Chấm một ca. Mỗi điều có pass (true/false). Không có chữ nào trong thời hạn, hay câu trả lời trống, là trượt cả ba.
// Giờ chấm là từ lúc phiên mở (startupMs) tới chữ đầu; không thấy lúc phiên mở thì tính từ lúc chạy. startup: giây khởi động riêng.
export function gradeCase({ answer, firstTextMs, startupMs = null }, testCase, config) {
  const maxMs = config.maxFirstTextSeconds * 1000;
  const replyMs = firstTextMs === null ? null : firstTextMs - (startupMs ?? 0);
  const tenths = (ms) => Math.round(ms / 100) / 10;
  const time = { pass: replyMs !== null && replyMs <= maxMs, seconds: replyMs === null ? null : tenths(replyMs), startup: startupMs === null ? null : tenths(startupMs) };
  const lines = nonEmptyLines(answer).length;
  const rows = { pass: testCase.maxLines === undefined || (lines > 0 && lines <= testCase.maxLines), lines, max: testCase.maxLines ?? null };
  // mustNot: chữ cấm riêng của ca (xưng hô sai: ca người dùng đã nói "chị" thì không được gọi "anh"), cùng khuôn với forbidden.
  const hits = [...forbiddenHits(answer, config.forbidden, testCase.allow), ...forbiddenHits(answer, testCase.mustNot ?? [])];
  const english = englishLines(answer, config.english);
  const missing = (testCase.must ?? []).filter((item) => !new RegExp(item.re, item.flags ?? '').test(answer)).map((item) => item.label);
  const words = { pass: answer !== '' && hits.length === 0 && english.length === 0 && missing.length === 0, hits, english, missing };
  return { id: testCase.id, pass: time.pass && rows.pass && words.pass, time, rows, words };
}

// Trung vị; không có chữ (null) tính là vô cực, nên ca nào thiếu chữ từ nửa số lần trở lên thì trượt. Số lần chẵn lấy số lớn hơn ở giữa (chặt hơn).
export function median(values) {
  const sorted = values.map((value) => value ?? Infinity).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Chấm một ca đã chạy nhiều lần (parsedList: kết quả parseStream từng lần). Thời gian: trung vị của các lần ≤ giới hạn, giữ cả các số
// trong time.all. Dòng, chữ cấm, câu tiếng Anh: mọi lần đều phải đạt. runs giữ kết quả từng lần.
export function gradeRuns(parsedList, testCase, config) {
  const runs = parsedList.map((parsed) => gradeCase(parsed, testCase, config));
  const mid = median(runs.map((run) => run.time.seconds));
  const startups = runs.map((run) => run.time.startup).filter((value) => value !== null);
  const time = {
    pass: Number.isFinite(mid) && mid * 1000 <= config.maxFirstTextSeconds * 1000,
    seconds: Number.isFinite(mid) ? mid : null,
    all: runs.map((run) => run.time.seconds),
    startup: startups.length ? median(startups) : null,
  };
  const rows = { pass: runs.every((run) => run.rows.pass), lines: Math.max(...runs.map((run) => run.rows.lines)), max: runs[0].rows.max };
  const words = {
    pass: runs.every((run) => run.words.pass),
    hits: [...new Set(runs.flatMap((run) => run.words.hits))],
    english: runs.flatMap((run) => run.words.english),
    missing: [...new Set(runs.flatMap((run) => run.words.missing))],
  };
  return { id: testCase.id, pass: time.pass && rows.pass && words.pass, time, rows, words, runs };
}

// Số phiên Claude khác đang chạy trên máy lúc đo: file chat của phiên (<thư mục Claude>/projects/*/*.jsonl) vừa được ghi trong 2 phút
// qua, trừ phiên của chính bộ ca (thư mục tạm nlh-persona). Chạy ngầm nhiều phiên làm số đo chậm, nên ghi số này kèm kết quả.
export function activeSessions(now = Date.now(), dir = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')) {
  let count = 0;
  try {
    for (const project of readdirSync(dir)) {
      if (/nlh-persona/i.test(project)) continue;
      for (const file of readdirSync(join(dir, project))) {
        if (!file.endsWith('.jsonl')) continue;
        try {
          if (now - statSync(join(dir, project, file)).mtimeMs < 120_000) count += 1;
        } catch {
          // File vừa bị xoá: bỏ qua.
        }
      }
    }
  } catch {
    // Không có thư mục phiên: không đếm được, trả 0.
  }
  return count;
}

// Bảng ngắn, một dòng mỗi ca, rồi lý do trượt. Cột "ba lần" là giờ từng lần chạy (ca chấm một lần thì để -).
export function renderTable(results, config) {
  const cell = (value, width) => String(value).padEnd(width);
  const out = [cell('ca', 22) + cell(`giây (≤${config.maxFirstTextSeconds}, trung vị)`, 22) + cell('từng lần', 20) + cell('khởi động', 11) + cell('dòng', 8) + cell('chữ cấm', 9) + 'kết quả'];
  for (const r of results) {
    const rows = r.rows.max === null ? `${r.rows.lines}` : `${r.rows.lines}/${r.rows.max}`;
    out.push(cell(r.id, 22) + cell(r.time.seconds ?? 'không có', 22) + cell(r.time.all ? r.time.all.map((value) => value ?? 'không có').join(' · ') : '-', 20) + cell(r.time.startup ?? '?', 11) + cell(rows, 8) + cell(r.words.pass ? 'sạch' : 'có', 9) + (r.pass ? 'đạt' : 'TRƯỢT'));
  }
  for (const r of results.filter((item) => !item.pass)) {
    const why = [];
    if (!r.time.pass) why.push(r.time.seconds === null ? 'không có chữ nào' : `chữ đầu sau ${r.time.seconds}s${r.time.all ? ` (${r.time.all.join(' · ')})` : ''}`);
    if (!r.rows.pass) why.push(`${r.rows.lines} dòng, tối đa ${r.rows.max}`);
    if (r.words.hits.length) why.push(`chữ cấm: ${r.words.hits.join(', ')}`);
    if (r.words.missing?.length) why.push(`thiếu: ${r.words.missing.join(', ')}`);
    if (r.words.english.length) why.push(`câu tiếng Anh: ${r.words.english.map((line) => `"${line.trim().slice(0, 60)}"`).join('; ')}`);
    out.push(`  ${r.id}: ${why.join(' · ')}`);
  }
  return out.join('\n');
}

function writeEmptyMcp(dir) {
  const file = join(dir, 'no-mcp.json');
  writeFileSync(file, '{ "mcpServers": {} }');
  return file;
}

// Chạy `claude -p` một ca, câu hỏi đưa qua stdin (không dính quy tắc trích dẫn của shell), từ một thư mục trống để phiên
// không nạp CLAUDE.md hay gói nào khác của dự án. Lỗi hook lúc đóng phiên (máy chủ chưa nối) bỏ đi, không in. Trả về các dòng kèm thời gian nhận.
function runClaude(say, pluginDir, cwd, tools, blocked, noNep = false, bin = process.env.CLAUDE_BIN || 'claude') {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--plugin-dir', pluginDir,
      '--output-format', 'stream-json',
      '--verbose',
      '--allowedTools', ...tools,
      '--disallowedTools', ...blocked,
    ];
    // Ca "chưa có kết nối Nếp": bỏ mọi kết nối của tài khoản, để phiên chạy như máy chưa gắn Nếp.
    if (noNep) args.push('--strict-mcp-config', '--mcp-config', writeEmptyMcp(cwd));
    const started = Date.now();
    // claude.cmd (cài bằng npm) trên Windows chỉ chạy qua shell, nên bọc dấu ngoặc kép quanh đường dẫn có khoảng trắng.
    const viaShell = process.platform === 'win32' && !bin.endsWith('.exe');
    const child = spawn(bin, viaShell ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args, { cwd, stdio: ['pipe', 'pipe', 'ignore'], shell: viaShell });
    const lines = [];
    let rest = '';
    child.stdout.on('data', (chunk) => {
      rest += chunk;
      const parts = rest.split('\n');
      rest = parts.pop();
      for (const text of parts) lines.push({ t: Date.now() - started, text });
    });
    // Qua shell trên Windows, child.kill() chỉ giết cmd, claude vẫn chạy: giết cả cây tiến trình.
    const stop = () => (viaShell ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) : child.kill());
    const timer = setTimeout(stop, TIMEOUT_MS);
    child.on('error', reject);
    child.on('close', () => {
      clearTimeout(timer);
      if (rest) lines.push({ t: Date.now() - started, text: rest });
      resolve(lines);
    });
    child.stdin.end(say);
  });
}

function parseArgs(argv) {
  const opts = { plugin: DEFAULT_PLUGIN, cases: DEFAULT_CASES, only: null, out: null, update: true, runs: 3 };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--no-update') {
      opts.update = false;
      i -= 1;
      continue;
    }
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!value) throw new Error(`thiếu giá trị cho ${flag}`);
    if (flag === '--plugin') opts.plugin = value;
    else if (flag === '--cases') opts.cases = value;
    else if (flag === '--only') opts.only = value.split(',');
    else if (flag === '--out') opts.out = value;
    else if (flag === '--runs') opts.runs = Number(value);
    else throw new Error(`không có cờ ${flag}`);
  }
  if (!Number.isInteger(opts.runs) || opts.runs < 1) throw new Error('--runs là số nguyên từ 1');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(opts.cases, 'utf8'));
  const cases = config.cases.filter((c) => !opts.only || opts.only.includes(c.id));
  if (cases.length === 0) throw new Error('không có ca nào để chạy');
  const cwd = mkdtempSync(join(tmpdir(), 'nlh-persona-'));
  const results = [];
  const answers = [];
  const sessions = [];
  try {
    for (const testCase of cases) {
      const parsedList = [];
      for (let run = 1; run <= opts.runs; run += 1) {
        process.stderr.write(`chạy ${testCase.id} (lần ${run}/${opts.runs})…\n`);
        sessions.push(activeSessions());
        const lines = await runClaude(testCase.say, opts.plugin, cwd, allowedTools(config, { update: opts.update }), blockedTools(config), testCase.noNep === true);
        const parsed = parseStream(lines);
        if (!parsed.answer) {
          const tail = lines.slice(-3).map((line) => line.text.slice(0, 300)).join(' | ');
          process.stderr.write(`${testCase.id}: không có chữ nào trả về (${lines.length} dòng). Cuối luồng: ${tail || '(trống)'}\n`);
        }
        parsedList.push(parsed);
        answers.push({ id: testCase.id, run, say: testCase.say, answer: parsed.answer, trace: renderTrace(parsed) });
      }
      results.push(gradeRuns(parsedList, testCase, config));
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
  console.log(`${opts.runs} lần mỗi ca; phiên Claude khác đang chạy trên máy lúc đo: ${Math.min(...sessions)} đến ${Math.max(...sessions)}\n`);
  console.log(renderTable(results, config));
  console.log('\nDấu vết (giây từ lúc chạy tiến trình; "mở" là lúc phiên mở, giờ chấm tính từ đó):');
  for (const { id, run, trace } of answers) console.log(`  ${id} #${run}: ${trace}`);
  console.log('\nCâu trả lời từng lần, để dân làng Trải nghiệm đọc điều (4): có chỉ tới nút hay trang không có thật không, và có đúng ý câu hỏi không?');
  for (const { id, run, say, answer } of answers) console.log(`\n--- ${id} #${run}: "${say}"\n${answer || '(không có chữ nào)'}`);
  if (opts.out) writeFileSync(opts.out, JSON.stringify({ at: new Date().toISOString(), runs: opts.runs, otherSessions: { min: Math.min(...sessions), max: Math.max(...sessions) }, results, answers }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} ca đạt.`);
  process.exitCode = failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
