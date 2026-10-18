# claude-plugin

Plugin của tỉnh NhiLe (NhiLe Governance) cho Claude. Repo riêng tư, chỉ chứa plugin, để người được mời đọc được plugin mà không đọc được code của hệ.

- `.claude-plugin/marketplace.json`: danh mục, liệt kê plugin `tinh-nlh`.
- `plugins/tinh-nlh/`: plugin. Nội dung xem [README của plugin](plugins/tinh-nlh/README.md).
- `scripts/plugin-zip.mjs`: đóng plugin thành file .zip.

## Cài cho mỗi người (tài khoản Claude cá nhân)

1. Nhận lời mời GitHub trong email và bấm chấp nhận. Chưa có tài khoản GitHub thì tạo một tài khoản, rồi báo anh Sơn mời.
2. Trong Claude (claude.ai hoặc ứng dụng Claude), vào [Customize > Plugins](https://claude.ai/customize/plugins), bấm **Add**, rồi **Add marketplace**, gõ `NLH-GOVERNANCE/claude-plugin`. Được hỏi thì bấm **Connect GitHub** và cho Claude GitHub App đọc repo này.
3. Cài plugin **Tỉnh NhiLe** (`tinh-nlh`). Mở tab **Connectors** của plugin, bấm **Add** rồi **Connect**, bấm **Đồng ý và đăng nhập** bằng email công ty. Chỉ đăng nhập một lần.

Xong thì mở một chat mới: Claude kể việc đang chờ bạn. Plugin tự cập nhật theo repo (bấm **Check for updates**, hoặc bật **Sync automatically**). Plugin cũng tự có trong Claude Code ở phiên sau, cùng tài khoản.

### Không dùng GitHub: tải file .zip

```
node scripts/plugin-zip.mjs tinh-nlh.zip
```

Ở [Customize > Plugins](https://claude.ai/customize/plugins): **Add**, **Upload plugin**, chọn `tinh-nlh.zip`. Rồi làm bước 3. File .zip không tự cập nhật: có bản mới thì tải lại.

### Claude Code

```
/plugin marketplace add NLH-GOVERNANCE/claude-plugin
/plugin install tinh-nlh@nlh-governance
```

### Khi có tổ chức Team hoặc Enterprise

Chưa dùng. Owner đồng bộ repo này ở [Organization settings > Plugins & skills](https://claude.ai/admin-settings/skills?tab=inventory) (**Add**, **Sync from GitHub**), đặt `tinh-nlh` là **Required**, và thêm connector `https://governance.nlh.vn/mcp` ở [Organization settings > Connectors](https://claude.ai/admin-settings/connectors). Khi đó từng người không cần tài khoản GitHub.

## Kiểm

```
node --test test/*.test.mjs
claude plugin validate .
claude plugin validate ./plugins/tinh-nlh
```

Đổi plugin thì tăng `version` trong `plugins/tinh-nlh/.claude-plugin/plugin.json`, để người đã cài nhận bản mới.
