// SessionStart hook of plugin nlh: the Nếp connector line. Since 0.22.0 the plugin brings Nếp itself (server `nep`,
// https://mcp.nlh.vn/mcp, scoped name plugin:nlh:nep), as anh Sơn asked on 26/10: install the plugin and Nếp is there,
// sign in once in the browser. On a machine the plugin server wins over a Nếp connector of the account at the same URL
// (code.claude.com/docs/en/mcp, precedence by endpoint), so the account connector is hidden there. In a cloud session the
// proxy rewrites the account connector's URL, so both are listed: the plugin server cannot sign in there, and Nếp comes
// from the account connector. Claude must not ask the user to sign in to the plugin server in the cloud.
// Always prints one line. If Claude Code lists a Nếp server as needing sign-in (<config dir>/mcp-needs-auth-cache.json,
// keyed by server name, within a week), say how to sign in. Reads only that file and the environment; no network, no write.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The plugin's own server first, then the account connector: "claude.ai <name>" in Claude Code on a machine, the bare
// name in cloud sessions. Nếp is the name the add link fills in; the other two are names people gave it before 25/10.
// Sessions made by create_session and the desktop app name the company's connector by its id instead (ticket 7b4fbf29).
export const PLUGIN_SERVER = 'plugin:nlh:nep';
export const CONNECTOR_ID = '3398cc99-b4dc-41bd-8007-bd4b6792d5cb';
export const SERVERS = [PLUGIN_SERVER, 'claude.ai Nếp', 'Nếp', 'claude.ai nhile-governance', 'nhile-governance', 'claude.ai NhiLe Governance', 'NhiLe Governance', CONNECTOR_ID];
export const ADD_LINK =
  'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp';
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

// In the cloud the plugin server always needs sign-in and never gets it; only the account connector counts there.
export function needsSignIn(cache, now = Date.now(), cloud = false) {
  return SERVERS.find((name) => {
    if (cloud && name === PLUGIN_SERVER) return false;
    const at = Number(cache?.[name]?.timestamp);
    return Number.isFinite(at) && at <= now + 60_000 && now - at < FRESH_MS;
  }) ?? null;
}

export function connectorLine(waiting, cloud = false) {
  if (cloud) {
    const line =
      `Nếp connector: this is a cloud session. Nếp comes from the Nếp connector of the user's Claude account; the plugin's own ` +
      `Nếp server (${PLUGIN_SERVER}) cannot sign in here and that is expected: never ask the user to sign in to it. ` +
      `If you have no Nếp tool at all (no my_context from any server), say once in your first reply, in Vietnamese: ` +
      `"Phiên trên mây này chưa có Nếp: trên máy tính mở ${ADD_LINK} , bấm Add, đăng nhập bằng email công ty, rồi mở phiên mới." ` +
      `Until then, nothing of this chat reaches the ledger.`;
    if (!waiting) return `${line}\n`;
    return `${line} The account connector (${waiting}) needs sign-in: if Nếp tools fail, say once: ` +
      `"Nếp cần đăng nhập lại: mở claude.ai, Customize, Connectors, bấm Connect ở Nếp, rồi mở phiên mới."\n`;
  }
  const line =
    `Nếp connector: the plugin brings Nếp (server ${PLUGIN_SERVER}); the user signs in once in the browser with the company email. ` +
    `If you have no Nếp tool (no my_context from any server), say once in your first reply, in Vietnamese: ` +
    `"Nếp chưa đăng nhập trên máy này: gõ /mcp, chọn plugin:nlh:nep, bấm Enter, đăng nhập bằng email công ty trong trình duyệt mở ra." ` +
    `Until then, nothing of this chat reaches the ledger.`;
  if (!waiting) return `${line}\n`;
  return `${line} Claude Code lists ${waiting} as needing sign-in: if Nếp tools fail, give that same sentence.\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const cloud = process.env.CLAUDE_CODE_REMOTE === 'true';
  let waiting = null;
  try {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    waiting = needsSignIn(JSON.parse(readFileSync(join(dir, 'mcp-needs-auth-cache.json'), 'utf8')), Date.now(), cloud);
  } catch {
    // No cache file, or not JSON: only the line about signing in.
  }
  process.stdout.write(connectorLine(waiting, cloud));
}
