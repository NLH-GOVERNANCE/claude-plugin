# Plugin tinh-nlh

Cửa vào NhiLe Governance (tỉnh NhiLe) trong Claude. Cài một lần. Trên app Claude và điện thoại, gõ `/viec` để xem việc của mình; ở Claude Code và Cowork, mở phiên mới là Claude tự kể. Cách cài: README ở gốc repo `NLH-GOVERNANCE/claude-plugin`.

Gói gồm:

- connector NhiLe Governance (`https://governance.nlh.vn/mcp`), mỗi người đăng nhập một lần bằng email công ty;
- skill `tinh-nlh`: đầu phiên gọi `my_work`, tóm tắt việc đang chờ và việc mình đã giao;
- năm lệnh: `/tinh-nlh:viec` (hộp việc), `/tinh-nlh:giao` (giao việc cho một ô), `/tinh-nlh:lamtiep` (làm tiếp một việc), `/tinh-nlh:bangiao` (ghi bàn giao), `/tinh-nlh:ky` (phiếu chờ ký). Trên app Claude và điện thoại, gõ `/viec`, `/giao`, `/ky` (hay nói "xem việc của tôi", "giao việc", "tôi ký");
- kênh `tower` (chỉ Claude Code, chỉ khi mở bằng `Thap.cmd`): server trên máy đọc việc mới của chính người dùng từ hub mỗi 15 giây bằng khoá riêng có hạn, đẩy vào phiên Tháp hệ thống; skill `thap` dặn phiên đó chuyển việc tới đúng phiên đang ngồi ô. Cách bật: README ở gốc repo, mục "Tháp hệ thống trên máy";
- hook (chỉ chạy ở Claude Code và Cowork): đầu phiên in một câu dặn Claude gọi `my_work` trước, kèm mã và tên của phiên; cuối mỗi lượt và lúc đóng phiên, Claude Code gọi `report_session` của connector với mã phiên và trạng thái, để Tháp trên máy biết phiên nào đang ngồi ô nào (phiên tự báo). Hook không giữ token, không gửi nội dung chat.

Plugin không chứa secret, không chép luật hay ô: mọi thứ đọc từ hệ sau khi đăng nhập. Plugin không tạo việc định kỳ; muốn ô làm việc cả khi không mở Claude thì bật thêm việc định kỳ hay máy dự phòng.

## Dữ liệu

Plugin không lưu gì, trừ kênh `tower`: mốc đọc và mã các việc đã đẩy nằm trong thư mục dữ liệu của plugin trên máy (`tower-state.json`), khoá nằm trong kho bí mật của máy, không trong file. Mọi việc đi qua connector tới `governance.nlh.vn`, dưới tài khoản công ty của chính người dùng.
