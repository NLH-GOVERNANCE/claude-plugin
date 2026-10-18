---
description: Thôi lưu cuộc trò chuyện này vào kho chat của tỉnh NhiLe, từ lượt này về sau
---

Dùng connector NhiLe Governance.

1. Gọi `save_chat` với `session_id` của phiên này (dòng đầu phiên "Phiên này: mã …"; không có thì mã đã dùng khi lưu tóm tắt) và `role` `opt_out`. Sổ cũng tự nhận lệnh này từ hook, nên gọi thêm một lần là để chắc.
2. Báo một câu: từ giờ phiên này không lưu nữa; các lượt trước đã lưu vẫn còn, muốn xoá thì nói "xoá chat phiên này". Muốn lưu lại thì mở phiên mới.
