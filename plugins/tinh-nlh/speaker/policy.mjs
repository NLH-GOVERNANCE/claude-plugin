// Quyền cho kênh Loa (việc 26f86f3d, CTO chọn đường A): Claude Code chỉ nhận kênh của gói khi danh sách cho phép của
// máy (managed-settings.json) có đúng gói đó. Lúc cài, file này ghi MỘT lần hai khoá: channelsEnabled và một dòng
// allowedChannelPlugins cho gói nlh. Không ghi khoá nào khác, không xoá dòng của ai, không đè khoá người quản trị đã tắt.
// Người dùng thấy đúng một hộp xin quyền của hệ điều hành. Bấm Không thì Loa chạy chế độ 10 phút, không báo lỗi.
//
//   node policy.mjs ensure   kiểm; thiếu thì ghi (xin quyền nếu cần); in một dòng tiếng Việt; thoát 0 khi kênh dùng được
//   node policy.mjs check    thoát 0 khi danh sách đã đủ, không in gì
//   node policy.mjs write    ghi gộp (tiến trình được nâng quyền gọi lệnh này); thoát 0 đã đủ, 3 không ghi được
//
// Cờ: --file (managed-settings.json, để thử), --marketplace (mặc định đọc từ plugin đã cài), --home, --status (nơi ghi
// policy-status.json), --no-elevate (thử: không bật hộp xin quyền).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN = 'nlh';
export const DEFAULT_MARKETPLACE = 'nlh-governance';

// Nơi Claude Code đọc chính sách của máy. Windows đọc đúng C:\Program Files\ClaudeCode (thư mục ProgramData cũ không đọc).
export function managedPath(platform = process.platform, env = process.env) {
  if (platform === 'win32') return join(env.ProgramFiles || 'C:\\Program Files', 'ClaudeCode', 'managed-settings.json');
  if (platform === 'darwin') return '/Library/Application Support/ClaudeCode/managed-settings.json';
  return '/etc/claude-code/managed-settings.json';
}

// Kho mà gói nlh đang cài từ đó (installed_plugins.json, rồi thư mục cache). Gói đồng bộ từ claude.ai (@synced),
// nạp tạm (@inline) không khai kênh được nên không tính; không có thì null.
export function findMarketplace(home = homedir()) {
  const base = join(home, '.claude', 'plugins');
  try {
    const plugins = JSON.parse(readFileSync(join(base, 'installed_plugins.json'), 'utf8')).plugins || {};
    for (const key of Object.keys(plugins)) {
      const [name, market] = key.split('@');
      if (name === PLUGIN && market && !['synced', 'inline', 'builtin'].includes(market)) return market;
    }
  } catch {}
  return existsSync(join(base, 'cache', DEFAULT_MARKETPLACE, PLUGIN)) ? DEFAULT_MARKETPLACE : null;
}

const sameEntry = (marketplace) => (entry) => entry && entry.plugin === PLUGIN && entry.marketplace === marketplace;

// Gộp vào chính sách có sẵn. Trả { settings, changed } hoặc { refused: lý do } khi không được động vào.
export function merge(existing, marketplace) {
  const settings = { ...existing };
  if (settings.channelsEnabled === false) return { refused: 'channels-off' };
  if (settings.allowedChannelPlugins !== undefined && !Array.isArray(settings.allowedChannelPlugins)) return { refused: 'bad-list' };
  let changed = false;
  if (settings.channelsEnabled !== true) {
    settings.channelsEnabled = true;
    changed = true;
  }
  const list = settings.allowedChannelPlugins ? [...settings.allowedChannelPlugins] : [];
  if (!list.some(sameEntry(marketplace))) {
    list.push({ marketplace, plugin: PLUGIN });
    changed = true;
  }
  settings.allowedChannelPlugins = list;
  return { settings, changed };
}

function load(file) {
  if (!existsSync(file)) return { settings: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { settings: parsed } : { refused: 'bad-file' };
  } catch {
    return { refused: 'bad-file' };
  }
}

// Đủ chưa (không ghi gì).
export function isAllowed(file, marketplace) {
  const { settings, refused } = load(file);
  if (refused || !marketplace) return false;
  return settings.channelsEnabled === true && Array.isArray(settings.allowedChannelPlugins) && settings.allowedChannelPlugins.some(sameEntry(marketplace));
}

