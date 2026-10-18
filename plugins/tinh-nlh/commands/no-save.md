---
description: Stop saving this conversation to the tỉnh NhiLe chat store, from this turn on. Use when the user says "đừng lưu", "thôi lưu", "không lưu phiên này"
---

Use the NhiLe Governance connector.

1. Call `save_chat` with this session's `session_id` (first line of the session, "This session: id …"; if missing, the id used when saving a summary) and `role` `opt_out`. The ledger also catches this command from the hook; calling once more makes sure.
2. Tell the user in one sentence: from now on this session is not saved; turns already saved stay (chat is company data, kept long term). To save again, open a new session.
