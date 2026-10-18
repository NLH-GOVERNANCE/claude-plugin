---
description: Giao một việc cho một ô trong tỉnh NhiLe
argument-hint: "[việc cần làm]"
---

Dùng connector NhiLe Governance. Giao việc cho một ô: $ARGUMENTS

Hỏi từng câu một, mỗi câu kèm vài gợi ý, chỉ hỏi phần còn thiếu:

1. Ô nào làm? `list_cells` rồi gợi ý vài ô hợp nhất, mỗi ô một câu nói nó làm gì.
2. Việc gì?
3. Thế nào là xong?

Đủ ba ý thì đọc lại phiếu bằng lời thường. Người dùng đồng ý thì `open_ticket` cho ô đó. Xong nói ngắn: đã giao cho ô nào, ai được báo.
