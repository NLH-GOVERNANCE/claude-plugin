---
description: Ghi bàn giao lên phiếu đang làm trong Nếp, trước khi dừng hay đổi máy. Dùng khi người dùng nói "bàn giao", "tôi dừng đây", "đổi máy"
---

Use the NhiLe Governance connector.

1. Find the ticket(s) worked in this conversation. Not clear: call `my_work`, ask one question with a few suggestions.
2. For each ticket: `add_follow_up` kind `handoff`, body with four short points: what was done, what is left, next step, where it is stuck (if anywhere). Add who should carry on if known.
3. Stopping because the Claude usage limit is near or the machine is turning off: also call `report_session` with this session's id, the `machine_id` from the line "This machine: id …" and `machine_stop` (`quota` or `shutdown`), so another machine sitting in the same villager carries on at once.
4. Tell the user in one sentence which ticket got the handoff. On another machine, say "làm tiếp" (or type `/nlh:resume`) to carry on.
