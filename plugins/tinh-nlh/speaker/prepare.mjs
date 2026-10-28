// Marks the first questions of Claude Code as answered, so Loa can open with nobody looking (Windows launcher, 28/10, 26f86f3d).
// On a first start Claude Code asks, in English, for the type of letters and the way to sign in, and whether to trust the
// folder it opens in. A hidden Loa has nobody to answer. This sets, only where missing, three things in Claude's own settings
// file (~/.claude.json): hasCompletedOnboarding, theme, and the trust of Loa's work folder. Nothing else is touched or read
// out; an unreadable file is left alone. Usage: node prepare.mjs --file <~/.claude.json> --work <Loa work folder>
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

// Returns true when the file was changed.
export function prepare(file, work) {
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  let changed = false;
  if (!config.hasCompletedOnboarding) {
    config.hasCompletedOnboarding = true;
    if (!config.theme) config.theme = 'dark';
    changed = true;
  }
  // Claude Code keys the folder with forward slashes, also on Windows.
  const key = String(work || '').replace(/\\/g, '/');
  if (key) {
    config.projects = config.projects && typeof config.projects === 'object' ? config.projects : {};
    const project = config.projects[key] && typeof config.projects[key] === 'object' ? config.projects[key] : (config.projects[key] = {});
    if (project.hasTrustDialogAccepted !== true) {
      project.hasTrustDialogAccepted = true;
      changed = true;
    }
  }
  if (!changed) return false;
  try {
    const part = `${file}.loa-${process.pid}`;
    writeFileSync(part, JSON.stringify(config, null, 2));
    renameSync(part, file);
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes('--file')) {
  const arg = (name) => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1] : '';
  };
  prepare(arg('--file'), arg('--work'));
}
