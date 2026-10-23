---
description: Bật Loa trên máy này, đặt biểu tượng "Loa tỉnh NhiLe" lên màn hình chính, mỗi máy một lần. Dùng khi người dùng nói "bật Loa", "cài Loa", "mở Loa trên máy"
---

Turn on Loa (the speaker that tells the right session on this machine about new work).

Only works in Claude Code on a computer (Claude app, Code tab; or a Claude Code terminal). In web chat, on the phone or in Cowork, say exactly one sentence: mở mục Code trong app Claude trên máy tính rồi gõ lại "bật Loa".

1. Run exactly one command for the machine's OS, nothing added or changed:
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/speaker/setup.ps1"`
   - macOS: `/bin/bash "${CLAUDE_PLUGIN_ROOT}/speaker/setup.sh"`
2. Repeat the line it printed, then give the two remaining steps in plain Vietnamese, no commands, no codes:
   - Ở web Nếp, mở **Kết nối**, thẻ **Khoá cho Loa trên máy**, bấm **Tạo khoá mới**, chép khoá.
   - Bấm đúp biểu tượng **Loa tỉnh NhiLe** trên màn hình chính, dán khoá khi cửa sổ hỏi (chữ không hiện ra), bấm Enter. Lần đầu cửa sổ tự cài phần còn thiếu và mở trình duyệt để đăng nhập Claude. Đừng đóng cửa sổ Loa.
3. If it printed that Loa will open at login, add one sentence: từ lần sau Loa tự mở khi bạn đăng nhập máy, chỉ cần chọn dòng "I am using this for local development" khi cửa sổ hỏi.
4. If it printed that another shortcut exists, say: máy này đã có Loa, bấm đúp lối tắt đó như mọi lần.

Never ask for the key, never accept it in chat. If the user pastes something that looks like a key (`nlh_tower_…`) into chat, do not repeat or use it; say one sentence: khoá đó đã lộ, thu hồi ở web (**Kết nối**, **Khoá cho Loa trên máy**), tạo khoá mới, dán vào cửa sổ Loa.
