// Quyền cho kênh Loa (việc 26f86f3d, CTO chọn đường A): Claude Code chỉ nhận kênh của gói khi danh sách cho phép của
// máy (managed-settings.json) có đúng gói đó. Lúc cài, file này ghi MỘT lần hai khoá: channelsEnabled và allowedChannelPlugins
// (dòng của gói nlh, kèm bốn kênh chính thức khi máy chưa có danh sách: xem OFFICIAL). Không ghi khoá nào khác, không xoá dòng của ai, không đè khoá người quản trị đã tắt.
// Phần chạy bằng quyền admin không chạy file hay node nào trong thư mục người dùng: chỉ một lệnh PowerShell hệ thống (hay
// osascript) ghi nội dung đã kiểm vào đường dẫn cố định (việc 26f86f3d, chấm PR #93).
// Người dùng thấy đúng một hộp xin quyền của hệ điều hành. Bấm Không thì Loa chạy chế độ 10 phút, không báo lỗi.
//
//   node policy.mjs ensure   kiểm; thiếu thì ghi (xin quyền nếu cần); in một dòng tiếng Việt; thoát 0 khi kênh dùng được
//   node policy.mjs check    thoát 0 khi danh sách đã đủ, không in gì
//   node policy.mjs mode     in cách mở Loa: "channel plugin:nlh@<kho>", "loop" hoặc "loop-config" (xem loaMode)
//   node policy.mjs write   ghi gộp, không xin quyền (dùng khi người chạy đã có quyền); thoát 0 đã đủ, 3 không ghi được
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

// allowedChannelPlugins THAY danh sách mặc định của Anthropic khi có mặt (tài liệu Claude Code, "Replaces the Anthropic-maintained
// list when set"). Máy chưa có danh sách thì ghi kèm các kênh chính thức để telegram, discord, imessage, fakechat không mất.
// Nguồn: code.claude.com/docs/en/channels ("The channel plugins in claude-plugins-official ... are the default approved set");
// thư mục external_plugins của kho đó có đúng bốn kênh này ngày 28/10/2026. Anthropic thêm kênh thì kiểm lại danh sách.
export const OFFICIAL = ['telegram', 'discord', 'imessage', 'fakechat'].map((plugin) => ({ marketplace: 'claude-plugins-official', plugin }));

// Tên kho đi vào lệnh chạy bằng quyền admin: chỉ nhận chữ, số, chấm, gạch.
export const validMarketplace = (name) => typeof name === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(name);

// Đường dẫn thư mục hệ thống Windows. Biến môi trường do người dùng đặt được, mà đường dẫn này đi vào lệnh chạy bằng quyền
// admin, nên không tin thẳng: chỉ nhận đúng dạng "<ổ>:\<tên chuẩn>" cùng ổ với SystemDrive; sai thì dùng ổ C.
export function winDir(name, env = process.env) {
  const standard = { ProgramFiles: 'Program Files', SystemRoot: 'Windows' }[name];
  const drive = /^[A-Za-z]:$/.test(env.SystemDrive || '') ? env.SystemDrive.toUpperCase() : 'C:';
  const value = env[name] || '';
  return value.toUpperCase() === `${drive}\\${standard}`.toUpperCase() ? value : `C:\\${standard}`;
}

// Nơi Claude Code đọc chính sách của máy. Windows đọc đúng C:\Program Files\ClaudeCode (thư mục ProgramData cũ không đọc).
export function managedPath(platform = process.platform, env = process.env) {
  if (platform === 'win32') return join(winDir('ProgramFiles', env), 'ClaudeCode', 'managed-settings.json');
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
      if (name === PLUGIN && validMarketplace(market) && !['synced', 'inline', 'builtin'].includes(market)) return market;
    }
  } catch {}
  return existsSync(join(base, 'cache', DEFAULT_MARKETPLACE, PLUGIN)) ? DEFAULT_MARKETPLACE : null;
}

const sameEntry = (marketplace) => (entry) => entry && entry.plugin === PLUGIN && entry.marketplace === marketplace;

// Gộp vào chính sách có sẵn. Trả { settings, changed } hoặc { refused: lý do } khi không được động vào.
export function merge(existing, marketplace) {
  const settings = { ...existing };
  if (!validMarketplace(marketplace)) return { refused: 'bad-marketplace' };
  if (settings.channelsEnabled === false) return { refused: 'channels-off' };
  if (settings.allowedChannelPlugins !== undefined && !Array.isArray(settings.allowedChannelPlugins)) return { refused: 'bad-list' };
  let changed = false;
  if (settings.channelsEnabled !== true) {
    settings.channelsEnabled = true;
    changed = true;
  }
  const list = settings.allowedChannelPlugins === undefined ? OFFICIAL.map((entry) => ({ ...entry })) : [...settings.allowedChannelPlugins];
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
  if (refused || !validMarketplace(marketplace)) return false;
  return settings.channelsEnabled === true && Array.isArray(settings.allowedChannelPlugins) && settings.allowedChannelPlugins.some(sameEntry(marketplace));
}

// Nội dung sẽ ghi: { text, changed } hoặc { refused: lý do }.
export function plan(file, marketplace) {
  const { settings, refused } = load(file);
  if (refused) return { refused };
  const merged = merge(settings, marketplace);
  if (merged.refused) return { refused: merged.refused };
  return { text: `${JSON.stringify(merged.settings, null, 2)}\n`, changed: merged.changed };
}

