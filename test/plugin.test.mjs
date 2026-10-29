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
import { pluginVersion } from '../plugins/tinh-nlh/speaker/speaker.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginDir = join(root, 'plugins/tinh-nlh');
// Từ 0.23.1 gói không mang máy chủ Nếp riêng: Nếp là connector gắn vào tài khoản Claude (không đăng nhập lần hai). Hook vẫn gọi
// plugin:nlh:nep trước cho máy còn bản cũ (tên không nối thì hook bỏ qua), rồi connector tài khoản theo các tên nó có.
const DOORS = ['plugin:nlh:nep', 'claude.ai Nếp', 'Nếp', 'claude.ai nhile-governance', 'nhile-governance', 'claude.ai NhiLe Governance', 'NhiLe Governance', '3398cc99-b4dc-41bd-8007-bd4b6792d5cb'];
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

  test('connector: gói chỉ mang Loa (stdio, trên máy), không có máy chủ Nếp riêng (tránh đăng nhập lần hai); không có .mcp.json riêng', () => {
    assert.equal(existsSync(join(pluginDir, '.mcp.json')), false);
    const { mcpServers } = readJson('plugins/tinh-nlh/.claude-plugin/plugin.json');
    assert.deepEqual(Object.keys(mcpServers), ['speaker']);
    // Máy chủ của gói trùng địa chỉ với connector tài khoản sẽ che nó và đòi đăng nhập riêng (đo 28/10): không mang.
    assert.doesNotMatch(JSON.stringify(mcpServers), /mcp\.nlh\.vn/);
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
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/self-update.mjs'] },
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/local-schedules-hook.mjs'] },
    ]);
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/session-start.mjs'), 'utf8'), /fetch|https?:|node:(http|net|https|fs|child_process)/);
    // Mã máy (D-0065 · 5/5): chỉ đọc, ghi tệp mã máy qua speaker.mjs, không gọi mạng.
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/machine.mjs'), 'utf8'), /fetch|https?:|node:/);
    // Hết hạn mức giữa lượt: báo máy dừng, hub dùng máy của nơi chạy này; việc máy giữ về máy khác cùng dân làng.
    assert.deepEqual(hooks.StopFailure, [
      {
        matcher: 'rate_limit|billing_error',
        hooks: DOORS.map((server) => ({ type: 'mcp_tool', server, tool: 'report_session', input: { session_id: '${session_id}', status: 'stopped', machine_stop: 'quota' }, timeout: 10 })),
      },
    ]);
    // Sau /clear hay gọn ngữ cảnh: gọi thẳng my_context của connector Nếp trong tài khoản, theo mọi tên nó có.
    assert.deepEqual(byMatcher['clear|compact'], DOORS.map((server) => ({ type: 'mcp_tool', server, tool: 'my_context', timeout: 30 })));
    // Phiên tự báo (phiếu 6d4cb2ad): gọi report_session của connector, không gửi nội dung chat.
    for (const [event, status] of [['Stop', 'idle'], ['SessionEnd', 'stopped']]) {
      const found = hooks[event].flatMap((group) => group.hooks).filter((item) => item.tool === 'report_session');
      assert.deepEqual(found, DOORS.map((server) => ({ type: 'mcp_tool', server, tool: 'report_session', input: { session_id: '${session_id}', status } })));
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

  test('hook trí nhớ máy: ghi vào trí nhớ riêng của máy thì dặn Claude ghi điều người dạy vào Nếp; tệp khác thì im', async () => {
    const run = (input) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(pluginDir, 'hooks/memory-to-nep.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('exit', () => resolve(out));
        child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
      });
    const write = (file_path, tool_name = 'Write') => ({ hook_event_name: 'PostToolUse', tool_name, tool_input: { file_path, content: 'khoá bí mật không đọc' } });
    for (const path of [
      '/home/son/.claude/projects/-home-son-work/memory/MEMORY.md',
      '/root/.claude/projects/-home-user/memory/feedback_timezone.md',
      'C:\\Users\\Son\\.claude\\projects\\C--Users-Son-work\\memory\\son_rules.md',
      '/home/son/.claude/CLAUDE.md',
    ]) {
      const out = JSON.parse(await run(write(path, 'Edit')));
      assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse', path);
      assert.match(out.hookSpecificOutput.additionalContext, /^You just wrote to this machine's own memory.*add_follow_up kind lesson.*said_by the user.*pointer only/);
    }
    for (const path of ['/home/son/work/api/CLAUDE.md', '/home/son/work/api/memory/notes.md', '/home/son/.claude/settings.json', '/home/son/.claude/projects/x/notes.md']) {
      assert.equal(await run(write(path)), '', path);
    }
    assert.equal(await run({ hook_event_name: 'PreToolUse', tool_input: { file_path: '/home/son/.claude/CLAUDE.md' } }), '');
    assert.equal(await run('không phải json'), '');
    // Lan can: không đọc tệp, không gọi mạng, không ghi, không chạy lệnh.
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/memory-to-nep.mjs'), 'utf8'), /fetch|https?:|node:(fs|http|net|https|child_process)/);
  });

  test('hook dòng connector Nếp: một dòng cho mọi cửa; Nếp là connector tài khoản, không bao giờ dặn gõ /mcp hay "email công ty"; cần nối lại thì chỉ dặn mở link rồi mở phiên mới', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nlh-signin-'));
    const run = (cloud = false) =>
      new Promise((resolve) => {
        const env = { ...process.env, CLAUDE_CONFIG_DIR: dir };
        delete env.CLAUDE_CODE_REMOTE;
        if (cloud) env.CLAUDE_CODE_REMOTE = 'true';
        const child = spawn(process.execPath, [join(pluginDir, 'hooks/sign-in-check.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('exit', () => resolve(out));
        child.stdin.end('{}');
      });
    const cache = (value) => writeFileSync(join(dir, 'mcp-needs-auth-cache.json'), typeof value === 'string' ? value : JSON.stringify(value));
    const link = 'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp';
    const machine = await run();
    assert.match(machine, /^Nếp connector: Nếp comes from the Nếp connector of the user's Claude account; this plugin has no Nếp server of its own\./);
    assert.ok(machine.includes(`"Nếp chưa nối vào Claude của bạn: mở ${link} , làm theo màn hình, đăng nhập bằng email bạn đang dùng trong NhiLe Holding hay NhiLe Team, rồi mở phiên mới."`));
    assert.equal(machine.split('\n').filter(Boolean).length, 1);
    // Không chữ nào bắt người dùng gõ /mcp, đăng nhập bằng email công ty, hay bấm nút màn hình không có.
    const spoken = machine.match(/"[^"]+"/g).join(' ');
    assert.doesNotMatch(spoken, /\/mcp|email công ty|Connect|Add|Customize|plugin:nlh:nep/);
    assert.equal(await run(true), machine, 'mây và máy cùng một dòng');
    // Link mở đúng hộp Add custom connector, điền sẵn tên Nếp và cửa mcp.nlh.vn.
    const url = new URL(link);
    assert.equal(url.searchParams.get('modal'), 'add-custom-connector');
    assert.equal(url.searchParams.get('connectorName'), 'Nếp');
    assert.equal(url.searchParams.get('connectorUrl'), 'https://mcp.nlh.vn/mcp');
    cache({ Nếp: { timestamp: Date.now() - 60_000 } });
    const waiting = await run();
    assert.ok(waiting.includes('Claude Code lists Nếp as needing sign-in'));
    assert.ok(waiting.includes(`"Nếp cần nối lại: mở ${link} , làm theo màn hình, đăng nhập bằng email bạn đang dùng trong NhiLe Holding hay NhiLe Team, rồi mở phiên mới."`));
    assert.equal(waiting.split('\n').filter(Boolean).length, 1);
    // Mục cũ của máy chủ riêng trong gói (bản 0.22) còn trong tệp thì không tính: máy chủ đó không còn.
    cache({ 'plugin:nlh:nep': { timestamp: Date.now() - 60_000 } });
    assert.equal(await run(), machine);
    cache({ Nếp: { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 } });
    assert.equal(await run(), machine, 'cũ hơn 7 ngày thì chỉ còn dòng nối');
    cache({ 'claude.ai Gmail': { timestamp: Date.now() } });
    assert.equal(await run(), machine, 'connector khác cần đăng nhập không phải việc của Nếp');
    cache('không phải json');
    assert.equal(await run(), machine);
    // Lan can: chỉ đọc một tệp, không gọi mạng, không ghi, không chạy lệnh.
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/sign-in-check.mjs'), 'utf8'), /fetch\(|node:(http|net|https|child_process)|writeFile|appendFile|mkdir/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('hướng dẫn cài (SETUP.md, README): người dùng không thấy "email công ty", "tỉnh NhiLe", /mcp hay trang Khoá cho Loa không có thật; câu xong đúng chữ đã chốt', () => {
    const setup = readFileSync(join(root, 'SETUP.md'), 'utf8').replace(/\r/g, '');
    const readme = readFileSync(join(root, 'README.md'), 'utf8').replace(/\r/g, '');
    // Phần cho người (trước "## For Claude") và mọi câu Claude được dặn nói thành lời (trong ngoặc kép sau "say").
    const forUser = setup.split('## For Claude')[0];
    const said = [...setup.matchAll(/say "([^"]+)"/g)].map((m) => m[1]).join('\n');
    for (const text of [forUser, said]) assert.doesNotMatch(text, /email công ty|tỉnh NhiLe|\/mcp|\/reload-plugins|PowerShell|Khoá cho Loa/);
    // Phần README cho người dùng (trước "## Cho người bảo trì"): không chữ cũ (ô, phiếu, Tháp), không mã việc, không việc chờ ký.
    const readmeUser = readme.split('## Cho người bảo trì')[0].replace(/\*\*Loa tỉnh NhiLe\*\*/g, '');
    for (const text of [readmeUser, forUser, said]) assert.doesNotMatch(text, /email công ty|tỉnh NhiLe|phiếu|(^|[\s(])ô([\s).,:;]|$)|Tháp|Danh ký|việc [0-9a-f]{8}|26f86f3d/m);
    assert.doesNotMatch(readmeUser, /Khoá cho Loa|Tạo khoá mới|bật Loa/);
    assert.match(said, /đăng nhập bằng email bạn đang dùng trong NhiLe Holding hay NhiLe Team/);
    // Hai câu xong dùng "bạn", không đoán giới; Claude đổi cách xưng hô theo người dùng.
    assert.ok(setup.includes('"Xong rồi. Từ giờ việc mới sẽ tự hiện trong Claude, bạn không cần hỏi."'));
    assert.ok(setup.includes('"Xong rồi. Bạn cứ mở Claude và hỏi việc của bạn."'));
    assert.doesNotMatch(setup.split('### 6. Report')[1], /Xong rồi chị|chị không cần/);
    // Loa bật bằng nút Cho phép (mục D): SETUP.md gọi lệnh speaker, người dùng chỉ được hỏi đúng một nút, không khoá, không lệnh.
    assert.match(setup, /### 4\. Loa \(Windows and macOS\)/);
    assert.match(setup, /Run the plugin command `speaker`/);
    assert.match(setup, /never ask for or accept a key in chat/);
    assert.match(said, /bấm Cho phép ở trang Nếp vừa mở/);
    // Máy chỉ có app Claude (ca thường gặp nhất, 28/10): claude không nằm trong PATH thì không dừng, dùng chính chương trình đang chạy phiên
    // hay bản đi kèm app; người dùng không nghe "PATH", "lệnh claude", "Claude Code", "bước N".
    const find = setup.slice(setup.indexOf('### 1. Find the OS'), setup.indexOf('### 2.'));
    assert.match(find, /CLAUDE_CODE_EXECPATH/);
    assert.match(find, /Claude-Data.*claude-code.*claude\.exe/);
    assert.match(find, /by its full path/);
    assert.doesNotMatch(find, /stop and say Claude Code is not on the PATH/);
    assert.doesNotMatch(said, /PATH|lệnh claude|Claude Code|step \d|bước \d/i);
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
    // Bản gói (plugin_version) đọc từ plugin.json, đi cùng machine_id trong cùng một lần báo; không dặn gì khác về gói.
    const version = JSON.parse(readFileSync(join(pluginDir, '.claude-plugin/plugin.json'), 'utf8')).version;
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.ok(first.includes(`Also pass plugin_version ${version} (this plugin's version) in the same call, nothing else about the plugin.`));
    assert.equal(pluginVersion(), version);
    // Múi giờ của máy: Claude nói giờ của công cụ (UTC) theo giờ người dùng, không nói UTC.
    assert.match(first, /Time zone of this machine: \S+ \(UTC[+-]\d+(\.\d+)?\)\. .*never the word UTC\.\n$/);
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
    assert.match(skill, /Never pick anh or chị from a name\./);
    assert.match(skill, /Never the word UTC or a zone name\./);
    assert.match(skill, /never an id, "mã máy", "phiên"/);
    // Tệp lạ hay không đọc được thì không dặn gì (không bịa bản).
    const bad = join(dir, 'plugin.json');
    assert.equal(pluginVersion(bad), null, 'không có tệp');
    for (const content of ['không phải json', '{}', '{"version":"latest"}', '{"version":"1.2"}', '{"version":"1.2.3 && rm"}']) {
      writeFileSync(bad, content);
      assert.equal(pluginVersion(bad), null, content);
    }
    writeFileSync(bad, '{"version":"1.2.3-beta.1"}');
    assert.equal(pluginVersion(bad), '1.2.3-beta.1');
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
    assert.ok(!names.includes('.mcp.json'));
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
    // Gọi connector Nếp trong tài khoản theo mọi tên nó có; tên nào không có thì hook đó bỏ qua. Một người có hai bản
    // connector cùng tới thì giếng bỏ bản trùng trong 2 phút (api chats.mjs).
    const both = (input) => DOORS.map((server) => ({ type: 'mcp_tool', server, tool: 'save_chat', input, timeout: 5 }));
    // Hạn chờ 5 giây: connector chậm thì Claude vẫn nhận lời ngay, lượt đó chỉ không được lưu.
    assert.deepEqual(save('UserPromptSubmit'), both({ session_id: '${session_id}', role: 'user', text: '${prompt}' }));
    assert.deepEqual(save('Stop'), both({ session_id: '${session_id}', role: 'assistant', text: '${last_assistant_message}' }));
    assert.deepEqual(save('SessionEnd'), []);
    // Chỉ lưu phiên thật sự dùng tỉnh NhiLe (ô CTO chốt, phiếu abdcdd2f): Claude gọi một công cụ của tỉnh thì báo working.
    // Trừ my_context: phiên nào mở ra cũng gọi (lời dặn đầu phiên), nên không phải dấu đã dùng tỉnh.
    const matcher = new RegExp(hooks.PostToolUse[0].matcher);
    for (const server of ['plugin_nlh_nep', 'claude_ai_N_p', 'claude_ai_Nep', 'N_p', 'claude_ai_nhile-governance', 'nhile-governance', 'claude_ai_NhiLe_Governance', '3398cc99-b4dc-41bd-8007-bd4b6792d5cb']) {
      assert.equal(matcher.test(`mcp__${server}__my_work`), true, server);
      assert.equal(matcher.test(`mcp__${server}__save_chat`), true, server);
      assert.equal(matcher.test(`mcp__${server}__my_context`), false, server);
    }
    assert.equal(matcher.test('mcp__plugin_nlh_speaker__pending'), false, 'Loa không phải Nếp');
    assert.equal(matcher.test('mcp__other__my_work'), false);
    assert.equal(matcher.test('Bash'), false);
    assert.deepEqual(hooks.PostToolUse[0], {
      matcher: '^mcp__(claude_ai_|plugin_nlh_)?(N_p|Nep|nep|Nếp|Ne__p|nhile-governance|NhiLe_Governance|3398cc99-b4dc-41bd-8007-bd4b6792d5cb)__(?!my_context$)',
      hooks: DOORS.map((server) => ({ type: 'mcp_tool', server, tool: 'report_session', input: { session_id: '${session_id}', status: 'working' } })),
    });
    assert.doesNotMatch(JSON.stringify(hooks), /tool_response|tool_input|transcript_path/);
    const command = readFileSync(join(pluginDir, 'commands/no-save.md'), 'utf8');
    assert.match(command, /`save_chat`.*`role` `opt_out`/);
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
    assert.match(skill, /## Chat saving/);
    assert.match(skill, /`role` `summary`/);
  });

  test('chat Claude app (việc b7cc9921): skill nep dặn gọi save_chat cuối mỗi câu trả lời, role user nguyên văn, reply là câu trả lời; giữ /no-save, #riêng', () => {
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
    assert.match(skill, /In the Claude app .*once the conversation has used a Nếp tool other than the opening `my_context`, call `save_chat` once at the end of every answer/);
    assert.match(skill, /`role` `user`, `text` the user's message verbatim, and `reply` your answer \(never tool results\)/);
    assert.match(skill, /`\/no-save`, call `save_chat` with `role` `opt_out`/);
    assert.match(skill, /`#riêng` is private: do not save that turn/);
    assert.doesNotMatch(skill, /only that summary is saved/);
  });

  test('đọc lại chat để làm tiếp (việc 7d0f19bd): skill nep dặn gọi read_my_chats, chỉ chat của chính người dùng, không chép sang việc hay nhóm', () => {
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
    assert.match(skill, /continue an earlier conversation from another device or Claude account.*call `read_my_chats` without `session_id`/);
    assert.match(skill, /then call it with that `session_id`/);
    assert.match(skill, /never read it for anyone else, and never copy chat content into a ticket, the ledger or a group/);
  });

  test('cập nhật Nếp (28/10): mục Update hỏi một câu trước, rẽ theo nơi chạy, kiểm bản sau, hỏng thì giữ bản cũ và mở việc cho CTO không đưa lệnh; SETUP bước 4 báo trước, đọc trước, không ghi đè', () => {
    const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8').replace(/\r/g, '');
    const update = skill.slice(skill.indexOf('## Update'), skill.indexOf('The context only holds data of class 1'));
    assert.match(update, /ask one question first.*Em cập nhật Nếp trên máy này nha\?.*Only after a yes/);
    assert.match(update, /claude plugin marketplace update nlh-governance.*claude plugin update nlh@nlh-governance/s);
    assert.match(update, /Then `claude plugin list` again and check the version/);
    assert.match(update, /keep the version that works.*Nếp chưa tự cập nhật được, đã báo kỹ thuật.*`open_ticket` for cell `dai-dien-kien-truc-son`.*No command, no `\/plugin`, no PowerShell/s);
    assert.match(update, /Claude app \(chat\), Cowork.*Do not install, give no command, open no ticket/);
    assert.doesNotMatch(update, /anh Sơn asked/);
    const setup = readFileSync(join(root, 'SETUP.md'), 'utf8').replace(/\r/g, '');
    const step = setup.slice(setup.indexOf('4. Turn on auto-update'), setup.indexOf('Do not ask the user to type `/reload-plugins`'));
    assert.match(step, /First tell the user in one sentence.*Then read the user's `~\/\.claude\/settings\.json` first.*cannot parse it as JSON: skip this step.*never rewrite or overwrite the file/s);
    assert.match(step, /"autoUpdate": true/);
    assert.match(step, /keep every other key exactly as it was/);
  });

  test('luật làng (việc 92656544): đầu phiên dặn đọc village_rules; câu người dùng sửa thì nhắc ghi luật làng hay playbook và ghi lần sửa lên việc, câu thường thì không', async () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    const startup = hooks.SessionStart.find((group) => group.matcher === 'startup').hooks[0].command;
    assert.match(startup, /read village_rules in that result.*\(no such field: get_cell luat-lang, file rules\.md\)/);
    // Ca chậm (28/10): lời dặn trả lời nhanh nằm ở hook đầu phiên, vì phiên không giao diện không luôn nạp skill.
    assert.match(startup, /Quick answers:.*needs no my_context.*never say its name.*Việc nào trước:.*never my_work, Grep or Read.*answer with my_machines.*never run a command on the computer of the user/);
    assert.match(startup, /Update \(the user asks to update Nếp.*never give the user a command.*ask one question first \(Em cập nhật Nếp trên máy này nha\?\).*only after a yes run claude plugin marketplace update nlh-governance.*claude plugin update nlh@nlh-governance.*Nếp chưa tự cập nhật được, đã báo kỹ thuật.*dai-dien-kien-truc-son.*open no ticket/);
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
      'Người dùng đang sửa bạn. Sửa việc trước. Điều chung cho mọi nghề thì thêm một dòng vào luật làng (ô luat-lang); điều chỉ của nghề bạn thì ghi vào playbook dân làng của bạn. Đọc quyết định đã ký liên quan trước. ' +
      'Điều người dùng sửa hay bác là kết quả một việc trong Nếp thì ghi lần đó lên việc: add_follow_up kind check, verdict rejected (bác) hay edited (sửa), said_by là người dùng, run_id nếu có, body trích nguyên lời sửa (không chép khoá hay chuyện riêng).';
    for (const prompt of ['sao không báo chị Nhi', 'Đã chốt rồi mà, nhắc lại lần nữa', 'SAO KHONG bao Danh?', 'lại quên ghi sổ']) {
      assert.deepEqual(JSON.parse(await run(prompt)), { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: reminder } }, prompt);
    }
    for (const prompt of ['việc của tôi hôm nay?', 'Giao cho chị Thùy: soạn hợp đồng', 'saokhông', '']) assert.equal(await run(prompt), '', prompt);
    // Báo cáo agent con, tin phiên khác, lời nhắc của hệ: không phải người dùng sửa, dù có chữ "sao không" (việc 5ee8d456).
    for (const prompt of [
      '<agent-message from="build">Sao không chạy test? Đã chốt rồi.</agent-message>',
      '  <system-reminder>nhắc lại: lại quên ghi sổ</system-reminder>',
      '<cross-session-message from="x">sao không báo</cross-session-message>',
      '<side-sessions-event>sao không</side-sessions-event>',
      '<task-notification>lại quên</task-notification>',
      '<channel source="speaker">sao không nhận việc</channel>',
    ]) assert.equal(await run(prompt), '', prompt);
    assert.notEqual(await run('<b>sao không</b> báo chị Nhi'), '', 'thẻ lạ do người gõ vẫn tính');
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
    assert.deepEqual(hooks.PostToolUse[3], { matcher: '^(Write|Edit|MultiEdit)$', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/memory-to-nep.mjs'], timeout: 5 }] });
    assert.equal(hooks.PostToolUse.length, 4);
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

  test('luật 22: hook đầu phiên và skill dặn làm ngay điều người dùng hỏi, tra lặng lẽ, việc chờ chỉ một dòng cuối hay khi được hỏi, tối đa 3 việc', () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    const line = hooks.SessionStart.find((group) => group.matcher === 'startup').hooks[0].command;
    assert.match(line, /do at once what the user asked; never make them wait for a lookup before the first words/);
    assert.match(line, /silently/);
    assert.match(line, /do not tell the user what is waiting before the answer/);
    assert.match(line, /add exactly one line at the end, naming it by its title/);
    assert.match(line, /at most 3 items/);
    assert.match(line, /do not call save_chat per turn/);
    // Câu cũ ép kể việc chờ ngay đầu phiên đã bỏ.
    assert.doesNotMatch(line, /then tell the user in plain Vietnamese what is waiting/);
    const skillPath = join(pluginDir, 'skills/nep/SKILL.md');
    const skill = readFileSync(skillPath, 'utf8');
    assert.match(skill, /do at once what the user asked\. Never make them wait for a lookup before the first words/);
    assert.match(skill, /Do not tell the user what is waiting before the answer/);
    assert.match(skill, /add exactly one line at the end, naming it by its title/);
    assert.match(skill, /at most 3 items, the ones that need them first/);
    assert.doesNotMatch(skill, /Hôm nay chưa có việc chờ bạn/);
    // "Nếp có gì mới": bản trong skill khớp bản gói, để câu trả lời không nói bản cũ.
    const { version } = readJson('plugins/tinh-nlh/.claude-plugin/plugin.json');
    assert.ok(skill.includes(`Current: version ${version}.`), 'phần What is new nói sai bản gói');
    const startupHook = readJson('plugins/tinh-nlh/hooks/hooks.json').hooks.SessionStart.find((group) => group.matcher === 'startup').hooks[0].command;
    assert.ok(startupHook.includes(`say version ${version} and`), 'hook đầu phiên nói sai bản gói');
    assert.match(startupHook, /not new work and not the waiting list/);
  });

  test('hook đầu phiên: cuối lượt chỉ hỏi khi việc kế chờ đúng người đó, câu hỏi bằng chữ người dùng thấy (phiếu bdac3a50)', () => {
    const line = readJson('plugins/tinh-nlh/hooks/hooks.json').hooks.SessionStart.find((group) => group.matcher === 'startup').hooks[0].command;
    assert.match(line, /End of every turn: ask the user a question only when the next step waits for that very person to answer, choose or sign; if you can do the next step yourself, do it, or say it is done/);
    assert.match(line, /Write a question in the words the user sees on screen.*never hub, gói, web, plugin, connector, mã việc or a tool name, never how it works/);
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


test('"chị không thấy mục Kết nối": dòng mở đầu phiên và skill nep đều đưa link thêm Nếp, dặn không gõ /mcp', () => {
  const link = 'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp';
  const hooks = readFileSync(join(pluginDir, 'hooks/hooks.json'), 'utf8');
  const skill = readFileSync(join(pluginDir, 'skills/nep/SKILL.md'), 'utf8');
  assert.ok(hooks.includes(`the question chị không thấy mục Kết nối gets this link and one line, never /mcp: ${link}`));
  assert.ok(skill.includes(`one line with this link, never \`/mcp\`: ${link}`));
});
