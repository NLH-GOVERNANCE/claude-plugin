---
description: Làm tiếp một việc trong tỉnh NhiLe, ở máy nào cũng được
argument-hint: "[việc nào]"
---

Dùng connector NhiLe Governance. Làm tiếp: $ARGUMENTS

1. Chưa rõ việc nào: gọi `my_work` và `my_desk`, gợi ý vài việc đang dở (mỗi việc một dòng, tiêu đề phiếu). Chỉ có một việc thì chọn luôn; nhiều việc thì hỏi một câu.
2. `show_ticket` việc đó, đọc dòng bàn giao (handoff) mới nhất và các câu trả lời sau nó.
3. Tóm tắt 3-5 dòng lời thường: đã tới đâu, còn gì, bước tiếp theo, chỗ đang kẹt.
4. Chỉ nhận (`claim`) việc đang chờ chính người dùng: việc từ `my_work`, hay phiếu gửi cho người dùng hoặc ô riêng của họ. Nhận rồi thì `get_cell` ô đó, làm theo đích và lan can của ô. Phiếu đang có nơi khác giữ thì nói ai đang giữ, không giành.
   Việc người dùng đã giao cho ô khác (mục `assigned` của `my_desk`): chỉ đọc bàn giao và kể lại, không tự `claim`. Hỏi một câu: "Muốn tôi làm thay không?". Người dùng nói có thì mới `claim` rồi làm như trên.
5. Làm tiếp. Dừng giữa chừng thì ghi bàn giao như skill tinh-nlh dặn.
