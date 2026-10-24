// Schedules that run on this machine (ticket eca924c5): the Claude desktop app keeps its scheduled tasks in
// <app data>/claude-code-sessions/<account>/<organisation>/scheduled-tasks.json. Read-only. Only name, when and on/off
// leave this file: never the prompt (SKILL.md), a path, the working folder or an environment variable.
// Found on Windows (Claude-Data folder of the installed app). The macOS folder is the app's usual data folder and is NOT
// checked on a Mac yet: nothing found there means no schedules reported, never a guess at another path.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAX_SCHEDULES = 50;

const subdirs = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
};

// App data folders to look in, per platform. NLH_CLAUDE_DATA_DIR (a list separated by the path delimiter) replaces them.
export function dataDirs(env = process.env, platform = process.platform, home = homedir()) {
  if (env.NLH_CLAUDE_DATA_DIR) return env.NLH_CLAUDE_DATA_DIR.split(platform === 'win32' ? ';' : ':').filter(Boolean);
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    const roaming = env.APPDATA || join(home, 'AppData', 'Roaming');
    return [
      ...subdirs(join(local, 'Claude-Data')),
      join(roaming, 'Claude'),
      ...subdirs(join(local, 'Packages')).filter((dir) => /[\\/]Claude_/.test(dir)).map((dir) => join(dir, 'LocalCache', 'Roaming', 'Claude')),
    ];
  }
  if (platform === 'darwin') return [join(home, 'Library', 'Application Support', 'Claude')];
  return [];
}

// scheduled-tasks.json files under the app data folders: <dir>/claude-code-sessions/<account>/<organisation>/.
export function scheduleFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    for (const account of subdirs(join(dir, 'claude-code-sessions'))) {
      for (const organisation of subdirs(account)) {
        const file = join(organisation, 'scheduled-tasks.json');
        if (existsSync(file)) files.push(file);
      }
    }
  }
  return files;
}

const clean = (text, max) =>
  String(text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f<>"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const onceAt = (value) => {
  const date = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(date.getTime()) ? '' : `once ${date.toISOString()}`;
};

// One list entry per schedule, three fields: name, when (cron text, or "once <ISO time>"), enabled. A schedule with no
// name or no time is left out. Nothing else of the file is copied.
export function summarizeSchedules(file) {
  const list = Array.isArray(file?.scheduledTasks) ? file.scheduledTasks : [];
  const out = [];
  for (const task of list) {
    const name = clean(task?.displayName || task?.id, 120);
    const when = task?.cronExpression ? clean(task.cronExpression, 60) : task?.fireAt ? onceAt(task.fireAt) : '';
    if (name && when) out.push({ name, when, enabled: task.enabled !== false });
  }
  return out;
}

// All schedules of this machine, without doubles (same name and time), at most MAX_SCHEDULES.
export function localSchedules(env = process.env, platform = process.platform, home = homedir()) {
  const seen = new Set();
  const out = [];
  for (const path of scheduleFiles(dataDirs(env, platform, home))) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    for (const item of summarizeSchedules(parsed)) {
      const key = `${item.name}\n${item.when}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.slice(0, MAX_SCHEDULES);
}
