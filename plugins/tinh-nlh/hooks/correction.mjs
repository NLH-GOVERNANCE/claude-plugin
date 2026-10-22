// UserPromptSubmit hook of plugin nlh, village rules part (ticket 92656544). When the user's prompt sounds like a
// correction ("nhắc lại", "sao không"... listed in correction-signals.json), add one line of context so the villager
// fixes the work first, then writes the lesson where it belongs: luật làng for what holds for every trade, its own
// playbook for its trade. Only adds text, never blocks. No network, no files besides the signal list.
import { readFileSync } from 'node:fs';

// Anh Sơn's wording, 22/10 (reply on the ticket): send it as is.
const REMINDER =
  'Người dùng đang sửa bạn. Sửa việc trước. Điều chung cho mọi nghề thì thêm một dòng vào luật làng (ô luat-lang); điều chỉ của nghề bạn thì ghi vào playbook dân làng của bạn. Đọc quyết định đã ký liên quan trước.';

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

function isCorrection(prompt) {
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
