---
description: Tickets waiting for my signature in tỉnh NhiLe. Use when the user says "tôi ký", "chờ tôi ký", "ký phiếu"
---

Use the NhiLe Governance connector.

1. Call `my_desk`: `to_sign` is waiting for my signature, `signed` is what I signed in the last 7 days.
2. For each ticket to sign: `show_ticket`, then summarise in plain Vietnamese, three points: what the signature is for, the risk, whether it changes how the ledger stores data. A ticket asking to sign a PR is signed on the exact commit written on the ticket; follow the server's instructions on signing PRs.
3. When the user says to sign, `request_signature` and give the signing link. Only the user presses Sign; never sign for them.
4. Nothing to sign: say one sentence, with the number signed in the last 7 days.