// Ghi gộp, ghi tạm rồi đổi tên để file không bao giờ nửa chừng. 'ok' | 'refused:<lý do>' | 'denied' | 'error'.
export function write(file, marketplace) {
  const planned = plan(file, marketplace);
  if (planned.refused) return `refused:${planned.refused}`;
  if (!planned.changed) return 'ok';
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, planned.text);
    renameSync(temp, file);
    return 'ok';
  } catch (error) {
    return error && (error.code === 'EACCES' || error.code === 'EPERM') ? 'denied' : 'error';
  }
}

// Lệnh ghi cho tiến trình admin: nội dung đã kiểm (text) nằm trong lệnh, không đọc gì từ thư mục người dùng. Windows: một
// lệnh PowerShell; macOS: một dòng sh, nội dung đi qua base64 nên không phải thoát ký tự.
const quotePs = (text) => `'${text.replace(/'/g, "''")}'`;
const quoteSh = (text) => `'${text.replace(/'/g, "'\\''")}'`;
export function adminScript(platform, file, text) {
  const body = Buffer.from(text, 'utf8').toString('base64');
  if (platform === 'win32') {
    return `$ErrorActionPreference = 'Stop'; $file = ${quotePs(file)}; New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null; $tmp = $file + '.tmp'; [IO.File]::WriteAllBytes($tmp, [Convert]::FromBase64String(${quotePs(body)})); Move-Item -Force -LiteralPath $tmp -Destination $file`;
  }
  return `/bin/mkdir -p ${quoteSh(dirname(file))} && /usr/bin/printf %s ${quoteSh(body)} | /usr/bin/base64 -D > ${quoteSh(`${file}.tmp`)} && /bin/mv -f ${quoteSh(`${file}.tmp`)} ${quoteSh(file)}`;
}

// Ghi bằng quyền cao: hộp xin quyền của Windows (UAC) hoặc của macOS (hỏi mật khẩu máy). Trả mã thoát (9: không chạy được).
function elevate(platform, file, text) {
  if (platform === 'win32') {
    const system = join(winDir('SystemRoot'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const inner = Buffer.from(adminScript(platform, file, text), 'utf16le').toString('base64');
    // Start-Process joins an argument array without quotes: one string. Command lines stop at 32k characters; a policy file that big is left alone.
    if (inner.length > 12000) return 9;
    const command = `try { $p = Start-Process -FilePath ${quotePs(system)} -ArgumentList ${quotePs(`-NoProfile -NonInteractive -EncodedCommand ${inner}`)} -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode } catch { exit 9 }`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    return spawnSync(system, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }).status;
  }
  if (platform === 'darwin') {
    const apple = `do shell script "${adminScript(platform, file, text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with administrator privileges`;
    return spawnSync('/usr/bin/osascript', ['-e', apple]).status;
  }
  return 9;
}

// Loa mở Claude kiểu nào. 'channel plugin:nlh@<kho>': kênh theo tên gói, tin tới ngay. 'loop': chưa được phép (bấm Không,
// người quản trị tắt kênh), 10 phút xem việc một lần, máy chủ Loa lấy từ gói đã cài. 'loop-config': máy không có gói cài
// từ kho (chỉ bản đồng bộ từ claude.ai), 10 phút một lần, máy chủ Loa nạp bằng --mcp-config như trước.
export function loaMode(file = managedPath(), marketplace = findMarketplace()) {
  if (!marketplace) return 'loop-config';
  return isAllowed(file, marketplace) ? `channel plugin:${PLUGIN}@${marketplace}` : 'loop';
}

// Câu đứng ngay trước hộp xin quyền. Windows có nút Có; macOS hỏi mật khẩu máy nên không nhắc nút nào.
export function ask(platform = process.platform) {
  return platform === 'win32'
    ? 'Máy sẽ hỏi quyền một lần để Nếp tự báo việc mới. Bấm Có.'
    : 'Máy sẽ hỏi mật khẩu máy một lần để Nếp tự báo việc mới.';
}

// Câu in cho người dùng. Đã đủ từ trước thì không in gì; bấm Không thì in một lần, vì lần mở sau không hỏi lại.
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
    return { code, text: detail === 'already' ? '' : SAID[code] || 'Nếp sẽ nhắc việc mới mỗi 10 phút.' };
  };
  if (!marketplace) return done('unavailable', 'no-marketplace');
  if (isAllowed(file, marketplace)) return done('ok', 'already');
  const first = writeFn(file, marketplace);
  if (first === 'ok') return done('ok', 'written');
  if (first !== 'denied') return done('unavailable', first);
  const planned = plan(file, marketplace);
  if (planned.refused || !planned.changed) return done('unavailable', planned.refused || 'nothing-to-write');
  say(ask(platform));
  elevateFn(platform, file, planned.text);
  if (isAllowed(file, marketplace)) return done('ok', 'elevated');
  return done('declined', 'elevation');
}

function main(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => {
    const at = rest.indexOf(name);
    return at >= 0 ? rest[at + 1] : undefined;
  };
  // LOA_MANAGED_SETTINGS_FILE (tests only) moves where `mode` READS. Writing and elevation never follow it: code running as
  // the user could otherwise get a file written anywhere with admin rights once the person presses Yes. Writes use the fixed
  // path or an explicit --file.
  const file = flag('--file') || (command === 'mode' && process.env.LOA_MANAGED_SETTINGS_FILE) || managedPath();
  const marketplace = flag('--marketplace') || findMarketplace(flag('--home') || homedir());
  if (command === 'check') return isAllowed(file, marketplace) ? 0 : 1;
  if (command === 'mode') {
    console.log(loaMode(file, marketplace));
    return 0;
  }
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
    if (result.text) console.log(result.text);
    return result.code === 'ok' ? 0 : 2;
  }
  console.error('Dùng: node policy.mjs ensure | check | write');
  return 64;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.setDefaultEncoding?.('utf8');
  process.exitCode = main(process.argv.slice(2));
}
