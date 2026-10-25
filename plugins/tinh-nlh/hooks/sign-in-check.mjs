// SessionStart hook of plugin nlh: is the plugin's own Nếp connection signed in on this machine? Every hook that saves
// this chat to Nếp or reports this session (save_chat, report_session) calls that connection, plugin:nlh:nhile-governance.
// Not signed in, they all fail without a word, and the chat never reaches the ledger. Seen 25/10/2026 on a claude.ai/code
// session of anh Sơn and in the numbers: Thùy, Tân called Nếp hundreds of times a day with one chat session saved
// (data-map.md, chat into the ledger, D-0067 coordinate 3).
// Claude Code keeps the servers that asked for sign-in in <config dir>/mcp-needs-auth-cache.json, keyed by server name.
// Read only that file, only that key; no network, no write. Missing, unreadable or older than a week: say nothing.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SERVER = 'plugin:nlh:nhile-governance';
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function needsSignIn(cache, now = Date.now()) {
  const at = Number(cache?.[SERVER]?.timestamp);
  return Number.isFinite(at) && at <= now + 60_000 && now - at < FRESH_MS;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const cache = JSON.parse(readFileSync(join(dir, 'mcp-needs-auth-cache.json'), 'utf8'));
    if (needsSignIn(cache)) {
      process.stdout.write(
        `Nếp sign-in check: Claude Code on this machine lists the plugin's own Nếp connection (${SERVER}) as needing sign-in. Until it is signed in, the plugin hooks that save this chat to Nếp and report this session fail silently, so this conversation does not reach the ledger. In your first reply, tell the user once, in Vietnamese: "Gói Nếp trên máy này chưa đăng nhập, nên chat phiên này chưa vào giếng: gõ /mcp, chọn ${SERVER}, bấm đăng nhập (phiên chạy trên claude.ai/code thì đăng nhập Nếp trong phần kết nối của tài khoản)." Until then, when a task ends, call save_chat with role summary through any Nếp connection that works.\n`,
      );
    }
  } catch {
    // No cache file, or not JSON: nothing to say.
  }
}
