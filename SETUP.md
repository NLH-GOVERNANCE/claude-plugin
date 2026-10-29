# Cài Nếp cho Claude Code

Người dùng dán vào Claude Code một câu:

```
Cài Nếp cho máy này theo https://raw.githubusercontent.com/NLH-GOVERNANCE/claude-plugin/main/SETUP.md
```

Phần dưới là cho Claude. Người dùng không gõ lệnh nào: Claude làm hết. Chỉ khi Nếp chưa nối vào tài khoản Claude của họ thì Claude đưa một link để họ mở (bước 3).

---

## For Claude

You are setting up Nếp (NhiLe Holdings' work system) on this machine. Do every step yourself with the shell. Stop and ask the user only where a step says **User**. Talk to the user in short plain Vietnamese, no commands or codes unless the step gives the exact sentence. Never ask for, accept or repeat a key or password in chat.

This only works in Claude Code on a computer. If you are in claude.ai web chat, Cowork or on a phone, say: "Mở app Claude trên máy tính, vào mục Code, rồi dán lại câu này." and stop. If this is a Claude Code cloud session (`CLAUDE_CODE_REMOTE` is `true`), say: "Phiên trên mây lấy Nếp từ tài khoản Claude, không cần cài. Chưa có Nếp thì thêm ở https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp" and stop.

### 1. Find the OS

Windows (PowerShell), macOS or Linux. Find the `claude` program once and use it, by its full path when it is not on the PATH, wherever the steps below say `claude`:

1. `claude --version` works: use `claude`.
2. Otherwise the program that runs this very session: the environment variable `CLAUDE_CODE_EXECPATH` holds its full path (a machine with only the Claude app is the usual case, and the program is inside the app).
3. Otherwise look for the one bundled with the Claude app: Windows `%LOCALAPPDATA%\Claude-Data\*\claude-code\*\*\claude.exe` or `%APPDATA%\Claude\claude-code\*\claude.exe`; macOS `~/Library/Application Support/Claude/claude-code/*/claude` (not tried on macOS). Take the newest version.
4. Found none: say "Máy này chưa sẵn sàng để cài Nếp: mở app Claude, vào mục Code một lần, rồi dán lại câu này." and stop.

This is internal: the user never hears about the PATH, the claude command, Claude Code or a step number.

### 2. Install or update the plugin

Same commands on every OS:

1. `claude plugin marketplace list`. If `nlh-governance` is listed: `claude plugin marketplace update nlh-governance`. Otherwise: `claude plugin marketplace add NLH-GOVERNANCE/claude-plugin`.
2. `claude plugin list`. If `nlh@nlh-governance` is listed: `claude plugin update nlh@nlh-governance`. Otherwise: `claude plugin install nlh@nlh-governance`.
3. If the old name `tinh-nlh@nlh-governance` is listed, leave it: the marketplace moves it to `nlh` by itself.
4. Turn on auto-update so the user never has to ask for an update (Claude Code leaves it off for third-party marketplaces). First tell the user in one sentence: "Em bật cho Nếp tự cập nhật nha." Then read the user's `~/.claude/settings.json` first. Missing: create it holding only the key below. Present but you cannot parse it as JSON: skip this step, say nothing about it, and never rewrite or overwrite the file. Otherwise add only `extraKnownMarketplaces.nlh-governance` set to `{ "source": { "source": "github", "repo": "NLH-GOVERNANCE/claude-plugin" }, "autoUpdate": true }` and keep every other key exactly as it was. The user's normal approval tap for the file edit is enough. If anything fails, go on: updates then happen when the user asks.

Do not ask the user to type `/reload-plugins`. Nếp's tools come from the user's account, so they work in this session already; the plugin's commands and hooks start only after Claude is quit completely (the Claude icon at the bottom right, Thoát or Exit) and opened again; a new conversation is not enough in the Claude app.

### 3. Check Nếp

The plugin carries no Nếp server of its own: Nếp is the Nếp connector of the user's Claude account, so there is nothing to sign in to here.

1. If you have `my_context` from Nếp (any server), call it. It answers: go to step 4.
2. Otherwise **User:** say "Nếp chưa nối vào Claude của bạn: mở https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp , làm theo màn hình, đăng nhập bằng email bạn đang dùng trong NhiLe Holding hay NhiLe Team, rồi mở phiên mới. Xong nói tiếp." Wait. Never ask the user to type `/mcp`. The sentences say "bạn"; if the user has called themselves another form (chị, anh), use that form instead.
3. Call `my_context`. Still failing: say so in one sentence and stop.

### 4. Loa (Windows and macOS)

Item D of 26f86f3d: no key to copy or paste; the machine asks for its own key and the user presses one "Cho phép" button. Skip to step 5 on any other system, and in web chat, on the phone or in Cowork (no machine to set up).

1. Run the plugin command `speaker` (`/nlh:speaker`, file `commands/speaker.md`) exactly as it says: it runs `speaker/setup.ps1` or `speaker/setup.sh` and puts the icon on the desktop.
2. **User:** say "Có một biểu tượng mới trên màn hình chính của bạn. Bấm đúp vào nó, rồi bấm Cho phép ở trang Nếp vừa mở. Xong nói tiếp." Wait.
3. The user sees no word "khoá" or "PowerShell", no command; never ask for or accept a key in chat. The only thing they are asked is the one "Cho phép" button.

### 5. Check

1. `my_context` answers (that is "done": Nếp can call the user by name).
2. Loa: the key file exists, nothing more (never read it): Windows, `~\.tinh-nlh\speaker\tower-key.dpapi`; macOS, `security find-generic-password -s tinh-nlh-tower -a tinh-nlh` answers without `-w`.

### 6. Report

One line, nothing after it: no "còn lại", no waiting work, no list of what you did.

- Loa is on: "Xong rồi. Từ giờ việc mới sẽ tự hiện trong Claude, bạn không cần hỏi."
- Loa is not on (other system, no machine, or not pressed yet): "Xong rồi. Bạn cứ mở Claude và hỏi việc của bạn."

Use the user's own form of address for chị (chị, anh, bạn), "bạn" if unknown. Never use the old name of the system in what the user reads: it is called Nếp.
