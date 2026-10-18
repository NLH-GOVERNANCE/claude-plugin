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

  test('hook chỉ có SessionStart, chỉ in một câu, không gọi mạng', () => {
    const { hooks } = readJson('plugins/tinh-nlh/hooks/hooks.json');
    assert.deepEqual(Object.keys(hooks), ['SessionStart']);
    const commands = hooks.SessionStart.flatMap((group) => group.hooks);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].type, 'command');
    assert.match(commands[0].command, /^echo "[^"$`]+my_work[^"$`]+"$/);
  });

  test('skill tinh-nlh và ba lệnh viec, giao, ky có mô tả', () => {
    const skill = frontMatter(join(pluginDir, 'skills/tinh-nlh/SKILL.md'));
    assert.equal(skill.name, 'tinh-nlh');
    assert.ok(skill.description);
    assert.deepEqual(readdirSync(join(pluginDir, 'commands')).sort(), ['giao.md', 'ky.md', 'viec.md']);
    for (const name of ['giao', 'ky', 'viec']) assert.ok(frontMatter(join(pluginDir, `commands/${name}.md`)).description);
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

  test('không hứa "mở là thấy việc" ở bất cứ đâu, kể cả mô tả trong danh mục và manifest', () => {
    // Hook đầu phiên chỉ chạy ở Claude Code và Cowork; app Claude và điện thoại thì gõ /viec (phiếu bdec651d).
    const promise = /(mở|mở claude|mở chat)[^.\n"]{0,20}là thấy việc/i;
    const files = [join(root, 'README.md'), join(root, '.claude-plugin/marketplace.json'), ...filesUnder(pluginDir)];
    for (const path of files) assert.doesNotMatch(readFileSync(path, 'utf8').replace(/Không hứa "mở chat là thấy việc"/g, ''), promise, relative(root, path));
  });
});

