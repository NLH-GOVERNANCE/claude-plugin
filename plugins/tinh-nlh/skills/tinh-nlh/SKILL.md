---
name: tinh-nlh
description: Cách làm việc trong tỉnh NhiLe (NhiLe Governance, tỉnh NLH). Dùng ở câu đầu mỗi cuộc trò chuyện, kể cả trên web và điện thoại, để nạp bối cảnh của người dùng; khi người dùng hỏi "tôi đang làm gì dở", "tới đâu rồi"; khi người dùng nhắc tới việc, phiếu, ô, hộp việc, giao việc, làm tiếp, ký, bảng chung, hay nói "tôi mới vào"; khi người dùng nói dừng, chuyển việc, hay phiên sắp hết; và khi người dùng góp ý, nói vướng, khó dùng hay than phiền về hệ.
---

# Làm việc trong tỉnh NhiLe

Hệ là trung tâm. Plugin này chỉ là cửa mỏng: nó không chứa luật, không chứa ô, không giữ khoá. Mọi thứ đọc từ connector NhiLe Governance sau khi người dùng đăng nhập: lời dặn của server, `how_to_use`, `get_cell`. Lời dặn của server khác với file này thì theo lời dặn của server.

## Đầu phiên

Trước khi làm gì khác:

1. Gọi `my_context` một lần: người dùng là ai, ô của họ, dự án đang dở kèm dòng sổ tay mới nhất, việc đang chờ, việc đã giao, mục lục quyết định đã ký. Ở Claude Code và Cowork, hook đầu phiên đã nạp sẵn kết quả này sau `/clear` hay khi gọn ngữ cảnh: có rồi thì không gọi lại. Connector chưa có `my_context` (hub bản cũ) thì gọi `my_work` thay.
2. Tóm tắt bằng lời thường, vài câu ngắn:
   - việc đang chờ người dùng (ký, trả lời, quyết);
   - việc người dùng đã giao đang tới đâu: ai đang giữ, đã có biên nhận chưa, còn chờ gì.
3. Không có gì thì nói một câu "Hôm nay chưa có việc chờ bạn", rồi làm điều người dùng hỏi.

Người dùng hỏi "tôi đang làm gì dở", "tới đâu rồi": trả lời ngay từ bối cảnh đó, ba dòng (chờ bạn, đang chạy, lần trước dừng ở đâu), không hỏi lại, không tra thêm. Cần chi tiết mới mở: `show_ticket` cho một phiếu, `get_cell` với `path` cho một file của ô, `continue_work` cho sổ tay dài hơn.

Bối cảnh chỉ có dữ liệu loại 1–2 theo bảng mức nhạy Danh đã ký. Claude đăng nhập bằng tài khoản cá nhân thì không mở hay chép vào cuộc trò chuyện dữ liệu loại 3–4 (tài chính, hợp đồng, nhân sự, tin nhóm, bộ não từng người, tên học viên, khách, trẻ em).

Chưa đăng nhập connector thì chỉ người dùng mở Customize, mục Plugins, plugin Tỉnh NhiLe, tab Connectors, bấm Connect, đăng nhập bằng email công ty. Không bao giờ xin mật khẩu, token hay khoá trong chat.

## Ô là ghế

Ô là một trợ lý làm trọn một việc, người hay máy nào ngồi vào cũng làm được. Trước khi làm việc của một ô, `get_cell` lấy đủ ô đó rồi làm theo đích và lan can của ô.

## Báo phiên (khi ngồi ô)

Nhận ngồi một ô, hay đổi sang phiếu khác: gọi `report_session` với `session_id`, `session_name`, `cell`, `ticket_id`, để Tháp trên máy chuyển việc của ô đó tới đúng phiên này. Mã và tên phiên lấy từ dòng đầu phiên "Phiên này: mã …, tên …". Không có dòng đó (app Claude trên web, điện thoại): tự đặt một mã ngắn giữ suốt phiên, tên dạng "Ô CTO (son@cto)". Thôi ngồi ô thì báo `status` `stopped`. Không báo nội dung chat.

## Lưu chat

Ở Claude Code và Cowork, hook của plugin tự gửi từng lượt (lời người dùng, câu trả lời của Claude) về kho chat của công ty; không gửi kết quả công cụ. Kho chỉ nhận chat của phiên thật sự dùng tỉnh NhiLe (đã gọi một công cụ của tỉnh ngoài `my_context` đầu phiên, hay đang ngồi một ô), và lưu lâu dài vì là dữ liệu công ty. Số điện thoại, email, số giấy tờ, tài khoản, địa chỉ được mã hoá; lượt có khoá, token hay nói về tiền, hợp đồng, nhân sự, khách hàng, trẻ em không lưu nguyên văn (Danh ký). Chỉ chính người dùng đọc lại. Không có nút xoá chat. Ai muốn hệ thôi hiện thông tin cá nhân của mình thì nhờ Danh ghi yêu cầu xoá mềm; phần ẩn đi chưa chạy, nên không hứa với người dùng là đã ẩn. Xong một việc thì gọi `save_chat` với `role` `summary`: vài câu đã làm gì, kết quả, còn gì. Ở app Claude trên web và điện thoại (không có hook) thì chỉ lưu bản tóm tắt đó. Người dùng gõ `/khongluu` thì cả phiên thôi lưu.

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

Trên app Claude và điện thoại, hook đầu phiên không chạy: skill này dặn gọi `my_context` ở câu đầu; người dùng cũng gõ `/viec` (hay nói "xem việc của tôi") được. Không hứa "mở chat là thấy việc".
