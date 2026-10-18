---
name: tinh-nlh
description: Cách làm việc trong tỉnh NhiLe (NhiLe Governance, tỉnh NLH). Dùng ở đầu mỗi phiên, và khi người dùng nhắc tới việc, phiếu, ô, hộp việc, giao việc, ký, bảng chung, hay nói "tôi mới vào".
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

## Lệnh

- `/tinh-nlh:viec`: hộp việc.
- `/tinh-nlh:giao`: giao việc cho một ô.
- `/tinh-nlh:ky`: phiếu đang chờ người dùng ký.

Trong chat trên web hay điện thoại, người dùng chỉ cần nói "xem việc của tôi", "giao việc", "tôi ký" là đủ.
