---
name: bang-kiem-san-pham
description: Bảng kiểm làm sản phẩm NhiLe, 8 bước chị Nhi đặt. Dùng mỗi khi dân làng nhận việc làm web, trang, màn hình, ứng dụng, tính năng hay sản phẩm mới, hoặc sửa một thứ khách dùng; cả khi người dùng nói "làm web", "làm trang", "thêm tính năng", "làm sản phẩm", "bảng kiểm sản phẩm", "8 bước của chị Nhi".
---

# Bảng kiểm làm sản phẩm NhiLe

Chị Nhi muốn mỗi việc làm web hay sản phẩm đi qua đủ 8 bước dưới đây, và dân làng tự kiểm từng bước. Đây là kiến thức chung về làm sản phẩm; không chép tài liệu khoá học nào vào việc.

## Cách chạy

1. Nhận việc xong, trước khi viết code: xét cả 8 bước. Mỗi bước ra một trong ba kết quả: **đạt**, **chưa đạt**, **không áp dụng**.
2. Bước 1 tới 6 xét trước khi làm (bước 6 xét lại trên bản dựng, trước khi mở PR hay ra mắt). Bước 7 và 8 lúc này chỉ cần kế hoạch đo đã ghi đủ số; kết quả thật ghi thêm sau.
3. Ghi một dòng lên việc (`add_follow_up`, kind `fact`, `from_cell` là chòi của mình): mỗi bước một dòng "Bước N: đạt / chưa đạt / không áp dụng, vì …", kèm `details.checklist` = `[{ "step": 1, "result": "pass" | "fail" | "na", "note": "…" }, …]` đủ 8 mục. Số liệu dẫn nguồn (link, việc, bảng).
4. **Có bước chưa đạt thì dừng**, không làm tiếp phần phụ thuộc bước đó. Báo người nhờ việc: `open_ticket` gửi đúng người đó (`to`), `parent_ticket_id` là việc này, một câu hỏi, 2–3 lựa chọn (ví dụ: "Bổ sung số liệu rồi làm", "Làm tiếp, ghi rõ là đoán", "Bỏ phần này"). Trên việc gốc ghi `claim` kèm `details.waiting_on` là mã việc hỏi. Có trả lời thì ghi lại bước đó (kind `correction`, `corrects_id` là dòng bảng kiểm) rồi làm tiếp.
5. **Không áp dụng** thì ghi lý do một dòng, không dừng. Việc nhỏ (sửa chữ, đổi màu, sửa một lỗi) thường không áp dụng bước 1, 2, 7; các bước khác vẫn xét.
6. Lời gửi người viết theo sổ tay nói cho team hiểu (skill `noi-cho-team-hieu`): việc lên dòng đầu, lời thường, thuật ngữ chỉ để trong ngoặc.

## 8 bước

### 1. Chọn làm gì trước
- Làm: danh sách tính năng dài thì cho khách chọn "quan trọng nhất / ít quan trọng nhất" theo từng nhóm nhỏ (MaxDiff). Có dính giá, gói, "khách chịu trả bao nhiêu" thì cho khách so các gói trọn vẹn (conjoint).
- Đạt khi: có thứ tự ưu tiên dựa trên số liệu (khảo sát, số dùng thật, lời khách đếm được), ghi nguồn. Thứ tự do người tự đoán là chưa đạt.

### 2. Khác đối thủ ở đâu
- Làm: kể 4–6 điều khách cân nhắc, chấm mình và 1–2 đối thủ trên từng điều (đường giá trị). Với mỗi điều chọn Bỏ, Giảm, Tăng hay Tạo (ERRC).
- Đạt khi: có bảng chấm, và đường của mình khác đối thủ ở ít nhất một điều khách coi trọng (có ít nhất một Bỏ hay Tạo).

### 3. Khách có dễ làm không
- Làm: với mỗi hành động chính của khách, xét đủ ba thứ: có lý do muốn làm, làm đủ dễ, có lời nhắc đúng lúc (B = MAP). Chọn số đo: hài lòng (CSAT), công sức bỏ ra (CES), sẵn lòng giới thiệu (NPS).
- Đạt khi: mỗi hành động chính ghi rõ ba thứ trên, số bước tối thiểu, và một số đo kèm mức muốn đạt.

### 4. Hành trình khách qua các kênh
- Làm: vẽ các chặng khách đi qua (web, Zalo, gọi điện, lớp học…). Mỗi chặng ghi khách đang làm gì, nghĩ gì, và bước kế tiếp nên gợi ý cho từng nhóm khách (next-best action).
- Đạt khi: có bản đồ hành trình, chặng nào cũng có gợi ý bước kế, không chặng nào bỏ khách giữa chừng.

### 5. Dùng AI loại nào
- Làm: nói rõ AI dùng để đoán (predictive), tạo nội dung (generative) hay tự làm nhiều bước (agentic), hay không cần AI. Trả lời bằng tài liệu công ty thì tra tài liệu trước rồi mới trả lời (RAG), luôn đọc bản mới nhất, dẫn nguồn.
- Đạt khi: ghi loại AI và lý do; nếu trả lời từ tài liệu thì ghi nguồn tài liệu, cách lấy bản mới nhất, và câu trả lời khi không tìm thấy (nói "chưa có", không bịa). Không dùng AI thì ghi "không áp dụng".

### 6. Soát giao diện theo 10 nguyên tắc Nielsen
- Làm: soát bản dựng theo 10 điều: (1) báo trạng thái, (2) nói lời khách, (3) có nút lui, huỷ, (4) nhất quán, (5) chặn lỗi trước, (6) cho thấy thay vì bắt nhớ, (7) có lối tắt cho người quen, (8) gọn, (9) báo lỗi dễ hiểu kèm cách sửa, (10) có trợ giúp.
- Đạt khi: ghi từng chỗ vi phạm kèm số nguyên tắc và màn hình, và không còn chỗ vi phạm nào chặn khách làm xong việc chính. Không thấy vi phạm thì ghi "đã soát đủ 10, không thấy".

### 7. Thử trước khi tung
- Làm: chia khách ngẫu nhiên hai nhóm (A/B test), mỗi lần đổi một thứ. Ghi con số chính (ví dụ tỉ lệ mua, conversion rate) và con số canh chừng (ví dụ tỉ lệ trả hàng, return rate), cỡ mẫu và thời gian chạy.
- Đạt khi (lúc làm): kế hoạch thử ghi đủ các mục trên. Đạt khi (sau thử): thắng con số chính mà con số canh chừng không xấu đi; ghi kết quả lên việc.

### 8. Sau ra mắt
- Làm: đo phễu năm chặng: tới, dùng thử lần đầu, quay lại, rủ bạn, trả tiền (AARRR). Sửa chặng rớt nhiều nhất trước. Giữ khách bằng chăm sóc và ưu đãi người quen (CRM, loyalty). Đội vừa tìm hiểu khách vừa xây song song (Dual-Track Agile).
- Đạt khi (lúc làm): ghi mỗi chặng đo bằng số nào, lấy ở đâu, ai xem, bao lâu một lần. Đạt khi (sau ra mắt): có số đủ năm chặng và việc sửa chặng rớt nhiều nhất đã mở.
