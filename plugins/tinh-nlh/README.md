# Plugin tinh-nlh

Cửa vào NhiLe Governance (tỉnh NhiLe) trong Claude. Cài một lần. Trên app Claude và điện thoại, gõ `/viec` để xem việc của mình; ở Claude Code và Cowork, mở phiên mới là Claude tự kể. Cách cài: README ở gốc repo `NLH-GOVERNANCE/claude-plugin`.

Gói gồm:

- connector NhiLe Governance (`https://governance.nlh.vn/mcp`), mỗi người đăng nhập một lần bằng email công ty;
- skill `tinh-nlh`: câu đầu mỗi cuộc trò chuyện gọi `my_context` (bối cảnh của mình: ô, dự án đang dở, việc đang chờ, việc đã giao), tóm tắt bằng lời thường;
- sáu lệnh: `/tinh-nlh:khongluu` (thôi lưu phiên này vào kho chat), `/tinh-nlh:viec` (hộp việc), `/tinh-nlh:giao` (giao việc cho một ô), `/tinh-nlh:lamtiep` (làm tiếp một việc), `/tinh-nlh:bangiao` (ghi bàn giao), `/tinh-nlh:ky` (phiếu chờ ký). Trên app Claude và điện thoại, gõ `/viec`, `/giao`, `/ky` (hay nói "xem việc của tôi", "giao việc", "tôi ký");
- kênh `tower` (chỉ Claude Code, chỉ khi mở bằng `Thap.cmd`): server trên máy đọc việc mới của chính người dùng từ hub mỗi 15 giây bằng khoá riêng có hạn, đẩy vào phiên Tháp hệ thống; skill `thap` dặn phiên đó chuyển việc tới đúng phiên đang ngồi ô. Cách bật: README ở gốc repo, mục "Tháp hệ thống trên máy";
- hook (chỉ chạy ở Claude Code và Cowork): lúc mở phiên in một câu dặn Claude gọi `my_context` trước, kèm mã và tên của phiên; sau `/clear` hay khi gọn ngữ cảnh thì gọi thẳng `my_context` qua connector đã đăng nhập và nạp kết quả vào phiên; cuối mỗi lượt và lúc đóng phiên, Claude Code gọi `report_session` của connector với mã phiên và trạng thái, để Tháp trên máy biết phiên nào đang ngồi ô nào (phiên tự báo). Hook không giữ token, không gửi nội dung chat. Lưu chat: lúc người dùng gửi lời và lúc Claude trả lời xong, Claude Code gọi `save_chat` của connector với đúng lượt đó (không kèm kết quả công cụ); kho chat nằm ngoài sổ, chỉ nhận phiên thật sự dùng tỉnh NhiLe (Claude đã gọi một công cụ của tỉnh, hook PostToolUse báo lại; hay đang ngồi một ô), chủ chat xoá được; hệ che số nhạy và không lưu nguyên văn lượt có khoá hay về tiền, hợp đồng, nhân sự, khách hàng, trẻ em.

Plugin không chứa secret, không chép luật hay ô: mọi thứ đọc từ hệ sau khi đăng nhập. Plugin không tạo việc định kỳ; muốn ô làm việc cả khi không mở Claude thì bật thêm việc định kỳ hay máy dự phòng.

## Dữ liệu

Plugin không lưu gì, trừ kênh `tower`: mốc đọc và mã các việc đã đẩy nằm trong thư mục dữ liệu của plugin trên máy (`tower-state.json`), khoá nằm trong kho bí mật của máy, không trong file. Mọi việc đi qua connector tới `governance.nlh.vn`, dưới tài khoản công ty của chính người dùng.
