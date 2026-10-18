---
description: Write a handoff on the ticket being worked in tỉnh NhiLe, before stopping or switching machines. Use when the user says "bàn giao", "tôi dừng đây", "đổi máy"
---

Use the NhiLe Governance connector.

1. Find the ticket(s) worked in this conversation. Not clear: call `my_work`, ask one question with a few suggestions.
2. For each ticket: `add_follow_up` kind `handoff`, body with four short points: what was done, what is left, next step, where it is stuck (if anywhere). Add who should carry on if known.
3. Tell the user in one sentence which ticket got the handoff. On another machine, say "làm tiếp" (or type `/tinh-nlh:resume`) to carry on.
