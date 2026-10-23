---
description: Bật Loa Làng trên máy này hay xem Loa Làng chạy chưa; Loa Làng tự chạy cùng Nếp, không cần cài thêm. Dùng khi người dùng nói "bật Loa", "cài Loa", "mở Loa trên máy", "Loa chạy chưa"
---

Turn on Loa Làng, or say whether it runs (the speaker that tells the right session on this machine about new work). Loa Làng starts by itself with the plugin, in the background, on Windows and macOS: nothing to install, no icon, no window.

Only works in Claude Code on a computer (Claude app, Code tab; or a Claude Code terminal). In web chat, on the phone or in Cowork, say exactly one sentence: mở mục Code trong app Claude trên máy tính rồi gõ lại "bật Loa".

1. Run exactly one command, nothing added or changed: `node "${CLAUDE_PLUGIN_ROOT}/speaker/loa.mjs" ensure`. It opens Loa Làng if there is a key and none runs, and prints one line.
2. Repeat that line in plain Vietnamese. No commands, no codes, no ids. If it says there is no key, that line already gives the way; add nothing.

Old machines: only when the user asks for the old desktop icon "Loa tỉnh NhiLe" (a window that stays open), run the one command for the machine's OS instead, then repeat the line it printed and tell the user to double-click the icon and paste the key into the window when it asks (the text does not show, that is normal):

- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/speaker/setup.ps1"`
- macOS: `/bin/bash "${CLAUDE_PLUGIN_ROOT}/speaker/setup.sh"`

Never ask for the key, never accept it in chat. If the user pastes something that looks like a key (`nlh_tower_…`) into chat, do not repeat or use it; say one sentence: khoá đó đã lộ, thu hồi ở web (**Kết nối**, **Khoá cho Loa trên máy**), tạo khoá mới, dán vào ô **Khoá cho Loa** trong cài đặt plugin Nếp.
