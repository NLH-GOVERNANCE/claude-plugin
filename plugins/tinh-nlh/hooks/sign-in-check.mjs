// SessionStart hook of plugin nlh: the Nếp connector line. Since 0.23.1 the plugin carries no Nếp server of its own: Nếp
// comes from the Nếp connector of the user's Claude account (on a machine, in the app and in cloud sessions alike), so
// installing or upgrading the plugin never asks for a second sign-in. A server of the plugin at the same URL would hide the
// account connector and need its own sign-in (0.22.0 of 26/10; tests of 28/10: /mcp, Connect, "2 to reconnect").
// Always prints one line. If Claude Code lists the Nếp connector as needing sign-in (<config dir>/mcp-needs-auth-cache.json,
// keyed by server name, within a week), say how to reconnect. Reads only that file and the environment; no network, no write.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The account connector: "claude.ai <name>" in Claude Code on a machine, the bare name in cloud sessions. Nếp is the name the
// add link fills in; the other two are names people gave it before 25/10. Sessions made by create_session and the desktop app
// name the company's connector by its id instead (ticket 7b4fbf29).
export const CONNECTOR_ID = '3398cc99-b4dc-41bd-8007-bd4b6792d5cb';
export const SERVERS = ['claude.ai Nếp', 'Nếp', 'claude.ai nhile-governance', 'nhile-governance', 'claude.ai NhiLe Governance', 'NhiLe Governance', CONNECTOR_ID];
export const ADD_LINK =
  'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp';
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function needsSignIn(cache, now = Date.now()) {
  return SERVERS.find((name) => {
    const at = Number(cache?.[name]?.timestamp);
    return Number.isFinite(at) && at <= now + 60_000 && now - at < FRESH_MS;
  }) ?? null;
}

// One line for every door. Claude never tells the user to type /mcp, to sign in with "email công ty" or to press a button the
// screen does not have: it may only ask to open the add link, follow the screen, and open a new session.
export function connectorLine(waiting) {
  const line =
    `Nếp connector: Nếp comes from the Nếp connector of the user's Claude account; this plugin has no Nếp server of its own. ` +
    `If you have no Nếp tool at all (no my_context from any server), say once in your first reply, in Vietnamese: ` +
    `"Nếp chưa nối vào Claude của chị: mở ${ADD_LINK} , làm theo màn hình, rồi mở phiên mới." ` +
    `Never tell the user to type /mcp. Until then, nothing of this chat reaches the ledger.`;
  if (!waiting) return `${line}\n`;
  return `${line} Claude Code lists ${waiting} as needing sign-in: if Nếp tools fail, say once: ` +
    `"Nếp cần nối lại: mở ${ADD_LINK} , bấm nối lại cho Nếp, rồi mở phiên mới."\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let waiting = null;
  try {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    waiting = needsSignIn(JSON.parse(readFileSync(join(dir, 'mcp-needs-auth-cache.json'), 'utf8')), Date.now());
  } catch {
    // No cache file, or not JSON: only the line about signing in.
  }
  process.stdout.write(connectorLine(waiting));
}
