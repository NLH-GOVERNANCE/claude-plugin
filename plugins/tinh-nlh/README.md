# Plugin tinh-nlh

Cửa vào NhiLe Governance (tỉnh NhiLe) trong Claude. Cài một lần. Trên app Claude và điện thoại, gõ `/viec` để xem việc của mình; ở Claude Code và Cowork, mở phiên mới là Claude tự kể. Cách cài: README ở gốc repo `NLH-GOVERNANCE/claude-plugin`.

Gói gồm:

- connector NhiLe Governance (`https://governance.nlh.vn/mcp`), mỗi người đăng nhập một lần bằng email công ty;
- skill `tinh-nlh`: câu đầu mỗi cuộc trò chuyện gọi `my_context` (bối cảnh của mình: ô, dự án đang dở, việc đang chờ, việc đã giao), tóm tắt bằng lời thường;
- bảy lệnh: `/tinh-nlh:batthap` (bật Tháp trên máy này: biểu tượng "Tháp tỉnh NhiLe" trên màn hình chính), `/tinh-nlh:khongluu` (thôi lưu phiên này vào kho chat), `/tinh-nlh:viec` (hộp việc), `/tinh-nlh:giao` (giao việc cho một ô), `/tinh-nlh:lamtiep` (làm tiếp một việc), `/tinh-nlh:bangiao` (ghi bàn giao), `/tinh-nlh:ky` (phiếu chờ ký). Trên app Claude và điện thoại, gõ `/viec`, `/giao`, `/ky` (hay nói "xem việc của tôi", "giao việc", "tôi ký");
- kênh `tower` và lối mở Tháp (`tower/`, Windows và macOS; chỉ Claude Code, chỉ khi mở bằng biểu tượng Tháp): server trên máy đọc việc mới của chính người dùng từ hub mỗi 15 giây bằng khoá riêng có hạn, đẩy vào phiên Tháp hệ thống; skill `thap` dặn phiên đó chuyển việc tới đúng phiên đang ngồi ô. Cách bật: README ở gốc repo, mục "Bật Tháp trên máy";
- hook (chỉ chạy ở Claude Code và Cowork): lúc mở phiên in một câu dặn Claude gọi `my_context` trước, kèm mã và tên của phiên; sau `/clear` hay khi gọn ngữ cảnh thì gọi thẳng `my_context` qua connector đã đăng nhập và nạp kết quả vào phiên; cuối mỗi lượt và lúc đóng phiên, Claude Code gọi `report_session` của connector với mã phiên và trạng thái, để Tháp trên máy biết phiên nào đang ngồi ô nào (phiên tự báo). Hook không giữ token, không gửi nội dung chat. Lưu chat: lúc người dùng gửi lời và lúc Claude trả lời xong, Claude Code gọi `save_chat` của connector với đúng lượt đó (không kèm kết quả công cụ); kho chat nằm ngoài sổ, chỉ nhận phiên thật sự dùng tỉnh NhiLe (Claude đã gọi một công cụ của tỉnh ngoài `my_context` đầu phiên, hook PostToolUse báo lại; hay đang ngồi một ô), lưu lâu dài; số điện thoại, email, số giấy tờ, địa chỉ được mã hoá; lượt có khoá hay về tiền, hợp đồng, nhân sự, khách hàng, trẻ em không lưu nguyên văn; không có nút xoá, chỉ xoá mềm.

Plugin không chứa secret, không chép luật hay ô: mọi thứ đọc từ hệ sau khi đăng nhập. Plugin không tạo việc định kỳ; muốn ô làm việc cả khi không mở Claude thì bật thêm việc định kỳ hay máy dự phòng.

## Dữ liệu

Plugin không lưu gì, trừ Tháp: bản chép của lối mở, mốc đọc và mã các việc đã đẩy (`tower-state.json`) nằm ở `~/.tinh-nlh/thap` trên máy; khoá mã hoá bằng DPAPI (Windows) hay nằm trong Keychain (macOS), chỉ tài khoản đó trên máy đó mở được. Mọi việc đi qua connector tới `governance.nlh.vn`, dưới tài khoản công ty của chính người dùng.
