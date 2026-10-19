---
description: Giao việc cho một ô trong Nếp. Dùng khi người dùng nói "giao việc", "giao cho …", "nhờ ô …"
argument-hint: "[việc cần làm]"
---

Use the NhiLe Governance connector. Assign: $ARGUMENTS

Ask one question at a time, each with a few suggestions, only for what is missing:

1. Which cell? `list_cells`, then suggest the best few, one sentence each on what it does.
2. What is the work?
3. What does done look like?

With all three, read the ticket back in plain Vietnamese. When the user agrees, `open_ticket` for that cell. Then say briefly which cell got it and who was notified.
