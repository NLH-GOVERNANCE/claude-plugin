# Nếp

Nếp là nơi cả công ty NhiLe giao việc, theo dõi việc và ký duyệt. Cài một lần, đăng nhập bằng email công ty.

- Xem việc: hỏi Claude "việc của tôi hôm nay?" hoặc gõ `/work`. Ở Claude Code và Cowork, mở phiên mới là Claude tự kể.
- Giao việc: "Giao cho chị Thùy: …, xong khi …" hoặc `/assign`.
- Ký: "tôi ký" hoặc `/sign`.

Cài trong Claude Code (bản 2.1.275 trở lên), một dòng:

```
/plugin install nlh --marketplace NLH-GOVERNANCE/claude-plugin
```

Cài trên claude.ai và bật Loa: xem README ở gốc repo `NLH-GOVERNANCE/claude-plugin`.

## For maintainers

Technical name `nlh` (old name `tinh-nlh`, migrated by `renames` in the marketplace), display name Nếp. Contents:

- the NhiLe Governance connector (`https://mcp.nlh.vn/mcp`); everyone signs in once with the company email;
- skill `nep`: the first turn of every conversation calls `my_context` (who you are, your cells, open projects, work waiting, work assigned) and summarises it in plain Vietnamese;
- seven commands: `/nlh:work` (inbox), `/nlh:assign` (assign work to a cell), `/nlh:resume` (resume a piece of work), `/nlh:handoff` (write a handoff), `/nlh:sign` (tickets waiting for your signature), `/nlh:no-save` (stop saving this session to the chat store), `/nlh:speaker` (turn on Loa on this machine: the "Loa tỉnh NhiLe" desktop icon). In the Claude app and on the phone type `/work`, `/assign`, `/sign` (or say "xem việc của tôi", "giao việc", "tôi ký");
- Loa, the speaker on the machine (channel `speaker` and its launchers in `speaker/`, Windows and macOS; Claude Code only, only when opened from the Loa icon): reads the user's new work from the hub every 15 seconds with a private key and tells the session seated at each cell in one sentence, by the session id that session reported; resumes a stopped session, or opens a new one; writes one ledger row per delivery, no content. Reminds the same session when an item is still in the feed after 30 minutes and nobody holds it, at most 3 times, 30 minutes apart; holds a new answer 2 minutes and sends it only if still in the feed; skips work a cell opened for itself. Skill `speaker-loop` instructs the Loa session (named apart from the `speaker` command, which wins a shared name). The hub calls Loa tower: tower = speaker. Setup: root README, "Bật Loa trên máy";
- hooks (Claude Code and Cowork only): at session start, print one line telling Claude to call `my_context` first, with this session's id and name; after `/clear` or compaction, call `my_context` through the signed-in connector and load the result; at the end of each turn and when the session closes, call `report_session` with the session id and status, so Loa knows which session sits at which cell. The start line also says to read `village_rules` (luật làng) before any work; when the user's prompt sounds like a correction (signals in `hooks/correction-signals.json`, matched without diacritics), one line of context says to fix the work first, then add the lesson to luật làng if it holds for every trade, or to the villager's own playbook if not. Hooks hold no token and send no chat content. Chat saving: when the user sends a prompt and when Claude finishes answering, call `save_chat` with that turn (never tool results); the store sits outside the ledger, only keeps sessions that really use Nếp (a Nếp tool other than the opening `my_context`, reported by the PostToolUse hook; or seated at a cell), long term; phone numbers, emails, ID numbers and addresses are encrypted; turns with keys or about money, contracts, HR, customers or children are not stored verbatim; no delete button, soft delete only.
- local gate (Claude Code only): before a Bash or PowerShell command runs `git commit` or `git push` in a repo of NLH-OS, NLH-GOVERNANCE or NLH-NEDU-*, `gate/hook.mjs` runs what Review would fail on: the counted rules of `gate/rules.mjs` in NLH-OS/api (fetched with the user's `gh` from `main`, cached 6 hours in `~/.tinh-nlh/gate`, never copied into the plugin), the repo's `test:fast` script if its root `package.json` has one, and the repeated errors in `gate/repeated-errors.json` (one check per line; the weekly repeated-errors round adds lines). A failure denies the command with one line per finding. After a push that passed, Claude writes one fact line on its ticket. Other repos and other commands are untouched; the hook failing never blocks.

The plugin holds no secret and copies no rules or cells: everything is read from the system after sign-in. It creates no scheduled tasks; for a cell to work while Claude is closed, turn on a scheduled task or a backup machine.

## Data

The plugin stores nothing except for Loa: its launcher copy, read mark, seen ids, pending sends, told and held item ids for reminders (`tower-state.json`) live in `~/.tinh-nlh/speaker` on the machine; the key is encrypted with DPAPI (Windows) or kept in the Keychain (macOS), readable only by that account on that machine. The local gate keeps its cached rules, last passing test tree and recent blocks in `~/.tinh-nlh/gate`. Loa reads from `api.nlh.vn`; everything else goes through the connector at `mcp.nlh.vn`, under the user's own company account.
