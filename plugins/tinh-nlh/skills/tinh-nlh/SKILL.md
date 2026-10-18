---
name: tinh-nlh
description: Cách làm việc trong tỉnh NhiLe (NhiLe Governance, tỉnh NLH). Dùng ở đầu mỗi phiên; khi người dùng nhắc tới việc, phiếu, ô, hộp việc, giao việc, làm tiếp, ký, bảng chung, hay nói "tôi mới vào"; khi người dùng nói dừng, chuyển việc, hay phiên sắp hết; và khi người dùng góp ý, nói vướng, khó dùng hay than phiền về hệ.
---

# Làm việc trong tỉnh NhiLe

Hệ là trung tâm. Plugin này chỉ là cửa mỏng: nó không chứa luật, không chứa ô, không giữ khoá. Mọi thứ đọc từ connector NhiLe Governance sau khi người dùng đăng nhập: lời dặn của server, `how_to_use`, `get_cell`. Lời dặn của server khác với file này thì theo lời dặn của server.

## Đầu phiên

Trước khi làm gì khác:

1. Gọi `my_work`.
2. Tóm tắt bằng lời thường, vài câu ngắn:
   - việc đang chờ người dùng (ký, trả lời, quyết);
   - việc người dùng đã giao đang tới đâu: ai đang giữ, đã có biên nhận chưa, còn chờ gì.
3. Không có gì thì nói một câu "Hôm nay chưa có việc chờ bạn", rồi làm điều người dùng hỏi.

Chưa đăng nhập connector thì chỉ người dùng mở Customize, mục Plugins, plugin Tỉnh NhiLe, tab Connectors, bấm Connect, đăng nhập bằng email công ty. Không bao giờ xin mật khẩu, token hay khoá trong chat.

## Ô là ghế

Ô là một trợ lý làm trọn một việc, người hay máy nào ngồi vào cũng làm được. Trước khi làm việc của một ô, `get_cell` lấy đủ ô đó rồi làm theo đích và lan can của ô.

## Người mới

Người dùng nói mới vào, hay chưa có ô riêng nào: làm theo phần "Người mới vào" trong lời dặn của server (gọi `how_to_use` nếu chưa thấy).

## Bàn giao (luôn làm)

Người dùng nói dừng, nghỉ, chuyển sang việc khác, đổi máy, hay phiên sắp hết: trước khi dừng, tự ghi bàn giao lên đúng phiếu đang làm, không chờ người dùng gõ lệnh. `add_follow_up` kind `handoff`, body bốn ý ngắn: đã làm gì, còn gì, bước tiếp theo, chỗ đang kẹt (nếu có). Đang làm nhiều phiếu thì ghi từng phiếu. Không rõ phiếu nào thì hỏi một câu. Xong báo một câu: đã ghi bàn giao lên phiếu nào.

## Góp ý

Người dùng nói "góp ý", "vướng", "khó dùng", hay than phiền về hệ (về cách làm việc trong tỉnh NhiLe, không phải về nội dung một việc): `open_ticket` cho ô `tech-lead-son`, tiêu đề bắt đầu bằng "Góp ý:" kèm vài chữ tóm, need chép nguyên lời người dùng. Không tự sửa, không tranh luận, không hỏi thêm. Báo lại một câu: đã ghi góp ý, Tech Lead sẽ xem.

## Lệnh

Lệnh chỉ là lối tắt; người dùng nói câu thường cũng được.

- `/tinh-nlh:viec`: việc của tôi hôm nay, gồm việc chờ tôi ký.
- `/tinh-nlh:giao`: giao việc cho một ô.
- `/tinh-nlh:lamtiep`: làm tiếp một việc, ở máy nào cũng được.
- `/tinh-nlh:bangiao`: ghi bàn giao ngay.
- `/tinh-nlh:ky`: phiếu đang chờ người dùng ký.

Trên app Claude và điện thoại, hook đầu phiên không chạy: người dùng gõ `/viec` (hay nói "xem việc của tôi") để xem việc. Không hứa "mở chat là thấy việc".
