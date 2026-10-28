// Phép thử phần chấm của bộ ca "người không rành" (scripts/persona-suite.mjs): thời gian, đếm dòng, chữ cấm, câu tiếng Anh,
// bằng câu trả lời giả. Không gọi Claude thật, nên chạy được trong CI.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CASES, blockedTools, allowedTools, englishLines, forbiddenHits, activeSessions, gradeCase, gradeRuns, median, parseStream, renderTable, renderTrace } from '../scripts/persona-suite.mjs';

const config = JSON.parse(readFileSync(DEFAULT_CASES, 'utf8'));
const byId = (id) => config.cases.find((c) => c.id === id);
const assistant = (...blocks) => JSON.stringify({ type: 'assistant', message: { content: blocks } });
const say = (text) => ({ type: 'text', text });

test('file ca: tám câu đã đi thật, id không trùng, chữ cấm là regex hợp lệ, ca "chào em" giới hạn 4 dòng', () => {
  assert.deepEqual(
    config.cases.map((c) => c.say),
    ['chào em', 'việc nào chị cần làm trước nhất hôm nay?', 'Nếp có gì mới không em?', 'anh Sơn nhắn cập nhật Nếp, em làm giúp chị nha', 'máy đang làm gì vậy, có bị lỗi không?', 'PowerShell là gì?', 'chị không thấy mục Kết nối', 'chào em, hôm nay chị có việc gì không?'],
  );
  assert.equal(byId('chua-co-ket-noi').noNep, true);
  assert.equal(new Set(config.cases.map((c) => c.id)).size, config.cases.length);
  assert.equal(byId('chao-em').maxLines, 4);
  assert.equal(config.maxFirstTextSeconds, 15);
  for (const { re, flags } of config.forbidden) assert.doesNotThrow(() => new RegExp(re, flags));
  // Mọi chữ trong danh sách của ticket có mặt.
  for (const label of ['PR', 'repo', 'hub', 'commit', 'D-00xx', 'mã việc', '/mcp', '/reload-plugins', 'PowerShell', 'lệnh claude', 'Connect', 'email công ty']) {
    assert.ok(config.forbidden.some((f) => f.label === label), label);
  }
});

test('đọc stream: lấy chữ của trợ lý theo thứ tự, thời gian tới khối chữ đầu tiên; bỏ qua công cụ và dòng lạ', () => {
  const lines = [
    { t: 100, text: JSON.stringify({ type: 'system', subtype: 'init' }) },
    { t: 4000, text: assistant({ type: 'tool_use', name: 'my_context', input: {} }) },
    { t: 4100, text: 'không phải json' },
    { t: 9500, text: assistant(say('  '), say('Chào bạn.')) },
    { t: 12000, text: assistant(say('Bạn có một việc cần ký.')) },
  ];
  const parsed = parseStream(lines);
  assert.equal(parsed.answer, 'Chào bạn.\nBạn có một việc cần ký.');
  assert.equal(parsed.firstTextMs, 9500);
  assert.equal(parsed.startupMs, 100);
  assert.deepEqual(parseStream([{ t: 5, text: assistant({ type: 'tool_use', name: 'x' }) }]).answer, '');
  assert.equal(parseStream([{ t: 5, text: assistant({ type: 'tool_use', name: 'x' }) }]).firstTextMs, null);
});

test('dấu vết công cụ: tên bỏ tiền tố máy chủ, giờ gọi và giờ có kết quả, rồi chữ đầu; thiếu kết quả ghi dấu ?', () => {
  const user = (id) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'x' }] } });
  const lines = [
    { t: 2100, text: assistant({ type: 'tool_use', id: 'a', name: 'mcp__plugin_nlh_nep__my_context', input: {} }) },
    { t: 5000, text: user('a') },
    { t: 5200, text: assistant({ type: 'tool_use', id: 'b', name: 'mcp__claude_ai_nhile-governance__show_ticket', input: {} }) },
    { t: 9000, text: assistant(say('Chào bạn.')) },
  ];
  const parsed = parseStream(lines);
  assert.deepEqual(parsed.tools, [
    { name: 'my_context', startMs: 2100, endMs: 5000 },
    { name: 'show_ticket', startMs: 5200, endMs: null },
  ]);
  assert.equal(renderTrace(parsed), 'my_context 2.1→5s · show_ticket 5.2→?s · chữ đầu 9s');
  assert.equal(renderTrace({ ...parsed, startupMs: 8000 }), 'mở 8s · my_context 2.1→5s · show_ticket 5.2→?s · chữ đầu 9s');
  assert.equal(renderTrace({ tools: [], firstTextMs: null }), 'chữ đầu ?s');
});

