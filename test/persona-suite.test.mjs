// Phép thử phần chấm của bộ ca "người không rành" (scripts/persona-suite.mjs): thời gian, đếm dòng, chữ cấm, câu tiếng Anh,
// bằng câu trả lời giả. Không gọi Claude thật, nên chạy được trong CI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_CASES, englishLines, forbiddenHits, gradeCase, parseStream, renderTable } from '../scripts/persona-suite.mjs';

const config = JSON.parse(readFileSync(DEFAULT_CASES, 'utf8'));
const byId = (id) => config.cases.find((c) => c.id === id);
const assistant = (...blocks) => JSON.stringify({ type: 'assistant', message: { content: blocks } });
const say = (text) => ({ type: 'text', text });

test('file ca: bảy câu đã đi thật, id không trùng, chữ cấm là regex hợp lệ, ca "chào em" giới hạn 4 dòng', () => {
  assert.deepEqual(
    config.cases.map((c) => c.say),
    ['chào em', 'việc nào chị cần làm trước nhất hôm nay?', 'Nếp có gì mới không em?', 'anh Sơn nhắn cập nhật Nếp, em làm giúp chị nha', 'máy đang làm gì vậy, có bị lỗi không?', 'PowerShell là gì?', 'chị không thấy mục Kết nối'],
  );
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
    { t: 9500, text: assistant(say('  '), say('Chào chị.')) },
    { t: 12000, text: assistant(say('Chị có một việc cần ký.')) },
  ];
  assert.deepEqual(parseStream(lines), { answer: 'Chào chị.\nChị có một việc cần ký.', firstTextMs: 9500 });
  assert.deepEqual(parseStream([{ t: 5, text: assistant({ type: 'tool_use', name: 'x' }) }]), { answer: '', firstTextMs: null });
});

test('chữ đầu tiên: đúng 15 giây còn đạt, 15,1 giây trượt, không có chữ nào là trượt', () => {
  const ok = { answer: 'Chào chị.', firstTextMs: 15000 };
  assert.equal(gradeCase(ok, byId('viec-truoc-nhat'), config).time.pass, true);
  const slow = gradeCase({ ...ok, firstTextMs: 15100 }, byId('viec-truoc-nhat'), config);
  assert.equal(slow.time.pass, false);
  assert.equal(slow.pass, false);
  const none = gradeCase({ answer: '', firstTextMs: null }, byId('viec-truoc-nhat'), config);
  assert.deepEqual([none.time.pass, none.words.pass, none.pass], [false, false, false]);
});

test('đếm dòng: chỉ ca có maxLines bị chấm; dòng trống không tính; 4 dòng đạt, 5 dòng trượt', () => {
  const four = 'Chào chị.\n\nChị có một việc cần ký.\nViệc hai.\nViệc ba.';
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
  // Không bắt: chữ trùng một phần, ngày tháng toàn số, tên người.
  assert.deepEqual(hit('Em soạn xong rồi. Hôm nay 20251028 chị có một việc. Thùy duyệt giúp.'), []);
  assert.deepEqual(hit('Chị Nhi nhờ em prompt lại.'), []);
  assert.deepEqual(forbiddenHits('PowerShell là phần mềm gõ lệnh.', config.forbidden, ['PowerShell']), []);
  const asked = gradeCase({ answer: 'PowerShell là cửa sổ gõ lệnh của Windows.', firstTextMs: 3000 }, byId('powershell-la-gi'), config);
  assert.equal(asked.pass, true);
  const notAsked = gradeCase({ answer: 'Chị mở PowerShell giúp em.', firstTextMs: 3000 }, byId('chao-em'), config);
  assert.deepEqual([notAsked.words.hits, notAsked.pass], [['PowerShell'], false]);
});

test('câu tiếng Anh: dòng có từ ba chữ Anh khác nhau trở lên; câu Việt có vài chữ lẫn không trượt', () => {
  const english = (text) => englishLines(text, config.english);
  assert.deepEqual(english('Chào chị.\nPlease open the page and click this button.'), ['Please open the page and click this button.']);
  assert.deepEqual(english('Chị bấm nút Add rồi mở phiên mới. Nếp is ready.'), []);
  assert.deepEqual(english('Reloaded: 2 plugins · 29 skills · 6 agents · 59 hooks'), []);
  const graded = gradeCase({ answer: 'Chào chị.\nThe plugin is ready and you can start.', firstTextMs: 2000 }, byId('co-gi-moi'), config);
  assert.deepEqual([graded.words.pass, graded.words.english.length, graded.pass], [false, 1, false]);
});

test('bảng kết quả: một dòng mỗi ca, ca trượt kèm lý do, ca đạt thì không', () => {
  const answers = [
    ['chao-em', { answer: 'Chào chị.', firstTextMs: 8200 }],
    ['co-gi-moi', { answer: 'Em gộp PR vào repo rồi.', firstTextMs: 20000 }],
  ];
  const results = answers.map(([id, parsed]) => gradeCase(parsed, byId(id), config));
  const table = renderTable(results, config);
  const rows = table.split('\n');
  assert.match(rows[1], /^chao-em\s+8\.2\s+1\/4\s+sạch\s+đạt$/);
  assert.match(rows[2], /^co-gi-moi\s+20\s+1\s+có\s+TRƯỢT$/);
  assert.equal(rows.length, 4);
  assert.match(rows[3], /^ {2}co-gi-moi: chữ đầu sau 20s · chữ cấm: PR, repo$/);
  assert.doesNotMatch(table, /chao-em:/);
});
