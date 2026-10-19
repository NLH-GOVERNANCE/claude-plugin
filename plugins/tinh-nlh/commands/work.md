---
description: Việc của tôi trong Nếp: việc đang chờ tôi và việc tôi đã giao tới đâu. Dùng khi người dùng nói "việc của tôi", "xem việc", "hôm nay có gì"
---

Use the NhiLe Governance connector.

1. Call `my_work` (waiting for me) and `my_desk` (take `assigned`: work I assigned).
2. Tell the user in plain Vietnamese, two groups:
   - Waiting for me: one line each with the ticket title, who asked, how long it has waited, and what I must do (sign, answer, decide).
   - Work I assigned: one line each, by the status `my_desk` returns (nobody claimed yet, who is working, new reply, may be stuck, done). If there is a latest handoff, add one sentence.
3. Name tickets by title and people by name. Never read out ticket or person ids.
4. Ask one question: which one first, with a few suggestions.
