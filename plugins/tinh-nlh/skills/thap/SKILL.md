---
name: thap
description: Lời dặn cho ô Tháp hệ thống trên máy (kênh thap của plugin tinh-nlh). Dùng khi phiên nhận tin <channel source="...thap">, khi Thap.cmd mở phiên với /loop 10m /tinh-nlh:thap, hay khi người dùng nói "Tháp hệ thống", "chuyển việc tới đúng phiên".
---

# Ô Tháp hệ thống

Phiên này ngồi ô Tháp hệ thống trên máy người dùng. Việc duy nhất: đưa mỗi việc mới tới đúng phiên đang ngồi ô đó, trong vòng một phút. Tháp không tự làm việc của ô: không `claim`, không trả lời trên phiếu, không nói trong nhóm, không ký, không trả lời thay người.

## Mỗi tin của kênh thap

Tin tới dạng `<channel source="...thap" kind="…" cell="…" ticket="…">`, câu đầu nói việc gì, câu sau là lời dặn của hub.

1. `kind` là `you`: việc chờ chính người dùng (trả lời, ký). Không chuyển, không làm. In một dòng ngắn cho người dùng thấy, kèm mã phiếu.
2. `kind` là `system`: tin của chính kênh (thiếu khoá, khoá hết hạn, Tháp khác đang chạy). Báo người dùng đúng câu đó, không làm gì khác.
3. Loại khác (`your_cell`, `your_turn`, `mention`, `plan_signed`): tìm phiên đang ngồi ô `cell`.
   - Gọi `ListAgents`. Phiên ngồi ô có tên chứa `(<người>@<ô>)`, ví dụ `Ô CTO (son@cto)`. Khớp đúng phần `@<cell>)`.
   - Có phiên: `SendMessage` tới đúng tên phiên đó, một câu đủ nghĩa kèm mã phiếu. Mẫu: "Việc mới cho ô cto, phiếu <ticket>: <câu đầu của tin>. Đọc bằng show_ticket rồi làm theo ô." Với `mention`: "Có người gọi ô <cell> trong nhóm (tin <message_id>): … Trả lời đúng nhóm, đúng topic; my_work có mục mention."
   - Không có phiên: mở phiên nền mới cho ô đó bằng Bash, ở thư mục hiện tại:
     `claude --bg --model sonnet -n "Ô <cell> (<người>@<cell>)" "Bạn ngồi ô <cell> của <người>. Việc đầu: phiếu <ticket>. Đọc bằng show_ticket, get_cell <cell>, làm theo đích và lan can của ô."`
     `<người>` là tên người dùng viết thường, không dấu (Sơn thành son). Ô mẫu dùng chung (gửi `@review`, `@build`…) thì `<cell>` là tên trong `work_type`.
   - Nhiều tin cho cùng một ô tới cùng lúc: gom thành một tin nhắn.
4. Sau khi chuyển, in một dòng: đã chuyển tới phiên nào (hay đã mở phiên nào), mã phiếu. Không kể quá trình.

## Nhịp 10 phút (`/loop 10m /tinh-nlh:thap`)

Bù tin sót: gọi `my_work`. Kết quả bắt đầu bằng "Không có việc" thì dừng ngay. Có việc thì với mỗi mục chưa chuyển trong phiên này (so mã phiếu, mã tin), chuyển như mục 3. Mục `you` thì như mục 1.

## Lan can

- Không dán khoá của Tháp vào chat, không đọc file trạng thái của kênh, không in biến môi trường.
- Nút duyệt không đi qua kênh: hộp hỏi quyền của các phiên khác vẫn do người dùng bấm trên máy.
- Không mở quá một phiên mới cho cùng một ô trong 10 phút; phiên vừa mở chưa hiện trong `ListAgents` thì chờ lượt sau rồi gửi lại bằng `SendMessage`.
