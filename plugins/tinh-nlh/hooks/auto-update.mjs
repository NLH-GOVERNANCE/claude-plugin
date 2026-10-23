// SessionStart hook of plugin nlh (ticket 0f936d79, 23/10): turn on Claude Code's own auto-update for the marketplace
// nlh-governance, so a new plugin version reaches every machine without a command and without anyone opening /plugin.
// It writes no update logic: Claude Code refreshes the marketplace in the background after the first message, updates
// the plugin files on disk, and the next session loads them (the running one keeps its version; Loa restarts itself,
// speaker/loa.mjs). Third-party marketplaces default to auto-update off, and a plugin cannot switch it on from its own
// files (plugin settings.json takes only `agent` and `subagentStatusLine`), so the one thing written is
//   extraKnownMarketplaces["nlh-governance"].autoUpdate = true
// in the user settings file, only when nobody has set it either way: a choice made with the "Disable auto-update" toggle
// of /plugin (known_marketplaces.json or this entry) is kept. Nothing else in the file changes. No network. Never in the
// way of the session: any failure is silent.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKETPLACE = 'nlh-governance';

// The settings object with autoUpdate on for the marketplace, or null when there is nothing to change.
// known: the parsed plugins/known_marketplaces.json (what Claude Code fetched), or null.
export function withAutoUpdate(settings, known) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  // Set either way on disk (the toggle in /plugin writes it there): never overwritten.
  if (known?.[MARKETPLACE]?.autoUpdate !== undefined) return null;
  const all = settings.extraKnownMarketplaces;
  if (all !== undefined && (!all || typeof all !== 'object' || Array.isArray(all))) return null;
  const declared = all?.[MARKETPLACE];
  if (declared !== undefined) {
    if (!declared || typeof declared !== 'object' || !declared.source || 'autoUpdate' in declared) return null;
    return { ...settings, extraKnownMarketplaces: { ...all, [MARKETPLACE]: { ...declared, autoUpdate: true } } };
  }
  // Added with `claude plugin marketplace add --scope project` or by the app: fetched, but not in the user settings.
  const source = known?.[MARKETPLACE]?.source;
  if (!source || typeof source !== 'object') return null;
  return { ...settings, extraKnownMarketplaces: { ...(all ?? {}), [MARKETPLACE]: { source, autoUpdate: true } } };
}

const readJson = (file, read) => {
  try {
    return JSON.parse(read(file, 'utf8'));
  } catch {
    return null;
  }
};

// 'enabled' | 'nothing' | 'no-settings'. The file keeps its indentation and final newline; it is replaced in one rename.
export function enableAutoUpdate({ env = process.env, home = homedir(), read = readFileSync, write = writeFileSync, rename = renameSync } = {}) {
  const root = env.CLAUDE_CONFIG_DIR || join(home, '.claude');
  const file = join(root, 'settings.json');
  let raw;
  try {
    raw = read(file, 'utf8');
  } catch {
    return 'no-settings';
  }
  const settings = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  const next = withAutoUpdate(settings, readJson(join(root, 'plugins', 'known_marketplaces.json'), read));
  if (!next) return 'nothing';
  const indent = raw.match(/\n([ \t]+)"/)?.[1] ?? '  ';
  const part = `${file}.nlh-${process.pid}.part`;
  write(part, `${JSON.stringify(next, null, indent)}${raw.endsWith('\n') ? '\n' : ''}`);
  rename(part, file);
  return 'enabled';
}

// Run directly by the hook; imported by tests: nothing runs. Windows paths ignore case.
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) {
  try {
    enableAutoUpdate();
  } catch {
    // never in the way of the session
  }
}
