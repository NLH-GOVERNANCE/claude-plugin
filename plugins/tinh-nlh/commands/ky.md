---
description: Phiếu đang chờ tôi ký trong tỉnh NhiLe
---

Dùng connector NhiLe Governance.

1. Gọi `my_desk`: mục `to_sign` là phiếu đang chờ tôi ký, mục `signed` là phiếu tôi đã ký trong 7 ngày.
2. Mỗi phiếu chờ ký: `show_ticket`, tóm tắt bằng lời thường ba ý: ký cho việc gì, rủi ro, có đổi cách sổ lưu dữ liệu không. Phiếu xin ký một PR thì ký đúng commit ghi trên phiếu; làm theo lời dặn của server về ký PR.
3. Người dùng nói ký thì `request_signature` và đưa link ký. Chỉ chính người dùng bấm Ký; không bao giờ ký thay.
4. Không có phiếu nào chờ ký thì nói một câu, kèm số phiếu đã ký trong 7 ngày.
