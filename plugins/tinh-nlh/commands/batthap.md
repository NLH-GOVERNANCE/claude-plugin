---
description: Bật Tháp trên máy này - tạo biểu tượng "Tháp tỉnh NhiLe" trên màn hình chính, một lần mỗi máy. Dùng khi người dùng nói "bật Tháp", "cài Tháp", "mở Tháp trên máy"
---

Bật Tháp hệ thống trên máy của người dùng.

Chỉ làm được ở Claude Code chạy trên máy tính (app Claude, mục Code; hay cửa sổ Claude Code). Ở chat trên web, điện thoại hay Cowork thì nói đúng một câu: mở mục Code trong app Claude trên máy tính rồi gõ lại "bật Tháp".

1. Chạy đúng một lệnh theo hệ điều hành của máy, không thêm, không sửa:
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/tower/setup.ps1"`
   - macOS: `/bin/bash "${CLAUDE_PLUGIN_ROOT}/tower/setup.sh"`
2. Kể lại dòng lệnh in ra, rồi nói hai bước còn lại bằng lời thường, không lệnh, không mã:
   - Ở web tỉnh NhiLe, mở **Kết nối**, thẻ **Khoá cho Tháp trên máy**, bấm **Tạo khoá mới**, chép khoá.
   - Bấm đúp biểu tượng **Tháp tỉnh NhiLe** trên màn hình chính, dán khoá khi cửa sổ hỏi (chữ không hiện ra), bấm Enter. Lần đầu cửa sổ tự cài phần còn thiếu và mở trình duyệt để đăng nhập Claude. Đừng đóng cửa sổ Tháp.
3. Lệnh in "đã có lối tắt … khác" thì nói: máy này đã có Tháp, bấm đúp lối tắt đó như mọi lần.

Không hỏi khoá, không nhận khoá trong chat. Người dùng dán một chuỗi giống khoá (`nlh_tower_…`) vào chat thì không lặp lại, không dùng; nhắc một câu: khoá đó đã lộ, thu hồi ở web (**Kết nối**, **Khoá cho Tháp trên máy**), tạo khoá mới, dán vào cửa sổ Tháp.