test('đồng hồ tính từ lúc phiên mở: khởi động không tính vào 15 giây, nhưng vẫn có cột riêng', () => {
  const late = { answer: 'Chào bạn.', firstTextMs: 21000, startupMs: 8000 };
  const graded = gradeCase(late, byId('viec-truoc-nhat'), config);
  assert.deepEqual([graded.time.pass, graded.time.seconds, graded.time.startup], [true, 13, 8]);
  assert.equal(gradeCase({ ...late, firstTextMs: 23100 }, byId('viec-truoc-nhat'), config).time.pass, false);
  // Không thấy lúc phiên mở: tính từ lúc chạy, cột khởi động trống.
  const none = gradeCase({ answer: 'Chào bạn.', firstTextMs: 12000 }, byId('viec-truoc-nhat'), config);
  assert.deepEqual([none.time.seconds, none.time.startup], [12, null]);
  const table = renderTable([graded, none], config).split('\n');
  assert.match(table[1], /^viec-truoc-nhat\s+13\s+-\s+8\s/);
  assert.match(table[2], /^viec-truoc-nhat\s+12\s+-\s+\?\s/);
});

test('chạy ba lần: thời gian đạt khi trung vị ≤15 giây; chữ cấm, dòng, câu tiếng Anh phải đạt cả ba lần', () => {
  const run = (seconds, answer = 'Chào bạn.') => ({ answer, firstTextMs: seconds * 1000, startupMs: 0 });
  const grade = (runs, id = 'viec-truoc-nhat') => gradeRuns(runs, byId(id), config);
  assert.equal(median([14, 20, 9]), 14);
  assert.equal(median([null, 5, 6]), 6);
  // Một lần chậm không làm trượt khi trung vị đạt; ghi đủ ba số.
  const ok = grade([run(9), run(17), run(14)]);
  assert.deepEqual([ok.time.pass, ok.time.seconds, ok.time.all, ok.pass], [true, 14, [9, 17, 14], true]);
  // Hai lần chậm: trung vị trượt.
  const slow = grade([run(9), run(17), run(16)]);
  assert.deepEqual([slow.time.pass, slow.time.seconds, slow.pass], [false, 16, false]);
  // Thiếu chữ ở hai trong ba lần: trượt.
  const none = grade([run(9), { answer: '', firstTextMs: null }, { answer: '', firstTextMs: null }]);
  assert.deepEqual([none.time.pass, none.time.seconds], [false, null]);
  // Một lần có chữ cấm là trượt dù hai lần kia sạch và nhanh.
  const dirty = grade([run(5), run(5, 'Em gộp PR vào repo rồi.'), run(5)]);
  assert.deepEqual([dirty.time.pass, dirty.words.pass, dirty.words.hits, dirty.pass], [true, false, ['PR', 'repo'], false]);
  // Quá số dòng ở một lần cũng trượt.
  const long = 'Chào bạn.\nMột.\nHai.\nBa.\nBốn.';
  const over = grade([run(5), run(5, long), run(5)], 'chao-em');
  assert.deepEqual([over.rows.pass, over.rows.lines, over.pass], [false, 5, false]);
  const table = renderTable([ok], config).split('\n');
  assert.match(table[1], /^viec-truoc-nhat\s+14\s+9 · 17 · 14\s/);
  assert.equal(renderTable([dirty], config).split('\n')[2], '  viec-truoc-nhat: chữ cấm: PR, repo');
});

