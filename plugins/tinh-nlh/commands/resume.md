---
description: Làm tiếp một việc trong Nếp, ở máy nào cũng được. Dùng khi người dùng nói "làm tiếp", "tiếp việc …", "đang dở gì"
argument-hint: "[việc nào]"
---

Use the NhiLe Governance connector. Resume: $ARGUMENTS

1. Work not clear yet: call `my_work` and `my_desk`, suggest a few open items (one line each, ticket title). Only one item: pick it. Several: ask one question.
2. `show_ticket` that item, read the latest `handoff` and the replies after it.
3. Summarise in 3-5 plain Vietnamese lines: how far it got, what is left, next step, where it is stuck.
4. Only claim (`claim`) work waiting for the user themself: items from `my_work`, or tickets sent to the user or their own cell. After claiming, `get_cell` that cell and follow its goal and guardrails. A ticket held elsewhere: say who holds it, do not take it.
   Work the user assigned to another cell (`assigned` in `my_desk`): only read the handoff and tell it back, do not `claim`. Ask one question: "Muốn tôi làm thay không?". Only if the user says yes, `claim` and work as above.
5. Carry on. When stopping midway, write a handoff as the nep skill says.
