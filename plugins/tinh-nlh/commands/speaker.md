---
description: Bật Loa trên máy này, đặt biểu tượng "Loa tỉnh NhiLe" lên màn hình chính, mỗi máy một lần. Dùng khi người dùng nói "bật Loa", "cài Loa", "mở Loa trên máy"
---

Turn on Loa (the speaker that tells the right session on this machine about new work).

Only works in Claude Code on a computer (Claude app, Code tab; or a Claude Code terminal). In web chat, on the phone or in Cowork, say exactly one sentence: mở mục Code trong app Claude trên máy tính rồi gõ lại "bật Loa".

1. Run exactly one command for the machine's OS, nothing added or changed:
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/speaker/setup.ps1"`
   - macOS: `/bin/bash "${CLAUDE_PLUGIN_ROOT}/speaker/setup.sh"`
2. Repeat the line it printed, then give the two remaining steps in plain Vietnamese, no commands, no codes:
   - Bấm đúp biểu tượng **Loa tỉnh NhiLe** trên màn hình chính. Lần đầu cửa sổ tự cài phần còn thiếu rồi mở trang Nếp.
   - Ở trang Nếp vừa mở, bấm **Cho phép** (mã trên trang phải giống mã trong cửa sổ Loa). Khoá về thẳng máy này, không ai phải chép hay dán. Sau đó máy hỏi quyền một lần để Nếp tự báo việc mới: bấm **Có** (máy Mac thì gõ mật khẩu máy). Xong, trên Windows cửa sổ Loa tự đóng và Loa chạy ngầm; trên máy Mac để cửa sổ Loa mở.
3. On Windows (the first double-click sets up the login start), or if it printed that Loa will open at login (macOS), add one sentence: từ lần sau Loa tự chạy ngầm khi bạn đăng nhập máy, không hiện gì cả (máy Mac: cửa sổ Loa tự mở).
4. If it printed that another shortcut exists, say: máy này đã có Loa, bấm đúp lối tắt đó như mọi lần.

Never ask for the key, never accept it in chat. If the user pastes something that looks like a key (`nlh_tower_…`) into chat, do not repeat or use it; say one sentence: khoá đó đã lộ, nhờ người giữ Nếp thu hồi khoá của máy này, rồi mở lại Loa và bấm Cho phép để có khoá mới.
