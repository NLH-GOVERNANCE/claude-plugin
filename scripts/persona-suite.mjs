// Bộ ca chấm "người không rành kỹ thuật": chạy từng câu người thật đã gõ qua Claude Code không giao diện, với gói ở nhánh
// đang thử, rồi tự chấm ba điều: (1) chữ đầu tiên trong 15 giây; (2) ca có maxLines thì không quá số dòng đó; (3) không có
// chữ cấm và không có câu tiếng Anh. Điều (4), không chỉ tới nút hay trang không có thật, không tự chấm: script in câu trả lời
// ra cho dân làng Trải nghiệm đọc. Ca và chữ cấm nằm ở scripts/persona-cases.json, sửa không cần đụng code này.
// Cần Claude Code thật và hạn mức, nên không gắn vào CI; chạy trước mỗi lần tăng bản gói.
// Chạy: node scripts/persona-suite.mjs [--plugin <thư mục gói>] [--only <id>,<id>] [--cases <file>] [--out <file json>]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const DEFAULT_PLUGIN = join(HERE, '../plugins/tinh-nlh');
export const DEFAULT_CASES = join(HERE, 'persona-cases.json');
const TIMEOUT_MS = 180_000;

// Đọc các dòng stream-json của `claude -p`. lines: [{ t: mili giây từ lúc chạy, text: một dòng JSON }]. Trả về chữ người dùng
// thấy (mọi khối chữ của trợ lý, theo thứ tự) và mili giây tới khối chữ đầu tiên; bỏ qua dòng không phải JSON.
export function parseStream(lines) {
  const texts = [];
  let firstTextMs = null;
  for (const { t, text } of lines) {
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      continue;
    }
    if (event?.type !== 'assistant') continue;
    for (const block of event.message?.content ?? []) {
      if (block?.type !== 'text' || !String(block.text ?? '').trim()) continue;
      if (firstTextMs === null) firstTextMs = t;
      texts.push(block.text);
    }
  }
  return { answer: texts.join('\n').trim(), firstTextMs };
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
export function gradeCase({ answer, firstTextMs }, testCase, config) {
  const maxMs = config.maxFirstTextSeconds * 1000;
  const time = { pass: firstTextMs !== null && firstTextMs <= maxMs, seconds: firstTextMs === null ? null : Math.round(firstTextMs / 100) / 10 };
  const lines = nonEmptyLines(answer).length;
  const rows = { pass: testCase.maxLines === undefined || (lines > 0 && lines <= testCase.maxLines), lines, max: testCase.maxLines ?? null };
  const hits = forbiddenHits(answer, config.forbidden, testCase.allow);
  const english = englishLines(answer, config.english);
  const words = { pass: answer !== '' && hits.length === 0 && english.length === 0, hits, english };
  return { id: testCase.id, pass: time.pass && rows.pass && words.pass, time, rows, words };
}

// Bảng ngắn, một dòng mỗi ca, rồi lý do trượt.
export function renderTable(results, config) {
  const cell = (value, width) => String(value).padEnd(width);
  const out = [cell('ca', 22) + cell(`giây (≤${config.maxFirstTextSeconds})`, 14) + cell('dòng', 8) + cell('chữ cấm', 9) + 'kết quả'];
  for (const r of results) {
    const rows = r.rows.max === null ? `${r.rows.lines}` : `${r.rows.lines}/${r.rows.max}`;
    out.push(cell(r.id, 22) + cell(r.time.seconds ?? 'không có', 14) + cell(rows, 8) + cell(r.words.pass ? 'sạch' : 'có', 9) + (r.pass ? 'đạt' : 'TRƯỢT'));
  }
  for (const r of results.filter((item) => !item.pass)) {
    const why = [];
    if (!r.time.pass) why.push(r.time.seconds === null ? 'không có chữ nào' : `chữ đầu sau ${r.time.seconds}s`);
    if (!r.rows.pass) why.push(`${r.rows.lines} dòng, tối đa ${r.rows.max}`);
    if (r.words.hits.length) why.push(`chữ cấm: ${r.words.hits.join(', ')}`);
    if (r.words.english.length) why.push(`câu tiếng Anh: ${r.words.english.map((line) => `"${line.trim().slice(0, 60)}"`).join('; ')}`);
    out.push(`  ${r.id}: ${why.join(' · ')}`);
  }
  return out.join('\n');
}

// Chạy `claude -p` một ca, câu hỏi đưa qua stdin (không dính quy tắc trích dẫn của shell), từ một thư mục trống để phiên
// không nạp CLAUDE.md hay gói nào khác của dự án. Lỗi hook lúc đóng phiên (máy chủ chưa nối) bỏ đi, không in. Trả về các dòng kèm thời gian nhận.
function runClaude(say, pluginDir, cwd, bin = process.env.CLAUDE_BIN || 'claude') {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--plugin-dir', pluginDir,
      '--output-format', 'stream-json',
      '--verbose',
      '--allowedTools', 'mcp__plugin_nlh_nep__*', 'mcp__claude_ai_nhile-governance__*',
    ];
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
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
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
  const opts = { plugin: DEFAULT_PLUGIN, cases: DEFAULT_CASES, only: null, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!value) throw new Error(`thiếu giá trị cho ${flag}`);
    if (flag === '--plugin') opts.plugin = value;
    else if (flag === '--cases') opts.cases = value;
    else if (flag === '--only') opts.only = value.split(',');
    else if (flag === '--out') opts.out = value;
    else throw new Error(`không có cờ ${flag}`);
  }
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
  try {
    for (const testCase of cases) {
      process.stderr.write(`chạy ${testCase.id}…\n`);
      const parsed = parseStream(await runClaude(testCase.say, opts.plugin, cwd));
      results.push(gradeCase(parsed, testCase, config));
      answers.push({ id: testCase.id, say: testCase.say, answer: parsed.answer });
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
  console.log(renderTable(results, config));
  console.log('\nCâu trả lời, để dân làng Trải nghiệm đọc điều (4): có chỉ tới nút hay trang không có thật không?');
  for (const { id, say, answer } of answers) console.log(`\n--- ${id}: "${say}"\n${answer || '(không có chữ nào)'}`);
  if (opts.out) writeFileSync(opts.out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
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
