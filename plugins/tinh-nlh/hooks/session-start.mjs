// SessionStart hook of plugin tinh-nlh, session self-report part (ticket 6d4cb2ad). Claude Code passes a JSON on stdin
// with session_id and session_title (the session name once set, e.g. with --name). The hook prints one line so Claude
// knows this session's id and name, then reports them with report_session when it takes a cell. No network, no other
// files.
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let input = {};
try {
  input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
} catch {
  input = {};
}

// Id and name go into an instruction for Claude: keep only the expected shape, drop characters that build tags or quotes.
const id = /^[A-Za-z0-9_.:-]{1,100}$/.test(String(input.session_id ?? '')) ? input.session_id : null;
const title = String(input.session_title ?? '')
  .replace(/[\u0000-\u001f\u007f-\u009f<>"`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 200);

if (id) {
  const name = title ? `name "${title}"` : 'no name yet';
  // Names with "@" cannot receive SendMessage, so Loa cannot forward to a session named like "Ô CTO (son@cto)".
  const rename = title.includes('@') ? ' The name has @, so Loa cannot forward work to it: ask the user to rename it like "Ô CTO (son/cto)".' : '';
  process.stdout.write(
    `This session: id ${id}, ${name}. When this session takes a Nếp cell or switches ticket, call report_session of the NhiLe Governance connector with session_id ${id}${title ? ' and session_name exactly as above' : ''}, cell (the ledger cell name, e.g. dai-dien-kien-truc-son, not the handle cto) and ticket_id, so Loa on this machine forwards that cell's work here.${rename}\n`,
  );
}
