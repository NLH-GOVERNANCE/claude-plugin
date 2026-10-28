# Cài Nếp cho Claude Code

Người dùng dán vào Claude Code một câu:

```
Cài Nếp cho máy này theo https://raw.githubusercontent.com/NLH-GOVERNANCE/claude-plugin/main/SETUP.md
```

Phần dưới là cho Claude. Claude làm hết, chỉ dừng hỏi bạn khi cần:

1. **Gõ `/reload-plugins`** rồi Enter, khi Claude cài gói xong. Đúng là: Claude Code in một dòng báo đã nạp lại plugin, không có chữ đỏ.
2. **Mở link thêm Nếp**, chỉ khi máy chưa có Nếp: làm theo màn hình rồi mở phiên mới.
3. **Dán khoá Loa** vào cửa sổ Loa (Windows và Mac), khoá lấy ở web Nếp › Kết nối. Chữ không hiện khi dán là đúng.

---

## For Claude

You are setting up Nếp (NhiLe Holdings' work system) on this machine. Do every step yourself with the shell. Stop and ask the user only where a step says **User**. Talk to the user in short plain Vietnamese, no commands or codes unless the step gives the exact sentence. Never ask for, accept or repeat a key or password in chat.

This only works in Claude Code on a computer. If you are in claude.ai web chat, Cowork or on a phone, say: "Mở Claude Code trên máy tính rồi dán lại câu này." and stop. If this is a Claude Code cloud session (`CLAUDE_CODE_REMOTE` is `true`), say: "Phiên trên mây lấy Nếp từ tài khoản Claude, không cần cài. Chưa có Nếp thì thêm ở https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp" and stop.

### 1. Find the OS

Windows (PowerShell), macOS or Linux. Check `claude --version` works; if not, stop and say Claude Code is not on the PATH.

### 2. Install or update the plugin

Same commands on every OS:

1. `claude plugin marketplace list`. If `nlh-governance` is listed: `claude plugin marketplace update nlh-governance`. Otherwise: `claude plugin marketplace add NLH-GOVERNANCE/claude-plugin`.
2. `claude plugin list`. If `nlh@nlh-governance` is listed: `claude plugin update nlh@nlh-governance`. Otherwise: `claude plugin install nlh@nlh-governance`.
3. If the old name `tinh-nlh@nlh-governance` is listed, leave it: the marketplace moves it to `nlh` by itself.

**User:** say "Gõ đúng /reload-plugins rồi bấm Enter. Đúng là Claude Code in một dòng báo đã nạp lại plugin. Xong nói tiếp." Wait.

### 3. Check Nếp

The plugin carries no Nếp server of its own: Nếp is the Nếp connector of the user's Claude account, so there is nothing to sign in to here.

1. If you have `my_context` from Nếp (any server), call it. It answers: go to step 4.
2. Otherwise **User:** say "Nếp chưa nối vào Claude của bạn: mở https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp , làm theo màn hình, rồi mở phiên mới. Xong nói tiếp." Wait. Never ask the user to type `/mcp`.
3. Call `my_context`. Still failing: say so in one sentence and stop.

### 4. Turn on Loa and put its icon on the desktop

Windows and macOS only. On Linux skip to step 5 and say Loa only runs on Windows and Mac.

1. Find the plugin folder: the `nlh` entry of `claude plugin list` (or the newest `~/.claude/plugins/cache/nlh-governance/nlh/<version>`). Call it `<plugin>`.
2. Run exactly one command:
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/speaker/setup.ps1"`
   - macOS: `/bin/bash "<plugin>/speaker/setup.sh"`

   It copies Loa to `~/.tinh-nlh/speaker`, puts the icon **Loa tỉnh NhiLe** on the desktop and opens Loa at login. If it says another shortcut of that name exists, keep it.
3. **User:** say, in these words:
   - "Mở web Nếp, mục **Kết nối**, thẻ **Khoá cho Loa trên máy**, bấm **Tạo khoá mới**, chép khoá."
   - "Bấm đúp biểu tượng **Loa tỉnh NhiLe** trên màn hình chính, dán khoá khi cửa sổ hỏi (chữ không hiện ra), bấm Enter. Lần đầu cửa sổ tự cài phần còn thiếu và mở trình duyệt để đăng nhập Claude. Mỗi lần mở, chọn dòng **I am using this for local development**. Dòng vàng 'no MCP server configured with that name' là Claude Code báo nhầm, Loa vẫn nối: bỏ qua. Để cửa sổ Loa mở."
   - "Xong nói tiếp, hay nói bỏ qua Loa."

   Wait. If the user pastes something like `nlh_tower_…` into chat, do not repeat or use it; say: "Khoá đó đã lộ: thu hồi ở web (Kết nối, Khoá cho Loa trên máy), tạo khoá mới, dán vào cửa sổ Loa."

### 5. Check

1. `claude mcp list`: `plugin:nlh:speaker` is listed.
2. `my_context` answers.
3. Windows or macOS with Loa: the icon file exists (`Loa tỉnh NhiLe.lnk` on the Windows desktop, `Loa tỉnh NhiLe.command` on the macOS desktop).

### 6. Report

One line in Vietnamese, for example: "Xong: có Nếp (đăng nhập là <tên>), Loa đã bật trên máy này." Name anything that is not done and the one step left for the user. Then, from the `my_context` result, tell the user what is waiting for them.
