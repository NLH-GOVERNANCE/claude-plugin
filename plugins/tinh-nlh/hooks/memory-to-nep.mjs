// PostToolUse hook of plugin nlh: Claude just wrote to this machine's own memory (auto memory under
// ~/.claude/projects/<project>/memory/, or a CLAUDE.md in the Claude config folder). What the user taught lands there
// when they correct Claude, and no other machine or Claude account can read it. Lab 24/10/2026: 3 of 16 things anh Sơn
// had taught were only in the PC's memory, and one of them sent every branch the wrong way. Village rule 2 already says
// "write it into Nếp first, machine memory keeps only a pointer"; a rule in words did not hold, so the machine asks at the
// exact moment (data-map.md, "điều người dặn máy").
// Reads only the hook input (the path written), never the file; adds one line of context, never blocks; no network.
const MEMORY_FILE = /[\\/]\.claude[\\/](?:projects[\\/][^\\/]+[\\/]memory[\\/][^\\/]+\.md|CLAUDE\.md)$/i;

export function isMachineMemory(path) {
  return MEMORY_FILE.test(String(path ?? ''));
}

export const REMINDER =
  'You just wrote to this machine\'s own memory, which no other machine or Claude account can read. If what you wrote is something the user taught or corrected (how to work, taste, a rule), write it into Nếp now as well, the way village rule 2 says: add_follow_up kind lesson on the ticket or project you are working on, from_cell your villager, said_by the user, quoting the user\'s words; a rule for every trade goes to luật làng as a proposal. Keep the machine memory as a pointer only. Do not copy keys, passwords or private matters.';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (input.hook_event_name === 'PostToolUse' && isMachineMemory(input.tool_input?.file_path)) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: REMINDER } }));
  }
} catch {
  // Not JSON: nothing to say.
}
