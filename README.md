# claude-plugin

Plugin của tỉnh NhiLe (NhiLe Governance) cho Claude. Repo riêng tư, chỉ chứa plugin, để người được mời đọc được plugin mà không đọc được code của hệ.

- `.claude-plugin/marketplace.json`: danh mục, liệt kê plugin `tinh-nlh`.
- `plugins/tinh-nlh/`: plugin. Nội dung xem [README của plugin](plugins/tinh-nlh/README.md).
- `scripts/plugin-zip.mjs`: đóng plugin thành file .zip.

## Cài cho mỗi người (tài khoản Claude cá nhân)

1. Nhận lời mời GitHub trong email và bấm chấp nhận. Chưa có tài khoản GitHub thì tạo một tài khoản, rồi báo anh Sơn mời.
2. Trong Claude (claude.ai hoặc ứng dụng Claude), vào [Customize > Plugins](https://claude.ai/customize/plugins), bấm **Add**, rồi **Add marketplace**, gõ `NLH-GOVERNANCE/claude-plugin`. Được hỏi thì bấm **Connect GitHub** và cho Claude GitHub App đọc repo này.
3. Cài plugin **Tỉnh NhiLe** (`tinh-nlh`). Mở tab **Connectors** của plugin, bấm **Add** rồi **Connect**, bấm **Đồng ý và đăng nhập** bằng email công ty. Chỉ đăng nhập một lần.

Xong thì xem việc của mình:

- Trên app Claude (web, máy tính) và điện thoại: gõ `/work`.
- Ở Claude Code và Cowork: mở phiên mới là Claude tự nạp bối cảnh của bạn (ô, dự án đang dở, việc đang chờ) và kể việc đang chờ (hook đầu phiên chỉ chạy ở hai nơi này).
- Ở đâu cũng hỏi được "tôi đang làm gì dở": Claude trả lời ngay, không phải hỏi lại.

Telegram là tuỳ chọn, chỉ để ký ngay trong nhóm. Plugin tự cập nhật theo repo (bấm **Check for updates**, hoặc bật **Sync automatically**). Plugin cũng tự có trong Claude Code ở phiên sau, cùng tài khoản.

### Làm việc trong Claude

Nói với Claude bằng câu thường; lệnh có gạch chéo chỉ là lối tắt.

- "Việc của tôi hôm nay?" (gồm việc chờ tôi ký) · `/work`
- "Giao cho chị Thùy: …, xong khi …" · `/assign`
- "Làm tiếp việc …", ở máy nào cũng được · `/tinh-nlh:resume`
- "Tôi dừng đây": Claude tự ghi bàn giao lên phiếu · `/handoff`
- "Góp ý: …" khi vướng hay khó dùng, Claude ghi lại cho Tech Lead
- Xem tình hình trên Telegram hay governance.nlh.vn/app

### Claude Code

```
/plugin marketplace add NLH-GOVERNANCE/claude-plugin
/plugin install tinh-nlh@nlh-governance
```

### Bật Tháp trên máy (Windows và Mac)

Tháp ngồi trên máy của bạn, đưa việc mới tới đúng chỗ trong khoảng 15 giây. Mỗi máy làm một lần, ba bước:

1. Cài app Claude cho máy tính ở [claude.ai/download](https://claude.ai/download) và plugin Tỉnh NhiLe như mục trên; máy đã có thì bỏ qua.
2. Trong app Claude, mở mục **Code**, gõ **bật Tháp**, bấm cho phép khi được hỏi: biểu tượng **Tháp tỉnh NhiLe** hiện trên màn hình chính.
3. Ở web tỉnh NhiLe, mở **Kết nối**, thẻ **Khoá cho Tháp trên máy**, bấm **Tạo khoá mới** và chép khoá, rồi bấm đúp biểu tượng Tháp, dán khoá khi cửa sổ hỏi và bấm Enter.

Khi dán, chữ không hiện ra: đó là bình thường. Lần đầu, cửa sổ Tháp tự cài phần còn thiếu trong một hai phút, rồi mở trình duyệt để bạn đăng nhập Claude. Mỗi lần mở, cửa sổ hỏi một câu tiếng Anh: chọn dòng **I am using this for local development**, bấm Enter. Tháp nhắc đăng nhập tỉnh NhiLe thì làm đúng câu Tháp nhắc, một lần. Để cửa sổ mở là Tháp làm việc; đóng cửa sổ là tắt. Không dán khoá vào chat.

#### Cho người bảo trì

- Lệnh `/tinh-nlh:batthap` chạy `tower/setup.ps1` (Windows) hay `tower/setup.sh` (macOS): chép Tháp sang `~/.tinh-nlh/thap` và tạo lối tắt trên Desktop. Đã có lối tắt cùng tên trỏ chỗ khác thì giữ nguyên.
- Lối tắt mở `tower/thap.ps1` hay `tower/thap.sh`: lấy bản mới nhất của Tháp từ plugin đã cài, tự cài Claude Code (`claude.ai/install.ps1`, `install.sh`) và Node (`nodejs.org`, kiểm SHA-256) khi thiếu, hỏi khoá trong ô nhập ẩn chữ, lưu bằng DPAPI (Windows) hay Keychain (macOS), rồi mở Claude Code chạy Sonnet ở `~/TinhNhiLe`.
- Kênh `tower` nạp qua `--mcp-config` với `--dangerously-load-development-channels server:tower`, không qua tên plugin: plugin cài từ claude.ai mang tên `tinh-nlh@synced`, Claude Code chỉ nhận kênh của plugin cài từ chợ. `NLH_TOWER=1` chỉ nằm trong cấu hình kênh, nên các phiên khác trên máy không đọc luồng việc.
- Cờ `--dangerously-load-development-channels`: kênh tự làm chưa nằm trong danh sách kênh Anthropic duyệt sẵn (research preview), nên Claude Code chỉ nạp khi mình nói rõ đang thử, hỏi lại mỗi lần mở. Vì sao an toàn: kênh do repo này viết, chỉ đọc việc của chính bạn bằng khoá có hạn, chỉ gửi khoá tới `*.nlh.vn`; không có công cụ trả lời, không nhận duyệt quyền từ xa; luật của tổ chức (`channelsEnabled`) vẫn áp dụng.
- Lần đầu, connector `plugin:tinh-nlh:nhile-governance` trong cửa sổ Tháp có thể cần đăng nhập: `/mcp`, chọn nó, **Authenticate**. Chưa đăng nhập thì Tháp vẫn chuyển việc của kênh, chỉ chưa đọc được tên gọi của các ô.
- `Thap.cmd` và `scripts/tower-*.ps1` ở gốc repo là đường cũ cho máy đã clone repo (dùng kênh của plugin `tinh-nlh@nlh-governance`). Một máy chỉ chạy một Tháp.

### Khi có tổ chức Team hoặc Enterprise

Chưa dùng. Owner đồng bộ repo này ở [Organization settings > Plugins & skills](https://claude.ai/admin-settings/skills?tab=inventory) (**Add**, **Sync from GitHub**), đặt `tinh-nlh` là **Required**, và thêm connector `https://governance.nlh.vn/mcp` ở [Organization settings > Connectors](https://claude.ai/admin-settings/connectors). Khi đó từng người không cần tài khoản GitHub.

## File .zip (cho người bảo trì, để thử)

```
node scripts/plugin-zip.mjs tinh-nlh.zip
```

Ở [Customize > Plugins](https://claude.ai/customize/plugins): **Add**, **Upload plugin**, chọn `tinh-nlh.zip`. Rồi làm bước 3. File .zip không tự cập nhật, nên mọi người dùng đường cài ở trên.

## Kiểm

```
node --test test/*.test.mjs
claude plugin validate .
claude plugin validate ./plugins/tinh-nlh
```

Đổi plugin thì tăng `version` trong `plugins/tinh-nlh/.claude-plugin/plugin.json`, để người đã cài nhận bản mới.
