# Plugin tinh-nlh

Cửa vào NhiLe Governance (tỉnh NhiLe) trong Claude. Cài một lần, mở Claude là thấy việc của mình. Cách cài: README ở gốc repo `NLH-GOVERNANCE/claude-plugin`.

Gói gồm:

- connector NhiLe Governance (`https://governance.nlh.vn/mcp`), mỗi người đăng nhập một lần bằng email công ty;
- skill `tinh-nlh`: đầu phiên gọi `my_work`, tóm tắt việc đang chờ và việc mình đã giao;
- ba lệnh: `/tinh-nlh:viec` (hộp việc), `/tinh-nlh:giao` (giao việc cho một ô), `/tinh-nlh:ky` (phiếu chờ ký). Trong chat trên web hay điện thoại, lệnh nạp như skill: nói "xem việc của tôi", "giao việc", "tôi ký" là đủ;
- hook đầu phiên (chỉ chạy ở Claude Code và Cowork): in một câu dặn Claude gọi `my_work` trước. Hook không gọi mạng, không giữ token.

Plugin không chứa secret, không chép luật hay ô: mọi thứ đọc từ hệ sau khi đăng nhập. Plugin không tạo việc định kỳ; muốn ô làm việc cả khi không mở Claude thì bật thêm việc định kỳ hay máy dự phòng.

## Dữ liệu

Plugin không lưu gì. Mọi việc đi qua connector tới `governance.nlh.vn`, dưới tài khoản công ty của chính người dùng.
