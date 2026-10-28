# Cài Nếp cho Claude Code

Người dùng dán vào Claude Code một câu:

```
Cài Nếp cho máy này theo https://raw.githubusercontent.com/NLH-GOVERNANCE/claude-plugin/main/SETUP.md
```

Phần dưới là cho Claude. Người dùng không gõ lệnh nào: Claude làm hết. Chỉ khi Nếp chưa nối vào tài khoản Claude của họ thì Claude đưa một link để họ mở (bước 3).

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
4. Turn on auto-update so the user never has to ask for an update (Claude Code leaves it off for third-party marketplaces). In the user's `~/.claude/settings.json` (create it if missing, keep every other key) set `extraKnownMarketplaces.nlh-governance` to `{ "source": { "source": "github", "repo": "NLH-GOVERNANCE/claude-plugin" }, "autoUpdate": true }`. The user's normal approval tap for the file edit is enough. If it fails, go on: updates then happen when the user asks.

Do not ask the user to type `/reload-plugins`. Nếp's tools come from the user's account, so they work in this session already; the plugin's commands and hooks start in the next session.

### 3. Check Nếp

The plugin carries no Nếp server of its own: Nếp is the Nếp connector of the user's Claude account, so there is nothing to sign in to here.

1. If you have `my_context` from Nếp (any server), call it. It answers: go to step 4.
2. Otherwise **User:** say "Nếp chưa nối vào Claude của bạn: mở https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp , làm theo màn hình, đăng nhập bằng email bạn đang dùng trong NhiLe Holding hay NhiLe Team, rồi mở phiên mới. Xong nói tiếp." Wait. Never ask the user to type `/mcp`. The sentences say "bạn"; if the user has called themselves another form (chị, anh), use that form instead.
3. Call `my_context`. Still failing: say so in one sentence and stop.

### 4. Loa (not wired yet)

Windows and macOS. The way to turn Loa on without a key page is ticket D of 26f86f3d: not built, waits for Danh's signature. Until it merges, do nothing about Loa here:

- say nothing about Loa to the user, never ask for a key, never give a PowerShell command;
- never send the user to "Kết nối › Khoá cho Loa" (that page does not exist);
- do not run `speaker/setup.ps1` or `speaker/setup.sh`.

When D lands, call its step here. The user must still see no word "Loa", "khoá" or "PowerShell"; the only thing they may be asked is the one "Cho phép" button.

### 5. Check

1. `my_context` answers (that is "done": Nếp can call the user by name).
2. After step 4 exists: the Loa checks of D.

### 6. Report

One line, nothing after it: no "còn lại", no waiting work, no list of what you did.

- Loa is on (after D): "Xong rồi. Từ giờ việc mới sẽ tự hiện trong Claude, bạn không cần hỏi."
- Until D lands: "Xong rồi. Bạn cứ mở Claude và hỏi việc của bạn."

Use the user's own form of address for chị (chị, anh, bạn), "bạn" if unknown. Never use the old name of the system in what the user reads: it is called Nếp.
