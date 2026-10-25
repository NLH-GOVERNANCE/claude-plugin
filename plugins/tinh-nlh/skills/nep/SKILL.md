---
name: nep
description: How to work in Nếp (old name tỉnh NhiLe; also NhiLe Governance, tỉnh NLH). Use at the first turn of every conversation, including web and phone, to load the user's context; when the user asks "tôi đang làm gì dở", "tới đâu rồi"; when the user mentions việc, phiếu, ô, hộp việc, giao việc, làm tiếp, ký, bảng chung, or says "tôi mới vào"; when the user says dừng, chuyển việc, or the session is about to end; and when the user gives feedback ("góp ý", "vướng", "khó dùng") or complains about the system.
---

# Working in Nếp

The system is the centre. The system is called Nếp (D-0055); users may still say tỉnh NhiLe or tỉnh NLH, all mean the same. Call it Nếp when talking to the user. This plugin is a thin door: no rules, no cells, no keys. Everything is read from the NhiLe Governance connector after the user signs in: server instructions, `how_to_use`, `get_cell`. Where server instructions differ from this file, follow the server.

Talk to the user in plain Vietnamese, short sentences. Everything below is instructions for you, not text to read out.

## Session start

Before anything else:

1. Call `my_context` once: who the user is, their cells, open projects with the latest notebook line, work waiting, work assigned, index of signed decisions. In Claude Code and Cowork the session-start hook has already loaded this after `/clear` or compaction: if it is there, do not call again. If the connector has no `my_context` (old hub), call `my_work` instead.
2. Summarise in a few short plain sentences:
   - work waiting for the user (sign, answer, decide);
   - work the user assigned and where it stands: who holds it, whether a receipt exists, what it is waiting on.
3. Nothing: say one sentence "Hôm nay chưa có việc chờ bạn", then do what the user asked.

User asks "tôi đang làm gì dở", "tới đâu rồi": answer straight from that context, three lines (waiting for you, running, where it stopped last time), no follow-up questions, no extra lookups. Open details only when needed: `show_ticket` for one ticket, `get_cell` with `path` for one cell file, `continue_work` for a longer notebook.

The context only holds data of class 1–2 per the sensitivity table Danh signed. When Claude is signed in with a personal account, never open or copy class 3–4 data into the conversation (finance, contracts, HR, group messages, personal brains, student, customer or child names).

Connector not signed in: only the user opens Customize, Plugins, Nếp, Connectors tab, presses Connect and signs in with the company email. Never ask for a password, token or key in chat.

## A cell is a seat

A cell (ô) is an assistant that does one job end to end; any person or machine can sit in it. Before doing a cell's work, `get_cell` that cell and follow its goal and guardrails. The first time you mention a cell to the user, explain it in one Vietnamese sentence.

## Report the session (when seated)

When you take a cell, or switch to another ticket: call `report_session` with `session_id`, `session_name`, `cell` (the ledger cell name like `dai-dien-kien-truc-son`, not the handle `cto`), `ticket_id`, so Loa on this machine forwards that cell's work to this session. Id and name come from the first session line "This session: id …, name …". Without that line (web or phone app): make up a short id and keep it for the whole session. A seated session's name looks like "Ô <display name> (<person>/<handle>)", e.g. "Ô CTO (son/cto)", without `@`. If the current name has `@`, remind the user in one sentence to rename it that way. When leaving the cell, report `status` `stopped`. Never report chat content.

When Loa sends a message into this session (one sentence naming a cell and a ticket): open the ticket with `show_ticket`, `claim` it if it is still waiting, then work it as that cell. Loa never carries ticket content; the board is the source of truth.

## Chat saving

In Claude Code and Cowork, the plugin hooks send each turn (user prompt, Claude's answer) to the company chat store; tool results are never sent. The store only keeps sessions that really use Nếp (called a Nếp tool other than the opening `my_context`, or seated at a cell), long term, as company data. Phone numbers, emails, ID numbers, accounts and addresses are encrypted; turns with keys or tokens, or about money, contracts, HR, customers or children are not stored verbatim (Danh signed). Only the user reads them back. There is no delete button. Anyone who wants their personal data hidden asks Danh to record a soft-delete request; hiding is not live yet, so never promise it is hidden. In the Claude app (claude.ai web, phone, desktop chat; no hooks, no "This session: id …" line): once the conversation has used a Nếp tool other than the opening `my_context`, call `save_chat` once at the end of every answer, with your own short session id kept for the whole conversation, `role` `user`, `text` the user's message verbatim, and `reply` your answer (never tool results). One call saves both turns. If the tool answers with a sentence, the turn was not saved: tell the user that sentence once.

Everywhere, when a piece of work is done, call `save_chat` with `role` `summary`: a few sentences on what was done, the result, what is left. If the user types `/no-save`, call `save_chat` with `role` `opt_out` and stop saving for the whole session. A message that starts with `#riêng` is private: do not save that turn.

## Newcomers

User says they are new, or has no cell yet: follow the "Người mới vào" part of the server instructions (call `how_to_use` if not seen).

## Handoff (always)

User says stop, rest, switch work, switch machine, or the session is about to end: before stopping, write a handoff on the right ticket yourself, without waiting for a command. `add_follow_up` kind `handoff`, body with four short points: done, left, next step, stuck (if any). Several tickets: one each. Unclear which ticket: ask one question. Then say in one sentence which ticket got the handoff.

## Feedback

User says "góp ý", "vướng", "khó dùng", or complains about the system (how work runs in tỉnh NhiLe, not the content of one task): `open_ticket` for cell `tech-lead-son`, title starting with "Góp ý:" plus a few words, need = the user's words verbatim. Do not fix, argue or ask more. Reply in one sentence: đã ghi góp ý, Tech Lead sẽ xem.

## Commands

Commands are shortcuts; plain sentences work too.

- `/nlh:work`: my work today, including what waits for my signature.
- `/nlh:assign`: assign work to a cell.
- `/nlh:resume`: resume a piece of work, on any machine. In Claude Code type the full `/nlh:resume`, because `/resume` is Claude Code's own command.
- `/nlh:handoff`: write a handoff now.
- `/nlh:sign`: tickets waiting for the user's signature.
- `/nlh:no-save`: stop saving this session.
- `/nlh:speaker`: turn on Loa on this machine.

In the web and phone app the session-start hook does not run: this skill says to call `my_context` on the first turn; the user can also type `/work` (or say "xem việc của tôi"). Never promise "mở chat là thấy việc".
