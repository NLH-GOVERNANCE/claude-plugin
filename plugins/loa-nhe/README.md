# Loa nhẹ (thử, chưa gộp)

Nhánh `feat/loa-monitor-trial`, phiếu cfa2bcdf. **Không gộp vào dev hay main.** Thử trên vài máy rồi bỏ hoặc làm thật.

**Là gì:** một dòng hiện ngay trong phiên Claude đang mở khi có việc mới của bạn trong Nếp. Không có cửa sổ Loa, không cổng, không khoá riêng. Loa đầy đủ (gói `nlh`) giữ nguyên, chạy song song được.

**Cách làm:** gói Claude có "bộ theo dõi" (monitor) chạy `monitor.mjs` cùng phiên. Cứ 30 giây đọc `GET /tower/feed` (chỉ đọc, việc của chính bạn) bằng khoá Loa đã lưu trên máy, mỗi việc mới in một dòng. Claude Code đưa mỗi dòng vào phiên.

## Cài (một lệnh)

```bash
claude plugin marketplace add NLH-GOVERNANCE/claude-plugin#feat/loa-monitor-trial && claude plugin install loa-nhe@nlh-loa-nhe
```

Mở lại phiên Claude (bộ theo dõi bắt đầu lúc mở phiên). Cần máy đã mở Loa tỉnh NhiLe ít nhất một lần (để có khoá).

## Gỡ (một lệnh)

```bash
claude plugin uninstall loa-nhe@nlh-loa-nhe && claude plugin marketplace remove nlh-loa-nhe
```

## In gì

- `Nếp: Build có việc mới (phiếu 11111111). Gõ "làm tiếp" để nhận.` (cũng có: câu trả lời mới, có người gọi, kế hoạch vừa ký, việc chờ chính bạn)
- Chỉ in tên chòi và 8 ký tự đầu của mã phiếu. **Không bao giờ in tiêu đề phiếu hay lý do**; việc có cờ riêng chỉ in `có việc riêng mới`.
- Việc của chính dòng mình, việc đã có người nhận: không in. Dồn hơn 3 việc một lần đọc: một dòng tổng.
- Không in lại việc cũ: nhớ mã đã in trong `~/.tinh-nlh/loa-nhe.json`; vắng quá 2 giờ thì bắt đầu từ bây giờ.
- Khoá hết hạn hay hết quyền: một dòng rồi dừng.

## Chưa chắc (đọc trước khi đo)

1. **Ứng dụng Claude (tab Code) có chạy bộ theo dõi không?** Tài liệu Claude Code chỉ nói về dòng lệnh. Chưa thử trong ứng dụng. Đây là điều cần đo đầu tiên: máy dùng ứng dụng mà không thấy dòng nào thì kết luận "không chạy", đừng sửa mã.
2. Bộ theo dõi là tính năng thử của Claude Code: không chạy ở chế độ `-p`; cần bản Claude Code mới (có `claude plugin`).
3. Cú pháp `#feat/loa-monitor-trial` sau tên kho (chọn nhánh) chưa thử trên máy khác; kho là kho riêng nên cần máy đã đăng nhập GitHub như khi cài `nlh`.
4. Mỗi phiên mở có một bộ theo dõi riêng: hai phiên mở thì cả hai cùng hiện dòng. Không biết dòng đó đi đúng phiên nào (khác Loa đầy đủ, chuyển việc tới đúng chòi).
5. Việc mới chỉ hiện khi Claude đang rảnh hay đang làm dở thì tuỳ Claude Code đưa vào lúc nào; chưa đo độ trễ thực (đọc 30 giây một lần, đọc thật một vòng trên máy này đã ra dòng).
6. Có khoá thì `monitor.mjs` đọc được; macOS đọc khoá trong Keychain (chưa thử trên Mac).
7. Cờ "việc riêng": mã đoán trường `private`, `sensitive`, `visibility` trong tin của hub; hub chưa đảm bảo những trường này. Vì vậy mã chọn không in tiêu đề cho mọi việc.

## Đã thử

`node --test test/loa-nhe.test.mjs` 9/9 (dòng in, không in lại, khoá hết hạn, địa chỉ lạ, mạng lỗi). Một vòng thật trên máy Windows của Sơn: đọc khoá đã lưu, `GET /tower/feed` ra 3 dòng. `claude plugin validate` qua (chỉ cảnh báo thiếu LICENSE, chỉ cần khi nộp danh mục công khai). Chưa cài vào ứng dụng Claude thật.

Trên nhánh này `.claude-plugin/marketplace.json` chỉ liệt kê gói `loa-nhe` (đã bỏ `nlh`) nên cài song song với gói `nlh` đang dùng mà không đè; vì vậy các bài kiểm của gói `nlh` trên nhánh này không áp dụng.