// Ghi gộp, ghi tạm rồi đổi tên để file không bao giờ nửa chừng. 'ok' | 'refused:<lý do>' | 'denied' | 'error'.
export function write(file, marketplace) {
  const { settings, refused } = load(file);
  if (refused) return `refused:${refused}`;
  const merged = merge(settings, marketplace);
  if (merged.refused) return `refused:${merged.refused}`;
  if (!merged.changed) return 'ok';
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(merged.settings, null, 2)}\n`);
    renameSync(temp, file);
    return 'ok';
  } catch (error) {
    return error && (error.code === 'EACCES' || error.code === 'EPERM') ? 'denied' : 'error';
  }
}

// Chạy lại chính file này với quyền cao: hộp xin quyền của Windows (UAC) hoặc của macOS (hỏi mật khẩu máy).
function elevate(platform, file, marketplace) {
  const script = fileURLToPath(import.meta.url);
  const args = [script, 'write', '--file', file, '--marketplace', marketplace];
  if (platform === 'win32') {
    const quote = (text) => `'${text.replace(/'/g, "''")}'`;
    // Start-Process joins an argument array without quotes, so a path with a space (a user name like "Thùy ỉ") would split: one quoted string instead.
    const command = `try { $p = Start-Process -FilePath ${quote(process.execPath)} -ArgumentList ${quote(args.map((text) => `"${text}"`).join(' '))} -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode } catch { exit 9 }`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }).status;
  }
  if (platform === 'darwin') {
    const shell = [process.execPath, ...args].map((text) => `'${text.replace(/'/g, "'\\''")}'`).join(' ');
    const apple = `do shell script "${shell.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with administrator privileges`;
    return spawnSync('osascript', ['-e', apple]).status;
  }
  return 9;
}

// Câu đứng ngay trước hộp xin quyền. Windows có nút Có; macOS hỏi mật khẩu máy nên không nhắc nút nào.
export function ask(platform = process.platform) {
  return platform === 'win32'
    ? 'Máy sẽ hỏi quyền một lần để Nếp tự báo việc mới. Bấm Có.'
    : 'Máy sẽ hỏi mật khẩu máy một lần để Nếp tự báo việc mới.';
}

const SAID = {
  ok: 'Nếp sẽ tự báo việc mới.',
  declined: 'Không sao. Nếp sẽ nhắc việc mới mỗi 10 phút.',
};

// Làm hết một lượt. Trả { code: 'ok' | 'declined' | 'unavailable', text }. Ghi policy-status.json để biết lần cài ra sao.
export function ensure({ file = managedPath(), marketplace = findMarketplace(), platform = process.platform, elevateFn = elevate, writeFn = write, say = () => {}, statusFile } = {}) {
  const done = (code, detail = '') => {
    if (statusFile) {
      try {
        mkdirSync(dirname(statusFile), { recursive: true });
        writeFileSync(statusFile, `${JSON.stringify({ status: code, detail, at: new Date().toISOString() })}\n`);
      } catch {}
    }
    return { code, text: SAID[code] || 'Nếp sẽ nhắc việc mới mỗi 10 phút.' };
  };
  if (!marketplace) return done('unavailable', 'no-marketplace');
  if (isAllowed(file, marketplace)) return done('ok', 'already');
  const first = writeFn(file, marketplace);
  if (first === 'ok') return done('ok', 'written');
  if (first !== 'denied') return done('unavailable', first);
  say(ask(platform));
  elevateFn(platform, file, marketplace);
  if (isAllowed(file, marketplace)) return done('ok', 'elevated');
  return done('declined', 'elevation');
}

function main(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => {
    const at = rest.indexOf(name);
    return at >= 0 ? rest[at + 1] : undefined;
  };
  const file = flag('--file') || managedPath();
  const marketplace = flag('--marketplace') || findMarketplace(flag('--home') || homedir());
  if (command === 'check') return isAllowed(file, marketplace) ? 0 : 1;
  if (command === 'write') return write(file, marketplace) === 'ok' ? 0 : 3;
  if (command === 'ensure') {
    const noElevate = rest.includes('--no-elevate');
    const result = ensure({
      file,
      marketplace,
      statusFile: flag('--status'),
      say: (text) => console.log(text),
      elevateFn: noElevate ? () => 9 : elevate,
    });
    console.log(result.text);
    return result.code === 'ok' ? 0 : 2;
  }
  console.error('Dùng: node policy.mjs ensure | check | write');
  return 64;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.setDefaultEncoding?.('utf8');
  process.exitCode = main(process.argv.slice(2));
}
