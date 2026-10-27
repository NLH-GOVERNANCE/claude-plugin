// UserPromptSubmit hook of plugin nlh, village rules part (ticket 92656544). When the user's prompt sounds like a
// correction ("nhắc lại", "sao không"... listed in correction-signals.json), add one line of context so the villager
// fixes the work first, then writes the lesson where it belongs: luật làng for what holds for every trade, its own
// playbook for its trade, and records the correction on the work item when it is one. Only adds text, never blocks.
// No network, no files besides the signal list.
import { readFileSync } from 'node:fs';

// Anh Sơn's wording, 22/10 (reply on the ticket): send it as is.
const LESSON =
  'Người dùng đang sửa bạn. Sửa việc trước. Điều chung cho mọi nghề thì thêm một dòng vào luật làng (ô luat-lang); điều chỉ của nghề bạn thì ghi vào playbook dân làng của bạn. Đọc quyết định đã ký liên quan trước.';
// Data map item 2 (cells data-map.md, 25/10): a person rejecting or editing the machine's result is recorded on the work
// item as a check, so the ledger can count it (runs.checked_by). Nobody wrote these by memory: 0 human checks on 24/10.
const CHECK =
  'Điều người dùng sửa hay bác là kết quả một việc trong Nếp thì ghi lần đó lên việc: add_follow_up kind check, verdict rejected (bác) hay edited (sửa), said_by là người dùng, run_id nếu có, body trích nguyên lời sửa (không chép khoá hay chuyện riêng).';
const REMINDER = `${LESSON} ${CHECK}`;

// Lower case, no diacritics, single spaces: "Sao KHÔNG" and "sao khong" match the same signal.
const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const signals = JSON.parse(readFileSync(new URL('./correction-signals.json', import.meta.url), 'utf8')).map(fold);

// A turn Claude Code made, not one the user typed: a sub-agent's or another session's report, a reminder, an event
// (ticket 5ee8d456). Its words are not the user correcting anyone.
const MACHINE_TURN = /^\s*<(agent-message|system-reminder|cross-session-message|side-sessions-event|task-notification|ci-monitor-event|channel|local-command-stdout)[\s>]/;

function isCorrection(prompt) {
  if (MACHINE_TURN.test(String(prompt ?? ''))) return false;
  const text = ` ${fold(prompt)} `;
  return signals.some((signal) => text.includes(` ${signal} `));
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let prompt = '';
try {
  prompt = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}').prompt ?? '';
} catch {
  prompt = '';
}
if (isCorrection(prompt)) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: REMINDER } }));
}