test('số phiên khác đang chạy: đếm file chat vừa ghi trong 2 phút, bỏ phiên của chính bộ ca', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nlh-sessions-'));
  try {
    const now = Date.now();
    const touch = (project, file, agoSeconds) => {
      mkdirSync(join(dir, project), { recursive: true });
      const path = join(dir, project, file);
      writeFileSync(path, '{}');
      const at = new Date(now - agoSeconds * 1000);
      utimesSync(path, at, at);
    };
    touch('C--Users-Admin-repo', 'a.jsonl', 10);
    touch('C--Users-Admin-repo', 'b.jsonl', 30);
    touch('C--Users-Admin-repo', 'old.jsonl', 600);
    touch('C--Users-Admin-repo', 'note.txt', 5);
    touch('C--Users-Admin-AppData-Local-Temp-nlh-persona-x1', 'own.jsonl', 5);
    assert.equal(activeSessions(now, dir), 2);
    assert.equal(activeSessions(now, join(dir, 'không-có')), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('chữ đầu tiên: đúng 15 giây còn đạt, 15,1 giây trượt, không có chữ nào là trượt', () => {
  const ok = { answer: 'Chào bạn.', firstTextMs: 15000 };
  assert.equal(gradeCase(ok, byId('viec-truoc-nhat'), config).time.pass, true);
  const slow = gradeCase({ ...ok, firstTextMs: 15100 }, byId('viec-truoc-nhat'), config);
  assert.equal(slow.time.pass, false);
  assert.equal(slow.pass, false);
  const none = gradeCase({ answer: '', firstTextMs: null }, byId('viec-truoc-nhat'), config);
  assert.deepEqual([none.time.pass, none.words.pass, none.pass], [false, false, false]);
});

test('đếm dòng: chỉ ca có maxLines bị chấm; dòng trống không tính; 4 dòng đạt, 5 dòng trượt', () => {
  const four = 'Chào bạn.\n\nBạn có một việc cần ký.\nViệc hai.\nViệc ba.';
  assert.equal(gradeCase({ answer: four, firstTextMs: 1000 }, byId('chao-em'), config).rows.lines, 4);
  assert.equal(gradeCase({ answer: four, firstTextMs: 1000 }, byId('chao-em'), config).pass, true);
  const five = `${four}\nViệc bốn.`;
  const over = gradeCase({ answer: five, firstTextMs: 1000 }, byId('chao-em'), config);
  assert.deepEqual([over.rows.lines, over.rows.pass, over.pass], [5, false, false]);
  // Ca không ghi maxLines thì dài mấy dòng cũng không trượt vì dòng.
  assert.equal(gradeCase({ answer: five, firstTextMs: 1000 }, byId('co-gi-moi'), config).rows.pass, true);
});

test('chữ cấm: bắt từng chữ của ticket, không bắt chữ trùng một phần; ca cho phép thì bỏ qua chữ đó', () => {
  const hit = (text) => forbiddenHits(text, config.forbidden);
  assert.deepEqual(hit('Em đã gộp PR mới vào repo, commit xong rồi.'), ['PR', 'repo', 'commit']);
  assert.deepEqual(hit('Việc D-0086 đã ký, hub báo ổn.'), ['hub', 'D-00xx']);
  assert.deepEqual(hit('Mã việc cf0183a7 đang chờ.'), ['mã việc']);
  assert.deepEqual(hit('Gõ /mcp rồi /reload-plugins, bấm Connect, đăng nhập bằng email công ty.'), ['/mcp', '/reload-plugins', 'Connect', 'email công ty']);
  assert.deepEqual(hit('Mở PowerShell, gõ claude plugin update.'), ['PowerShell', 'lệnh claude']);
  assert.deepEqual(hit('Claude Code chạy lệnh giúp bạn, mở Claude Code là xong.'), []);
  // Không bắt: chữ trùng một phần, ngày tháng toàn số, tên người.
  assert.deepEqual(hit('Em soạn xong rồi. Hôm nay 20251028 chị có một việc. Thùy duyệt giúp.'), []);
  assert.deepEqual(hit('Chị Nhi nhờ em prompt lại.'), []);
  assert.deepEqual(forbiddenHits('PowerShell là phần mềm gõ lệnh.', config.forbidden, ['PowerShell']), []);
  // Chữ bên trong mà người dùng không cần biết (28/10): giờ UTC, mã máy, phiên cũ; câu thường có "phiên mới" thì không bắt.
  assert.deepEqual(hit('Lần báo gần nhất là 13:15 UTC.'), ['UTC']);
  assert.deepEqual(hit('Mỗi phiên tự sinh một mã máy, nên danh sách dài.'), ['mã máy', 'phiên (chữ bên trong)']);
  assert.deepEqual(hit('Đang có phiên khác giữ nên cứ để phiên đó làm.'), ['phiên (chữ bên trong)']);
  assert.deepEqual(hit('Đăng nhập rồi mở phiên mới. Máy này báo lúc 8 giờ tối.'), []);
  // Xưng hô: ca người dùng nói "chị" mà trả lời gọi "anh" thì trượt; ca chưa nói gì thì "anh" hay "chị" đều là đoán.
  const addressed = (id, answer) => gradeCase({ answer, firstTextMs: 1000 }, byId(id), config);
  assert.deepEqual(addressed('viec-truoc-nhat', 'Chào anh Sơn, việc đầu là gộp bản sửa.').words.hits, ['gọi anh ở ca chị']);
  assert.equal(addressed('viec-truoc-nhat', 'Việc đầu của chị là gộp bản sửa.').pass, true);
  assert.deepEqual(addressed('chao-em', 'Chào chị Nhi.').words.hits, ['đoán xưng hô']);
  assert.equal(addressed('chao-em', 'Chào Sơn, bạn cần em làm gì ạ?').pass, true);
  const asked = gradeCase({ answer: 'PowerShell là cửa sổ gõ lệnh của Windows.', firstTextMs: 3000 }, byId('powershell-la-gi'), config);
  assert.equal(asked.pass, true);
  const notAsked = gradeCase({ answer: 'Bạn mở PowerShell giúp em.', firstTextMs: 3000 }, byId('chao-em'), config);
  assert.deepEqual([notAsked.words.hits, notAsked.pass], [['PowerShell'], false]);
});

test('câu tiếng Anh: dòng có từ ba chữ Anh khác nhau trở lên; câu Việt có vài chữ lẫn không trượt', () => {
  const english = (text) => englishLines(text, config.english);
  assert.deepEqual(english('Chào bạn.\nPlease open the page and click this button.'), ['Please open the page and click this button.']);
  assert.deepEqual(english('Chị bấm nút Add rồi mở phiên mới. Nếp is ready.'), []);
  assert.deepEqual(english('Reloaded: 2 plugins · 29 skills · 6 agents · 59 hooks'), []);
  const graded = gradeCase({ answer: 'Chào bạn.\nThe plugin is ready and you can start.', firstTextMs: 2000 }, byId('co-gi-moi'), config);
  assert.deepEqual([graded.words.pass, graded.words.english.length, graded.pass], [false, 1, false]);
});

test('bảng kết quả: một dòng mỗi ca, ca trượt kèm lý do, ca đạt thì không', () => {
  const answers = [
    ['chao-em', { answer: 'Chào bạn.', firstTextMs: 8200 }],
    ['co-gi-moi', { answer: 'Em gộp PR vào repo rồi.', firstTextMs: 20000 }],
  ];
  const results = answers.map(([id, parsed]) => gradeCase(parsed, byId(id), config));
  const table = renderTable(results, config);
  const rows = table.split('\n');
  assert.match(rows[1], /^chao-em\s+8\.2\s+-\s+\?\s+1\/4\s+sạch\s+đạt$/);
  assert.match(rows[2], /^co-gi-moi\s+20\s+-\s+\?\s+1\s+có\s+TRƯỢT$/);
  assert.equal(rows.length, 4);
  assert.match(rows[3], /^ {2}co-gi-moi: chữ đầu sau 20s · chữ cấm: PR, repo$/);
  assert.doesNotMatch(table, /chao-em:/);
});

test('công cụ được gọi thật khi chạy bộ ca: chỉ công cụ đọc của Nếp, tên đầy đủ, đủ hai máy chủ; không có công cụ ghi và không có dấu *', () => {
  const all = allowedTools(config);
  const tools = all.filter((tool) => tool.startsWith('mcp__'));
  assert.equal(tools.length, config.readTools.length * 2);
  assert.ok(tools.includes('mcp__plugin_nlh_nep__my_context'));
  assert.ok(tools.includes('mcp__claude_ai_nhile-governance__my_context'));
  for (const tool of tools) assert.match(tool, /^mcp__(plugin_nlh_nep|claude_ai_nhile-governance)__[a-z_]+$/);
  // Mọi công cụ đọc bắt đầu bằng một động từ đọc; công cụ ghi không lọt vào.
  for (const name of config.readTools) assert.match(name, /^(my_|show_|find_|get_|list_|read_)|^(how_to_use|whoami|library)$/, name);
  const writes = ['save_chat', 'open_ticket', 'add_follow_up', 'report_session', 'run_action', 'continue_work', 'propose_change', 'request_signature', 'record_run', 'save_cell', 'post_message', 'invite_person', 'remove_person', 'set_machine_seats', 'connect_channel'];
  for (const name of writes) assert.ok(!config.readTools.includes(name), name);
  // Công cụ ghi bị chặn hẳn (--disallowedTools): có đủ danh sách cũ, không trùng công cụ đọc, tên đầy đủ hai máy chủ.
  const blocked = blockedTools(config);
  assert.equal(blocked.length, config.writeTools.length * 2);
  for (const name of writes) assert.ok(config.writeTools.includes(name), name);
  assert.ok(blocked.includes('mcp__plugin_nlh_nep__report_session') && blocked.includes('mcp__claude_ai_nhile-governance__save_chat'));
  for (const tool of blocked) assert.ok(!all.includes(tool), tool);
});

test('lệnh được chạy thật chỉ là lệnh cập nhật gói (và xem danh sách gói), không có lệnh nào khác', () => {
  const commands = allowedTools(config).filter((tool) => !tool.startsWith('mcp__'));
  assert.ok(commands.length > 0);
  for (const command of commands) assert.match(command, /^(Bash|PowerShell)\(claude plugin (marketplace update nlh-governance|update nlh@nlh-governance|list):\*\)$/, command);
  assert.ok(commands.includes('Bash(claude plugin update nlh@nlh-governance:*)'));
  assert.ok(commands.includes('PowerShell(claude plugin update nlh@nlh-governance:*)'));
  // Cờ --no-update: không còn lệnh nào, chỉ còn công cụ đọc của Nếp.
  assert.deepEqual(allowedTools(config, { update: false }).filter((tool) => !tool.startsWith('mcp__')), []);
});

test('ca "chưa có kết nối Nếp": câu trả lời phải có link thêm Nếp, thiếu thì trượt và nói thiếu gì', () => {
  const testCase = byId('chua-co-ket-noi');
  const link = 'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp';
  const ok = gradeCase({ answer: `Chị mở link này để nối Nếp: ${link}`, firstTextMs: 5000 }, testCase, config);
  assert.deepEqual([ok.words.pass, ok.words.missing, ok.pass], [true, [], true]);
  const bare = gradeCase({ answer: 'Chị cần nối Nếp trước.', firstTextMs: 5000 }, testCase, config);
  assert.deepEqual([bare.words.pass, bare.words.missing, bare.pass], [false, ['link thêm Nếp'], false]);
  assert.deepEqual(gradeRuns([{ answer: 'Chào bạn.', firstTextMs: 1000 }], testCase, config).words.missing, ['link thêm Nếp']);
});
