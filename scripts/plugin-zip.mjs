// Đóng plugin tinh-nlh thành một file .zip cho người không dùng GitHub: claude.ai, Customize > Plugins > Add >
// Upload plugin. Zip chứa thẳng nội dung thư mục plugin, nên .claude-plugin/plugin.json nằm ở gốc zip.
// Chỉ dùng Node (zlib), không thêm thư viện. Chạy: node scripts/plugin-zip.mjs [file ra, mặc định tinh-nlh.zip]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

export const PLUGIN_DIR = fileURLToPath(new URL('../plugins/tinh-nlh', import.meta.url));

// Mọi file dưới dir, đường dẫn tương đối dùng dấu /, xếp theo tên để zip giống nhau mỗi lần đóng.
export function pluginFiles(dir = PLUGIN_DIR) {
  const walk = (at) =>
    readdirSync(at).flatMap((name) => {
      const path = join(at, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(dir, path).split(sep).join('/')];
    });
  return walk(dir).sort();
}

// Dựng zip trong bộ nhớ từ danh sách { name, data }. Ngày giờ cố định (1/1/1980) để cùng nội dung ra cùng file.
export function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // bản cần để giải nén
    local.writeUInt16LE(0x0800, 6); // tên file là UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // giờ
    local.writeUInt16LE(0x21, 12); // ngày 1/1/1980
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function pluginZip(dir = PLUGIN_DIR) {
  return buildZip(pluginFiles(dir).map((name) => ({ name, data: readFileSync(join(dir, name)) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? 'tinh-nlh.zip';
  writeFileSync(out, pluginZip());
  console.log(`Đã đóng ${pluginFiles().length} file vào ${out}. Tải lên ở claude.ai: Customize > Plugins > Add > Upload plugin.`);
}
