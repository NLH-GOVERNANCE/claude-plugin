// Loa asks for its key with the "Cho phép" button (item D, ticket fda82ca8; api#659, docs/loa-allow-button.md).
// The machine makes the key itself and sends only its SHA-256 when it asks for a code. The key reaches the hub only over https, in the Authorization header of the status poll;
// it never goes to the web, a URL, chat or the screen, and the hub's ledger keeps only the hash.
//   1. key = nlh_tower_<64 hex>, kept in memory only until the person allows it;
//   2. POST /tower/pair { machine_id, key_hash } -> a short code (ABCD-2345), valid 10 minutes;
//   3. open the web page of that code; the person presses "Cho phép" there (the one tap);
//   4. ask GET /tower/pair/status with the key until it says allowed, then save the key with the OS (DPAPI or Keychain).
// Run by the Loa launchers (start.ps1, start.sh) when no key is saved: node pair.mjs --dir <Loa folder>.
// Exit code 0: key saved. Otherwise one plain Vietnamese line explains why and the launcher says it.
import { execFile, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KEY_FILE, KEYCHAIN, hubOrigin, machineId } from './speaker.mjs';

export const WEB_ORIGIN = 'https://nep.nlh.vn';
const POLL_MS = 3000;
// A code lives 10 minutes; one fresh code after it ran out (the hub allows 3 asks per 10 minutes).
const ROUNDS = 2;

export const newKey = (random = () => randomBytes(32).toString('hex')) => `nlh_tower_${random()}`;
export const keyHash = (key) => createHash('sha256').update(key).digest('hex');

// Only a page of nlh.vn (https), or of this machine for trials, is ever opened.
export function pairPageUrl(webOrigin, code) {
  const origin = hubOrigin(webOrigin);
  if (!origin || !/^[A-Z0-9-]{4,16}$/.test(String(code))) return null;
  return `${origin}/app/pair?code=${encodeURIComponent(code)}`;
}

// Save the key where the launcher and the channel read it. The key reaches the child through stdin, never a command line.
const POWERSHELL = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export const KEY_SAVERS = {
  win32: (key, dir) => {
    const sealed = execFileSync(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-Command', '[Console]::In.ReadLine() | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString'],
      { input: `${key}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 20_000, windowsHide: true },
    ).trim();
    if (!sealed) throw new Error('empty');
    writeFileSync(join(dir, KEY_FILE), sealed, 'ascii');
  },
  darwin: (key) => {
    execFileSync('/usr/bin/security', ['-i'], {
      input: `add-generic-password -U -s ${KEYCHAIN.service} -a ${KEYCHAIN.account} -w ${key}\n`,
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 20_000,
    });
  },
};

function openInBrowser(url) {
  const [file, args] =
    process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['/usr/bin/open', [url]] : [null, []];
  if (!file) return;
  try {
    execFile(file, args, { windowsHide: true }, () => {});
  } catch {
    // The page link is printed too.
  }
}

const sleepFor = (ms) => new Promise((done) => setTimeout(done, ms));
const failure = (message) => ({ ok: false, message });

// One full pairing. Everything outside is injectable so the test runs it without a network or a key store.
export async function pair({
  origin,
  webOrigin = WEB_ORIGIN,
  machine,
  save,
  say = () => {},
  openUrl = openInBrowser,
  fetchImpl = fetch,
  sleep = sleepFor,
  now = Date.now,
  makeKey = newKey,
  pollMs = POLL_MS,
}) {
  if (!origin) return failure('Địa chỉ Nếp trong cấu hình của Loa không phải https của nlh.vn, Loa không gửi gì tới đó.');
  if (!machine) return failure('Chưa có mã máy. Mở Claude Code một lần trên máy này rồi bấm đúp Loa lại.');
  for (let round = 0; round < ROUNDS; round += 1) {
    const key = makeKey();
    let asked;
    try {
      const response = await fetchImpl(`${origin}/tower/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ machine_id: machine, key_hash: keyHash(key) }),
      });
      if (response.status === 429) return failure('Máy này vừa xin mã mấy lần. Đợi mười phút rồi bấm đúp Loa lại.');
      if (!response.ok) return failure('Nếp chưa nhận lời xin của máy này. Thử lại sau ít phút.');
      asked = await response.json();
    } catch {
      return failure('Chưa nối được Nếp. Kiểm mạng rồi bấm đúp Loa lại.');
    }
    const url = pairPageUrl(webOrigin, asked?.code);
    if (!url) return failure('Nếp trả mã lạ, Loa không mở trang. Thử lại sau ít phút.');
    say(`Trình duyệt mở trang của Nếp: mã ${asked.code} phải đang hiện trên cả hai nơi. Bấm Cho phép.`);
    say(`Trang không tự mở thì chép link này: ${url}`);
    openUrl(url);
    const until = Math.min(Date.parse(asked.expires_at) || Infinity, now() + 10 * 60_000);
    while (now() < until) {
      await sleep(pollMs);
      let state = null;
      try {
        const response = await fetchImpl(`${origin}/tower/pair/status`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
        state = response.ok ? (await response.json())?.status : null;
      } catch {
        // A network blip: ask again.
      }
      if (state === 'allowed') {
        try {
          save(key);
        } catch {
          return failure('Chưa lưu được khoá trên máy này. Bấm đúp Loa lại.');
        }
        return { ok: true };
      }
      if (state === 'expired' || state === 'revoked' || state === 'unknown') break;
    }
    say('Mã đã hết hạn, xin mã mới.');
  }
  return failure('Chưa thấy ai bấm Cho phép. Bấm đúp Loa lại khi sẵn sàng.');
}

async function main(argv, env = process.env) {
  const dirAt = argv.indexOf('--dir');
  const dir = dirAt >= 0 ? argv[dirAt + 1] : join(homedir(), '.tinh-nlh', 'speaker');
  const saver = KEY_SAVERS[process.platform];
  if (!saver) return failure('Máy này chưa hỗ trợ Loa.');
  const result = await pair({
    origin: hubOrigin(env.TOWER_ORIGIN),
    webOrigin: env.NLH_WEB_ORIGIN || WEB_ORIGIN,
    machine: machineId(env.NLH_MACHINE_DIR || undefined),
    save: (key) => saver(key, dir),
    say: (line) => console.log(line),
  });
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((result) => {
    if (result.ok) console.log('Đã lưu khoá Loa trên máy này.');
    else console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
  });
}
