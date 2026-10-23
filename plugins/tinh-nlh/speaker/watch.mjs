// Plugin monitor `loa` (monitors/monitors.json), started the first time the Loa session runs the skill speaker-loop.
// What Claude Code does with a monitor: every line it prints reaches the session as a notification, and wakes it when
// idle. So this prints, one line each, what the speaker server (speaker.mjs, NLH_LOA=monitor) wrote to loa-outbox.jsonl:
// `LOA {json}` with action, kind, cell, ticket, entry_id, to, text. No network, nothing else read. The server empties
// the file when it starts, so reading from the beginning shows each line once per Loa.
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTBOX_FILE } from './loa.mjs';

// Lines are one JSON object each; a line over this is cut off, not printed whole.
const MAX_LINE = 4000;

// The bytes after `offset` that make whole lines: { lines, offset } where offset moves past the last newline. A file
// that got shorter (a Loa that began again) starts over from the top.
export function readLines(file, offset, stat = statSync, open = openSync, read = readSync, close = closeSync) {
  let size;
  try {
    size = stat(file).size;
  } catch {
    return { lines: [], offset };
  }
  if (size < offset) offset = 0;
  if (size === offset) return { lines: [], offset };
  const buffer = Buffer.alloc(size - offset);
  const fd = open(file, 'r');
  let got = 0;
  try {
    got = read(fd, buffer, 0, buffer.length, offset);
  } finally {
    close(fd);
  }
  const text = buffer.subarray(0, got);
  const end = text.lastIndexOf(0x0a);
  if (end < 0) return { lines: [], offset };
  const lines = text
    .subarray(0, end)
    .toString('utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim());
  return { lines, offset: offset + end + 1 };
}

export const printable = (line) => `LOA ${line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line}`;

export function watch({ dir = process.env.NLH_TOWER_DIR || join(homedir(), '.tinh-nlh', 'speaker'), out = (text) => process.stdout.write(`${text}\n`), everyMs = 2000 } = {}) {
  const file = join(dir, OUTBOX_FILE);
  let offset = 0;
  const poll = () => {
    const next = readLines(file, offset);
    offset = next.offset;
    for (const line of next.lines) out(printable(line));
  };
  poll();
  return setInterval(poll, everyMs);
}

const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) watch();
