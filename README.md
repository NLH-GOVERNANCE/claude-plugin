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

### Bật Loa trên máy (Windows và Mac)

Loa ngồi trên máy của bạn: có việc mới cho một ô, Loa báo một câu tới đúng phiên Claude đang ngồi ô đó trong khoảng 15 giây; phiên đã tắt thì Loa mở lại. Mỗi máy làm một lần, ba bước:

1. Cài app Claude cho máy tính ở [claude.ai/download](https://claude.ai/download) và plugin Tỉnh NhiLe như mục trên; máy đã có thì bỏ qua.
2. Trong app Claude, mở mục **Code**, gõ **bật Loa**, bấm cho phép khi được hỏi: biểu tượng **Loa tỉnh NhiLe** hiện trên màn hình chính.
3. Ở web tỉnh NhiLe, mở **Kết nối**, thẻ **Khoá cho Loa trên máy**, bấm **Tạo khoá mới** và chép khoá, rồi bấm đúp biểu tượng Loa, dán khoá khi cửa sổ hỏi và bấm Enter.

Khi dán, chữ không hiện ra: đó là bình thường. Lần đầu, cửa sổ Loa tự cài phần còn thiếu trong một hai phút, rồi mở trình duyệt để bạn đăng nhập Claude. Mỗi lần mở, cửa sổ hỏi một câu tiếng Anh: chọn dòng **I am using this for local development**, bấm Enter. Để cửa sổ mở là Loa làm việc; đóng cửa sổ là tắt. Không dán khoá vào chat.

#### Cho người bảo trì

- Trong plugin, Loa có tên tiếng Anh là speaker; hub gọi là tower (đường `/tower/feed`, khoá `nlh_tower_…`): tower = speaker.
- Lệnh `/tinh-nlh:speaker` chạy `speaker/setup.ps1` (Windows) hay `speaker/setup.sh` (macOS): chép Loa sang `~/.tinh-nlh/speaker` và tạo lối tắt "Loa tỉnh NhiLe" trên Desktop. Đã có lối tắt cùng tên trỏ chỗ khác thì giữ nguyên; lối tắt cũ "Tháp tỉnh NhiLe" hay "Loa tỉnh NhiLe" trỏ tới bản Loa cũ của mình (`~/.tinh-nlh`) thì tự thay.
- Lối tắt mở `speaker/start.ps1` hay `speaker/start.sh`: lấy bản mới nhất của Loa từ plugin đã cài, tự cài Claude Code (`claude.ai/install.ps1`, `install.sh`) và Node (`nodejs.org`, kiểm SHA-256) khi thiếu, hỏi khoá trong ô nhập ẩn chữ, lưu bằng DPAPI (Windows) hay Keychain (macOS), rồi mở Claude Code chạy Sonnet ở `~/TinhNhiLe`.
- Cách báo (`speaker/speaker.mjs`): hub gắn vào mỗi việc mã phiên đã ngồi ô đó (`report_session`). Kênh tra mã trong `claude agents --json --all`: phiên đang chạy thì phiên Loa gửi bằng `SendMessage`; phiên đã tắt thì `claude --bg --resume <mã>` ở thư mục cũ của phiên; không còn thì mở phiên nền mới cho ô. Mỗi lần báo ghi một dòng sổ (`POST /tower/forwards`: phiếu, ô, phiên, cách báo, được hay hỏng, không nội dung); `show_stats` đếm theo ngày. Câu báo chỉ nói ô và phiếu; Loa không đọc nội dung phiếu.
- Kênh `speaker` nạp qua `--mcp-config` với `--dangerously-load-development-channels server:speaker`, không qua tên plugin: plugin cài từ claude.ai mang tên `tinh-nlh@synced`, Claude Code chỉ nhận kênh của plugin cài từ chợ. `NLH_TOWER=1` chỉ nằm trong cấu hình kênh, nên các phiên khác trên máy không đọc luồng việc.
- Cờ `--dangerously-load-development-channels`: kênh tự làm chưa nằm trong danh sách kênh Anthropic duyệt sẵn (research preview), nên Claude Code chỉ nạp khi mình nói rõ đang thử, hỏi lại mỗi lần mở. Vì sao an toàn: kênh do repo này viết, chỉ đọc việc của chính bạn bằng khoá riêng, chỉ gửi khoá tới `*.nlh.vn`; không nhận duyệt quyền từ xa; luật của tổ chức (`channelsEnabled`) vẫn áp dụng. Một máy chỉ chạy một Loa.

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
