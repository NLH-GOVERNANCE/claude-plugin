---
description: Làm tiếp một việc trong tỉnh NhiLe, ở máy nào cũng được
argument-hint: "[việc nào]"
---

Dùng connector NhiLe Governance. Làm tiếp: $ARGUMENTS

1. Chưa rõ việc nào: gọi `my_work` và `my_desk`, gợi ý vài việc đang dở (mỗi việc một dòng, tiêu đề phiếu). Chỉ có một việc thì chọn luôn; nhiều việc thì hỏi một câu.
2. `show_ticket` việc đó, đọc dòng bàn giao (handoff) mới nhất và các câu trả lời sau nó.
3. Tóm tắt 3-5 dòng lời thường: đã tới đâu, còn gì, bước tiếp theo, chỗ đang kẹt.
4. Việc thuộc một ô: `claim` rồi `get_cell` ô đó, làm theo đích và lan can của ô. Phiếu đang có nơi khác giữ thì nói ai đang giữ, không giành.
5. Làm tiếp. Dừng giữa chừng thì ghi bàn giao như skill tinh-nlh dặn.
