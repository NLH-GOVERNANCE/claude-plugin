// SessionStart hook of plugin nlh: the Nếp connector line. Nếp lives in the user's own Claude account (custom connector
// Nếp, https://mcp.nlh.vn/mcp); the plugin has no connector of its own since 25/10/2026. A plugin server at the same URL
// wins over the account connector in Claude Code and needs a second sign-in (code.claude.com/docs/en/mcp, precedence by
// endpoint), and in cloud sessions it can never sign in, so chats were lost without a word. Anh Sơn's goal: one Nếp
// connection per person, and treat everyone as a personal account (25/10).
// Always prints one line: if Claude has no Nếp tool, tell the user the one link that adds Nếp to their account. If
// Claude Code lists a Nếp connector as needing sign-in (<config dir>/mcp-needs-auth-cache.json, keyed by server name,
// within a week), say how to sign in again. Reads only that file; no network, no write.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Names the account connector takes: "claude.ai <name>" in Claude Code on a machine, the bare name in cloud sessions.
// Nếp is the name the add link fills in; the other two are names people gave it before 25/10.
export const SERVERS = ['claude.ai Nếp', 'Nếp', 'claude.ai nhile-governance', 'nhile-governance', 'claude.ai NhiLe Governance', 'NhiLe Governance'];
export const ADD_LINK =
  'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp';
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function needsSignIn(cache, now = Date.now()) {
  return SERVERS.find((name) => {
    const at = Number(cache?.[name]?.timestamp);
    return Number.isFinite(at) && at <= now + 60_000 && now - at < FRESH_MS;
  }) ?? null;
}

export function connectorLine(waiting) {
  const missing =
    `Nếp connector: Nếp is a connector in the user's own Claude account, not part of this plugin. ` +
    `If you have no Nếp tool at all (no my_context from any server), say once in your first reply, in Vietnamese: ` +
    `"Máy này chưa có Nếp: trên máy tính mở ${ADD_LINK} , bấm Add, đăng nhập bằng email công ty, rồi mở phiên mới." ` +
    `Until then, nothing of this chat reaches the ledger.`;
  if (!waiting) return `${missing}\n`;
  return (
    `${missing} Claude Code lists the Nếp connector (${waiting}) as needing sign-in: if Nếp tools fail, say once: ` +
    `"Nếp cần đăng nhập lại: mở claude.ai, Customize, Connectors, bấm Connect ở Nếp, rồi mở phiên mới."\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let waiting = null;
  try {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    waiting = needsSignIn(JSON.parse(readFileSync(join(dir, 'mcp-needs-auth-cache.json'), 'utf8')));
  } catch {
    // No cache file, or not JSON: only the line about a missing connector.
  }
  process.stdout.write(connectorLine(waiting));
}
