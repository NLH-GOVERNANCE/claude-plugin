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

- Trên app Claude (web, máy tính) và điện thoại: gõ `/viec`.
- Ở Claude Code và Cowork: mở phiên mới là Claude tự kể việc đang chờ (hook đầu phiên chỉ chạy ở hai nơi này).

Telegram là tuỳ chọn, chỉ để ký ngay trong nhóm. Plugin tự cập nhật theo repo (bấm **Check for updates**, hoặc bật **Sync automatically**). Plugin cũng tự có trong Claude Code ở phiên sau, cùng tài khoản.

### Làm việc trong Claude

Nói với Claude bằng câu thường; lệnh có gạch chéo chỉ là lối tắt.

- "Việc của tôi hôm nay?" (gồm việc chờ tôi ký) · `/viec`
- "Giao cho chị Thùy: …, xong khi …" · `/giao`
- "Làm tiếp việc …", ở máy nào cũng được · `/lamtiep`
- "Tôi dừng đây": Claude tự ghi bàn giao lên phiếu · `/bangiao`
- "Góp ý: …" khi vướng hay khó dùng, Claude ghi lại cho Tech Lead
- Xem tình hình trên Telegram hay governance.nlh.vn/app

### Claude Code

```
/plugin marketplace add NLH-GOVERNANCE/claude-plugin
/plugin install tinh-nlh@nlh-governance
```

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
