// Phép thử plugin tinh-nlh (phiếu "1/4 Plugin tinh-nlh"): dạng JSON của danh mục và manifest, và các lan can
// của gói: không secret, không bin/, hook không gọi mạng, connector đúng địa chỉ bản chính. Chỉ đọc file.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { pluginFiles, pluginZip } from '../scripts/plugin-zip.mjs';

const root = new URL('..', import.meta.url).pathname;
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
  const match = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${relative(root, path)} thiếu frontmatter`);
  return Object.fromEntries(
    match[1].split('\n').map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
}

describe('plugin tinh-nlh', () => {
  test('danh mục .claude-plugin/marketplace.json: tên, chủ, một plugin tinh-nlh đường dẫn tương đối từ gốc repo', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json');
    assert.match(marketplace.name, KEBAB);
    assert.equal(typeof marketplace.owner?.name, 'string');
    assert.equal(marketplace.plugins.length, 1);
    const [entry] = marketplace.plugins;
    assert.equal(entry.name, 'tinh-nlh');
    // Đồng bộ của tổ chức chỉ nhận đường dẫn viết đủ, bắt đầu bằng ./, không có ..
    assert.equal(entry.source, './plugins/tinh-nlh');
    assert.ok(existsSync(join(root, entry.source)));
    assert.ok(entry.description);
  });

  test('manifest plugin.json: tên trùng tên trong danh mục, có version, mô tả, tác giả', () => {
    const manifest = readJson('plugins/tinh-nlh/.claude-plugin/plugin.json');
    assert.equal(manifest.name, 'tinh-nlh');
    assert.ok(manifest.version);
    assert.ok(manifest.description);
    assert.ok(manifest.author?.name);
    assert.doesNotThrow(() => new URL(manifest.homepage));
  });

  test('connector: đúng một máy chủ MCP từ xa ở bản chính, không header, không biến môi trường', () => {
    const { mcpServers } = readJson('plugins/tinh-nlh/.mcp.json');
    const servers = Object.values(mcpServers);
    assert.equal(servers.length, 1);
    assert.deepEqual(servers[0], { type: 'http', url: 'https://governance.nlh.vn/mcp' });
  });

  test('hook đầu phiên in câu dặn gọi my_context và mã phiên, không gọi mạng; sau /clear hay gọn ngữ cảnh gọi my_context (phiếu 1409ab1f); Stop và SessionEnd chỉ báo mã phiên và trạng thái', () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'UserPromptSubmit']);
    const byMatcher = Object.fromEntries(hooks.SessionStart.map((group) => [group.matcher, group.hooks]));
    assert.deepEqual(Object.keys(byMatcher).sort(), ['clear|compact', 'startup', 'startup|clear']);
    // Lúc mở phiên, hook mcp_tool bị bỏ qua (máy chủ MCP chưa nối), nên chỉ in lời dặn; echo không gọi mạng.
    assert.equal(byMatcher.startup.length, 1);
    assert.equal(byMatcher.startup[0].type, 'command');
    assert.match(byMatcher.startup[0].command, /^echo "[^"$`]+my_context[^"$`]+"$/);
    assert.deepEqual(byMatcher['startup|clear'], [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs'] }]);
    assert.doesNotMatch(readFileSync(join(pluginDir, 'hooks/session-start.mjs'), 'utf8'), /fetch|https?:|node:(http|net|https|fs|child_process)/);
    // Sau /clear hay gọn ngữ cảnh: gọi thẳng công cụ, đúng tên máy chủ có phạm vi plugin, không truyền gì thêm.
    const [server] = Object.keys(readJson('plugins/tinh-nlh/.mcp.json').mcpServers);
    assert.deepEqual(byMatcher['clear|compact'], [{ type: 'mcp_tool', server: `plugin:tinh-nlh:${server}`, tool: 'my_context', timeout: 30 }]);
    // Phiên tự báo (phiếu 6d4cb2ad): gọi report_session của connector, không gửi nội dung chat.
    for (const [event, status] of [['Stop', 'idle'], ['SessionEnd', 'stopped']]) {
      const hook = hooks[event].flatMap((group) => group.hooks).find((item) => item.tool === 'report_session');
      assert.deepEqual(hook, {
        type: 'mcp_tool',
        server: 'plugin:tinh-nlh:nhile-governance',
        tool: 'report_session',
        input: { session_id: '${session_id}', status },
      });
    }
  });

  test('skill tinh-nlh và sáu lệnh viec, giao, lamtiep, bangiao, ky, khongluu có mô tả', () => {
    const skill = frontMatter(join(pluginDir, 'skills/tinh-nlh/SKILL.md'));
    assert.equal(skill.name, 'tinh-nlh');
    assert.ok(skill.description);
    const commands = ['bangiao', 'giao', 'khongluu', 'ky', 'lamtiep', 'viec'];
    assert.deepEqual(readdirSync(join(pluginDir, 'commands')).sort(), commands.map((name) => `${name}.md`));
    for (const name of commands) assert.ok(frontMatter(join(pluginDir, `commands/${name}.md`)).description);
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
    const base = { type: 'mcp_tool', server: 'plugin:tinh-nlh:nhile-governance', tool: 'save_chat' };
    // Hạn chờ 5 giây: connector chậm thì Claude vẫn nhận lời ngay, lượt đó chỉ không được lưu.
    assert.deepEqual(save('UserPromptSubmit'), [{ ...base, input: { session_id: '${session_id}', role: 'user', text: '${prompt}' }, timeout: 5 }]);
    assert.deepEqual(save('Stop'), [{ ...base, input: { session_id: '${session_id}', role: 'assistant', text: '${last_assistant_message}' }, timeout: 5 }]);
    assert.deepEqual(save('SessionEnd'), []);
    // Chỉ lưu phiên thật sự dùng tỉnh NhiLe (ô CTO chốt, phiếu abdcdd2f): Claude gọi một công cụ của tỉnh thì báo working.
    assert.deepEqual(hooks.PostToolUse, [
      {
        matcher: 'mcp__plugin_tinh-nlh_nhile-governance__.*',
        hooks: [{ type: 'mcp_tool', server: 'plugin:tinh-nlh:nhile-governance', tool: 'report_session', input: { session_id: '${session_id}', status: 'working' } }],
      },
    ]);
    assert.doesNotMatch(JSON.stringify(hooks), /tool_response|tool_input|transcript_path/);
    const command = readFileSync(join(pluginDir, 'commands/khongluu.md'), 'utf8');
    assert.match(command, /`save_chat`.*`role` `opt_out`/);
    const skill = readFileSync(join(pluginDir, 'skills/tinh-nlh/SKILL.md'), 'utf8');
    assert.match(skill, /## Lưu chat/);
    assert.match(skill, /`role` `summary`/);
  });

  test('skill dặn luôn bàn giao khi dừng, và mở phiếu góp ý cho Tech Lead', () => {
    const skill = readFileSync(join(pluginDir, 'skills/tinh-nlh/SKILL.md'), 'utf8');
    assert.match(skill, /## Bàn giao \(luôn làm\)/);
    assert.match(skill, /kind `handoff`/);
    assert.match(skill, /## Góp ý/);
    assert.match(skill, /ô `tech-lead-son`, tiêu đề bắt đầu bằng "Góp ý:"/);
  });

  test('skill: câu đầu mỗi cuộc trò chuyện gọi my_context, trả lời "tôi đang làm gì dở" không tra thêm, giữ bảng mức nhạy', () => {
    const skill = readFileSync(join(pluginDir, 'skills/tinh-nlh/SKILL.md'), 'utf8');
    assert.match(frontMatter(join(pluginDir, 'skills/tinh-nlh/SKILL.md')).description, /câu đầu mỗi cuộc trò chuyện, kể cả trên web và điện thoại/);
    assert.match(skill, /1\. Gọi `my_context` một lần/);
    assert.match(skill, /Connector chưa có `my_context` \(hub bản cũ\) thì gọi `my_work` thay/);
    assert.match(skill, /"tôi đang làm gì dở".+không hỏi lại, không tra thêm/);
    assert.match(skill, /tài khoản cá nhân thì không mở hay chép vào cuộc trò chuyện dữ liệu loại 3–4/);
  });

  test('không hứa "mở là thấy việc" ở bất cứ đâu, kể cả mô tả trong danh mục và manifest', () => {
    // Hook đầu phiên chỉ chạy ở Claude Code và Cowork; app Claude và điện thoại thì gõ /viec (phiếu bdec651d).
    const promise = /(mở|mở claude|mở chat)[^.\n"]{0,20}là thấy việc/i;
    const files = [join(root, 'README.md'), join(root, '.claude-plugin/marketplace.json'), ...filesUnder(pluginDir)];
    for (const path of files) assert.doesNotMatch(readFileSync(path, 'utf8').replace(/Không hứa "mở chat là thấy việc"/g, ''), promise, relative(root, path));
  });

  test('/lamtiep chỉ nhận việc chờ chính người dùng; việc đã giao cho ô khác thì hỏi trước, không tự claim', () => {
    const lamtiep = readFileSync(join(pluginDir, 'commands/lamtiep.md'), 'utf8');
    assert.match(lamtiep, /Chỉ nhận \(`claim`\) việc đang chờ chính người dùng/);
    assert.match(lamtiep, /mục `assigned` của `my_desk`\): chỉ đọc bàn giao và kể lại, không tự `claim`/);
    assert.match(lamtiep, /"Muốn tôi làm thay không\?"/);
  });
});

