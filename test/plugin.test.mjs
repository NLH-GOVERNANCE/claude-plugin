// Phép thử plugin nlh, tên cũ tinh-nlh (phiếu "1/4 Plugin tinh-nlh"): dạng JSON của danh mục và manifest, và các lan can
// của gói: không secret, không bin/, hook không gọi mạng, connector đúng địa chỉ bản chính. Chỉ đọc file.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { pluginFiles, pluginZip } from '../scripts/plugin-zip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginDir = join(root, 'plugins/tinh-nlh');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

// Dòng đầu (frontmatter) của file Markdown: các cặp khoá: giá trị giữa hai dòng ---.
function frontMatter(path) {
  // Bản sao trên Windows có thể xuống dòng CRLF.
  const match = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, `${relative(root, path)} thiếu frontmatter`);
  return Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
}

describe('plugin nlh', () => {
  test('danh mục .claude-plugin/marketplace.json: tên, chủ, một plugin nlh đường dẫn tương đối từ gốc repo', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json');
    assert.match(marketplace.name, KEBAB);
    assert.equal(typeof marketplace.owner?.name, 'string');
    assert.equal(marketplace.plugins.length, 1);
    const [entry] = marketplace.plugins;
    assert.equal(entry.name, 'nlh');
    // Đồng bộ của tổ chức chỉ nhận đường dẫn viết đủ, bắt đầu bằng ./, không có ..
    assert.equal(entry.source, './plugins/tinh-nlh');
    assert.ok(existsSync(join(root, entry.source)));
    assert.ok(entry.description);
    // Tên kỹ thuật nlh, tên hiển thị Nếp (anh Sơn chốt 19/10). Ai đang cài tinh-nlh tự chuyển sang nlh, không mất plugin.
    assert.equal(entry.displayName, 'Nếp');
    assert.deepEqual(marketplace.renames, { 'tinh-nlh': 'nlh' });
  });

  test('manifest plugin.json: tên trùng tên trong danh mục, có version, mô tả, tác giả', () => {
    const manifest = readJson('plugins/tinh-nlh/.claude-plugin/plugin.json');
    assert.equal(manifest.name, 'nlh');
    // Người dùng thấy tên Nếp (D-0055), không có chữ "plugin" trong tên.
    assert.equal(manifest.displayName, 'Nếp');
    assert.ok(manifest.version);
    assert.ok(manifest.description);
    assert.ok(manifest.author?.name);
    assert.doesNotThrow(() => new URL(manifest.homepage));
  });

  test('connector: đúng một máy chủ MCP từ xa ở bản chính, không header, không biến môi trường', () => {
    const { mcpServers } = readJson('plugins/tinh-nlh/.mcp.json');
    const servers = Object.values(mcpServers);
    assert.equal(servers.length, 1);
    assert.deepEqual(servers[0], { type: 'http', url: 'https://mcp.nlh.vn/mcp' });
  });

  test('hook đầu phiên in câu dặn gọi my_context và mã phiên, không gọi mạng; sau /clear hay gọn ngữ cảnh gọi my_context (phiếu 1409ab1f); Stop và SessionEnd chỉ báo mã phiên và trạng thái', () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'StopFailure', 'UserPromptSubmit']);
    const byMatcher = Object.fromEntries(hooks.SessionStart.map((group) => [group.matcher, group.hooks]));
    assert.deepEqual(Object.keys(byMatcher).sort(), ['clear|compact', 'startup', 'startup|clear']);
    // Lúc mở phiên, hook mcp_tool bị bỏ qua (máy chủ MCP chưa nối), nên chỉ in lời dặn; echo không gọi mạng.
    assert.equal(byMatcher.startup.length, 1);
    assert.equal(byMatcher.startup[0].type, 'command');
    assert.match(byMatcher.startup[0].command, /^echo "[^"$`]+my_context[^"$`]+"$/);
    assert.deepEqual(byMatcher['startup|clear'], [
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs'] },
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/sign-in-check.mjs'] },
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/machine.mjs'] },
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/local-schedules-hook.mjs'] },
    ]);
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/session-start.mjs'), 'utf8'), /fetch|https?:|node:(http|net|https|fs|child_process)/);
    // Mã máy (D-0065 · 5/5): chỉ đọc, ghi tệp mã máy qua speaker.mjs, không gọi mạng.
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/machine.mjs'), 'utf8'), /fetch|https?:|node:/);
    // Hết hạn mức giữa lượt: báo máy dừng, hub dùng máy của nơi chạy này; việc máy giữ về máy khác cùng dân làng.
    assert.deepEqual(hooks.StopFailure, [
      {
        matcher: 'rate_limit|billing_error',
        hooks: [{ type: 'mcp_tool', server: 'plugin:nlh:nhile-governance', tool: 'report_session', input: { session_id: '${session_id}', status: 'stopped', machine_stop: 'quota' }, timeout: 10 }],
      },
    ]);
    // Sau /clear hay gọn ngữ cảnh: gọi thẳng công cụ, đúng tên máy chủ có phạm vi plugin, không truyền gì thêm.
    const [server] = Object.keys(readJson('plugins/tinh-nlh/.mcp.json').mcpServers);
    assert.deepEqual(byMatcher['clear|compact'], [{ type: 'mcp_tool', server: `plugin:nlh:${server}`, tool: 'my_context', timeout: 30 }]);
    // Phiên tự báo (phiếu 6d4cb2ad): gọi report_session của connector, không gửi nội dung chat.
    for (const [event, status] of [['Stop', 'idle'], ['SessionEnd', 'stopped']]) {
      const hook = hooks[event].flatMap((group) => group.hooks).find((item) => item.tool === 'report_session');
      assert.deepEqual(hook, {
        type: 'mcp_tool',
        server: 'plugin:nlh:nhile-governance',
        tool: 'report_session',
        input: { session_id: '${session_id}', status },
      });
    }
  });

  test('skill nep và sáu lệnh tên tiếng Anh (work, assign, sign, resume, handoff, no-save) có mô tả tiếng Việt, tên Nếp, kèm câu người dùng hay nói; không còn tên lệnh cũ', () => {
    const skill = frontMatter(join(pluginDir, 'skills/nep/SKILL.md'));
    assert.equal(skill.name, 'nep');
    assert.ok(skill.description);
    const files = readdirSync(join(pluginDir, 'commands'));
    for (const old of ['viec', 'giao', 'ky', 'lamtiep', 'bangiao', 'khongluu']) assert.ok(!files.includes(`${old}.md`), old);
    for (const name of ['work', 'assign', 'sign', 'resume', 'handoff', 'no-save']) {
      // Người dùng thấy mô tả trong danh sách lệnh: tiếng Việt, tên Nếp, kèm câu người dùng nói để Claude nhận ra (phiếu 36cdb8bc).
      const { description } = frontMatter(join(pluginDir, `commands/${name}.md`));
      assert.match(description, /Nếp/, name);
      assert.match(description, /Dùng khi người dùng nói "[^"]*[^\u0000-\u007f][^"]*"/, name);
      assert.doesNotMatch(description, /tỉnh NhiLe|Use when/, name);
    }
  });

  // Lệnh và skill cùng tên thì lệnh thắng, skill không bao giờ nạp: Loa từng chạy lệnh cài mỗi 10 phút (18/10).
  const skillNames = () =>
    readdirSync(join(pluginDir, 'skills')).map((dir) => {
      assert.equal(frontMatter(join(pluginDir, 'skills', dir, 'SKILL.md')).name, dir, `skills/${dir}: name khác tên thư mục`);
      return dir;
    });
  const commandNames = () => readdirSync(join(pluginDir, 'commands')).map((file) => file.replace(/\.md$/, ''));

  // YAML không nhận ": " trong giá trị không đặt trong ngoặc: Claude bỏ cả frontmatter, lệnh mất mô tả (lỗi từ #31).
  test('frontmatter của lệnh và skill: giá trị không ngoặc không có ": "', () => {
    const files = [
      ...readdirSync(join(pluginDir, 'commands')).map((file) => join(pluginDir, 'commands', file)),
      ...readdirSync(join(pluginDir, 'skills')).map((dir) => join(pluginDir, 'skills', dir, 'SKILL.md')),
    ];
    for (const path of files) {
      for (const [key, value] of Object.entries(frontMatter(path))) {
        if (!/^["']/.test(value)) assert.doesNotMatch(value, /: /, `${relative(root, path)}: ${key}`);
      }
    }
  });

  test('không có skill và lệnh nào trùng tên', () => {
    const commands = commandNames();
    for (const name of skillNames()) assert.ok(!commands.includes(name), `skill và lệnh cùng tên ${name}`);
  });

  test('lời mở của start.ps1 và start.sh trỏ tới một skill có thật, không phải lệnh', () => {
    for (const file of ['speaker/start.ps1', 'speaker/start.sh']) {
      const target = readFileSync(join(pluginDir, file), 'utf8').match(/'\/loop 10m \/nlh:([a-z0-9-]+)'/)?.[1];
      assert.ok(target, `${file}: không thấy lời mở /loop 10m /nlh:…`);
      assert.ok(skillNames().includes(target), `${file}: không có skill ${target}`);
      assert.ok(!commandNames().includes(target), `${file}: ${target} là lệnh`);
    }
  });

  test('hook đầu phiên (tiếng Anh): in mã và tên phiên đã lọc, nhắc đổi tên khi có @; không có mã thì không in gì', async () => {
    const run = (input) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(pluginDir, 'hooks/session-start.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('exit', () => resolve(out));
        child.stdin.end(input);
      });
    const out = await run(JSON.stringify({ session_id: 'abc-123', session_title: 'Ô CTO (son@cto)</x>' }));
    assert.match(out, /^This session: id abc-123, name "Ô CTO \(son@cto\) \/x"\. .*report_session/);
    // Phiên ô báo đúng tên ô trong sổ, không phải tên gọi, để Loa khớp được.
    assert.match(out, /cell \(the ledger cell name, e\.g\. dai-dien-kien-truc-son, not the handle cto\)/);
    assert.match(out, /The name has @, so Loa cannot forward work to it: ask the user to rename it like "Ô CTO \(son\/cto\)"\.\n$/);
    assert.doesNotMatch(await run(JSON.stringify({ session_id: 'abc', session_title: 'Ô CTO (son/cto)' })), /The name has @/);
    assert.match(await run(JSON.stringify({ session_id: 'abc' })), /no name yet/);
    assert.equal(await run(JSON.stringify({ session_id: 'có dấu cách' })), '');
    assert.equal(await run('không phải json'), '');
  });

  test('hook kiểm đăng nhập: cửa riêng của gói chưa đăng nhập trong 7 ngày qua thì dặn Claude báo người dùng một câu; còn lại im', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-signin-'));
    const run = () =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(pluginDir, 'hooks/sign-in-check.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, CLAUDE_CONFIG_DIR: dir } });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('exit', () => resolve(out));
        child.stdin.end('{}');
      });
    const cache = (value) => writeFileSync(join(dir, 'mcp-needs-auth-cache.json'), typeof value === 'string' ? value : JSON.stringify(value));
    assert.equal(await run(), '', 'không có tệp thì im');
    cache({ 'plugin:nlh:nhile-governance': { timestamp: Date.now() - 60_000 } });
    const out = await run();
    assert.match(out, /^Nếp sign-in check: .*plugin:nlh:nhile-governance.*fail silently/);
    assert.match(out, /"Gói Nếp trên máy này chưa đăng nhập, nên chat phiên này chưa vào giếng: gõ \/mcp, chọn plugin:nlh:nhile-governance, bấm đăng nhập/);
    assert.equal(out.split('\n').filter(Boolean).length, 1);
    cache({ 'plugin:nlh:nhile-governance': { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 } });
    assert.equal(await run(), '', 'cũ hơn 7 ngày thì im');
    cache({ 'claude.ai Gmail': { timestamp: Date.now() } });
    assert.equal(await run(), '', 'cửa khác chưa đăng nhập thì không phải việc của Nếp');
    cache('không phải json');
    assert.equal(await run(), '');
    // Lan can: chỉ đọc một tệp, không gọi mạng, không ghi, không chạy lệnh.
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/sign-in-check.mjs'), 'utf8'), /fetch|https?:|node:(http|net|https|child_process)|writeFile|appendFile|mkdir/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('hook mã máy (D-0065 · 5/5): sinh một lần, giữ nguyên lần sau, dặn báo machine_id và ghi bàn giao trước khi dừng', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-machine-'));
    const run = () =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(pluginDir, 'hooks/machine.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, NLH_MACHINE_DIR: dir } });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('exit', () => resolve(out));
        child.stdin.end('{}');
      });
    const first = await run();
    const id = readFileSync(join(dir, 'machine-id'), 'utf8').trim();
    assert.match(id, /^m-[0-9a-f]{32}$/);
    assert.match(first, new RegExp(`^This machine: id ${id} .*report_session.*status started.*/nlh:handoff.*machine_stop quota or shutdown`));
    assert.equal(await run(), first, 'lần sau cùng mã');
    rmSync(dir, { recursive: true, force: true });
  });

  test('lan can: không có bin/ (claude.ai từ chối cả gói), không có gì trông như khoá hay token', () => {
    assert.equal(existsSync(join(pluginDir, 'bin')), false);
    const secretLike = /((api[_-]?key|secret|password|token)\s*[:=]\s*\S|bearer\s+[A-Za-z0-9._-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})/i;
    for (const path of filesUnder(pluginDir)) {
      assert.doesNotMatch(readFileSync(path, 'utf8'), secretLike, relative(root, path));
    }
  });

  test('file .zip (scripts/plugin-zip.mjs): plugin.json ở gốc zip, đủ mọi file, giải nén ra đúng nội dung, đóng hai lần giống nhau', () => {
    const zip = pluginZip();
    assert.ok(zip.equals(pluginZip()));
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = zip.readUInt16LE(end + 10);
    let at = zip.readUInt32LE(end + 16);
    const names = [];
    for (let i = 0; i < count; i += 1) {
      assert.equal(zip.readUInt32LE(at), 0x02014b50);
      const nameLength = zip.readUInt16LE(at + 28);
      const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
      const local = zip.readUInt32LE(at + 42);
      const packedSize = zip.readUInt32LE(at + 20);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = inflateRawSync(zip.subarray(start, start + packedSize));
      assert.ok(data.equals(readFileSync(join(pluginDir, name))), name);
      names.push(name);
      at += 46 + nameLength;
    }
    assert.deepEqual(names, pluginFiles());
    assert.ok(names.includes('.claude-plugin/plugin.json'));
    assert.ok(names.includes('.mcp.json'));
    assert.ok(names.every((name) => !name.startsWith('/') && !name.includes('..')));
  });

  test('mục "Làm việc trong Claude" của README: tối đa 6 dòng, câu mẫu trước, lệnh là lối tắt', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const section = readme.split('### Làm việc trong Claude')[1].split('\n### ')[0];
    const tips = section.split('\n').filter((line) => line.startsWith('- '));
    assert.ok(tips.length >= 1 && tips.length <= 6, `${tips.length} dòng`);
    for (const tip of tips.filter((line) => line.includes('`/'))) assert.match(tip, /^- "/);
  });

  test('lưu chat (phiếu abdcdd2f): lượt người lúc UserPromptSubmit, lượt Claude lúc Stop, qua save_chat của connector; không gửi kết quả công cụ', () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    const save = (event) => hooks[event].flatMap((group) => group.hooks).filter((hook) => hook.tool === 'save_chat');
    const base = { type: 'mcp_tool', server: 'plugin:nlh:nhile-governance', tool: 'save_chat' };
    // Hạn chờ 5 giây: connector chậm thì Claude vẫn nhận lời ngay, lượt đó chỉ không được lưu.
    assert.deepEqual(save('UserPromptSubmit'), [{ ...base, input: { session_id: '${session_id}', role: 'user', text: '${prompt}' }, timeout: 5 }]);
    assert.deepEqual(save('Stop'), [{ ...base, input: { session_id: '${session_id}', role: 'assistant', text: '${last_assistant_message}' }, timeout: 5 }]);
    assert.deepEqual(save('SessionEnd'), []);
    // Chỉ lưu phiên thật sự dùng tỉnh NhiLe (ô CTO chốt, phiếu abdcdd2f): Claude gọi một công cụ của tỉnh thì báo working.
    // Trừ my_context: phiên nào mở ra cũng gọi (lời dặn đầu phiên), nên không phải dấu đã dùng tỉnh.
    const matcher = new RegExp(hooks.PostToolUse[0].matcher);
    assert.equal(matcher.test('mcp__plugin_nlh_nhile-governance__my_work'), true);
    assert.equal(matcher.test('mcp__plugin_nlh_nhile-governance__save_chat'), true);
    assert.equal(matcher.test('mcp__plugin_nlh_nhile-governance__my_context'), false);
    assert.equal(matcher.test('mcp__other__my_work'), false);
    assert.equal(matcher.test('Bash'), false);
    assert.deepEqual(hooks.PostToolUse[0], {
      matcher: '^mcp__plugin_nlh_nhile-governance__(?!my_context$)',
      hooks: [{ type: 'mcp_tool', server: 'plugin:nlh:nhile-governance', tool: 'report_session', input: { session_id: '${session_id}', status: 'working' } }],
    });
    assert.doesNotMatch(JSON.stringify(hooks), /tool_response|tool_input|transcript_path/);
    const command = readFileSync(join(pluginDir, 'commands/no-save.md'), 'utf8');
    assert.match(command, /`save_chat`.*`role` `opt_out`/);
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
    assert.match(skill, /## Chat saving/);
    assert.match(skill, /`role` `summary`/);
  });

  test('luật làng (việc 92656544): đầu phiên dặn đọc village_rules; câu người dùng sửa thì nhắc ghi luật làng hay playbook, câu thường thì không', async () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    const startup = hooks.SessionStart.find((group) => group.matcher === 'startup').hooks[0].command;
    assert.match(startup, /read village_rules in that result.*\(no such field: get_cell luat-lang, file rules\.md\)/);
    assert.deepEqual(hooks.UserPromptSubmit.flatMap((group) => group.hooks).filter((hook) => hook.type === 'command'), [
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/correction.mjs'], timeout: 5 },
    ]);
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/correction.mjs'), 'utf8'), /fetch|https?:|node:(http|net|https|child_process)/);
    const run = (prompt) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(pluginDir, 'hooks/correction.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('exit', () => resolve(out));
        child.stdin.end(typeof prompt === 'string' ? JSON.stringify({ prompt }) : 'không phải json');
      });
    const reminder =
      'Người dùng đang sửa bạn. Sửa việc trước. Điều chung cho mọi nghề thì thêm một dòng vào luật làng (ô luat-lang); điều chỉ của nghề bạn thì ghi vào playbook dân làng của bạn. Đọc quyết định đã ký liên quan trước.';
    for (const prompt of ['sao không báo chị Nhi', 'Đã chốt rồi mà, nhắc lại lần nữa', 'SAO KHONG bao Danh?', 'lại quên ghi sổ']) {
      assert.deepEqual(JSON.parse(await run(prompt)), { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: reminder } }, prompt);
    }
    for (const prompt of ['việc của tôi hôm nay?', 'Giao cho chị Thùy: soạn hợp đồng', 'saokhông', '']) assert.equal(await run(prompt), '', prompt);
    assert.equal(await run(null), '');
    // Mỗi dấu hiệu một dòng trong file, sửa danh sách không phải sửa code.
    const signals = readJson('plugins/tinh-nlh/hooks/correction-signals.json');
    for (const signal of ['nhắc lại', 'đã chốt', 'trước đó', 'sao không', 'lại quên', 'phải báo']) assert.ok(signals.includes(signal), signal);
  });

  test('cổng trên máy (việc 6c4e1825): trước và sau lệnh Bash hay PowerShell chạy gate/hook.mjs, không gọi connector', () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    const gate = (timeout) => ({ matcher: '^(Bash|PowerShell)$', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/gate/hook.mjs'], timeout }] });
    assert.deepEqual(hooks.PreToolUse, [gate(300)]);
    assert.deepEqual(hooks.PostToolUse[1], gate(30));
    // Thứ ba: tự đẩy nhánh sau git commit (việc eca924c5), chạy riêng sau cổng, hạn 20 giây, không gọi connector.
    assert.deepEqual(hooks.PostToolUse[2], { matcher: '^(Bash|PowerShell)$', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/autopush-hook.mjs'], timeout: 20 }] });
    assert.equal(hooks.PostToolUse.length, 3);
    const matcher = new RegExp(hooks.PreToolUse[0].matcher);
    assert.ok(matcher.test('Bash') && matcher.test('PowerShell') && !matcher.test('mcp__x__Bash'));
  });

  test('skill dặn luôn bàn giao khi dừng, và mở phiếu góp ý cho Tech Lead', () => {
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
    assert.match(skill, /## Handoff \(always\)/);
    assert.match(skill, /kind `handoff`/);
    assert.match(skill, /## Feedback/);
    assert.match(skill, /cell `tech-lead-son`, title starting with "Góp ý:"/);
  });

  test('skill: câu đầu mỗi cuộc trò chuyện gọi my_context, trả lời "tôi đang làm gì dở" không tra thêm, giữ bảng mức nhạy', () => {
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
    assert.match(frontMatter(join(pluginDir, 'skills/nep/SKILL.md')).description, /first turn of every conversation, including web and phone/);
    assert.match(skill, /1\. Call `my_context` once/);
    assert.match(skill, /If the connector has no `my_context` \(old hub\), call `my_work` instead/);
    assert.match(skill, /"tôi đang làm gì dở".+no follow-up questions, no extra lookups/);
    assert.match(skill, /personal account, never open or copy class 3–4 data into the conversation/);
    // Tên phiên ngồi ô dạng người/ô, không @, để Loa gửi được.
    assert.match(skill, /A seated session's name looks like "Ô <display name> \(<person>\/<handle>\)", e\.g\. "Ô CTO \(son\/cto\)", without `@`/);
    // Tin của Loa chỉ có ô và phiếu: phiên tự đọc phiếu rồi nhận.
    assert.match(skill, /When Loa sends a message into this session .*open the ticket with `show_ticket`, `claim` it if it is still waiting/);
  });

  test('không hứa "mở là thấy việc" ở bất cứ đâu, kể cả mô tả trong danh mục và manifest', () => {
    // Hook đầu phiên chỉ chạy ở Claude Code và Cowork; app Claude và điện thoại thì gõ /work (phiếu bdec651d).
    const promise = /(mở|mở claude|mở chat)[^.\n"]{0,20}là thấy việc/i;
    const files = [join(root, 'README.md'), join(root, '.claude-plugin/marketplace.json'), ...filesUnder(pluginDir)];
    for (const path of files) assert.doesNotMatch(readFileSync(path, 'utf8').replace(/Never promise "mở chat là thấy việc"/g, ''), promise, relative(root, path));
  });

  test('/resume chỉ nhận việc chờ chính người dùng; việc đã giao cho ô khác thì hỏi trước, không tự claim', () => {
    const resume = readFileSync(join(pluginDir, 'commands/resume.md'), 'utf8');
    assert.match(resume, /Only claim \(`claim`\) work waiting for the user themself/);
    assert.match(resume, /\(`assigned` in `my_desk`\): only read the handoff and tell it back, do not `claim`/);
    assert.match(resume, /"Muốn tôi làm thay không\?"/);
  });
});

