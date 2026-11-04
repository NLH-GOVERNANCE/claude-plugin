---
name: noi-cho-team-hieu
description: Viết cho người đọc hiểu ngay theo sổ tay cách nói của chị Nhi. Dùng khi viết tin nhắn, báo cáo, tóm tắt, mô tả PR hay lời giải thích cho người khác hay cho dân làng khác trong Nếp, và khi người dùng nói "không hiểu", "nói lại", "nói dễ hiểu hơn", "viết lại cho team".
---

# Nói cho team hiểu

Trước khi viết thứ người khác sẽ đọc (tin, báo cáo, tóm tắt, mô tả PR, lời giải thích), mở sổ tay của chị Nhi và viết theo đó. Người dùng nói "không hiểu" hay "nói lại": đọc sổ tay rồi viết lại, không giải thích dài hơn.

Thẻ nhanh của sổ tay (phần đọc là đủ cho tin thường) có sẵn trong `my_context`, trường `talk_card`: đó là cách nói mặc định. Không có `talk_card` (Nếp bản cũ, hay có `talk_card_note`) thì đọc file 1 dưới đây thay cho nó. Cần giải thích điều khó hay tra chữ nghề thì mở thêm file. Sổ tay nằm trên Nếp, ô `dai-dien-ceo-nhi`, không chép vào gói này. Gọi `get_cell` với `name` là `dai-dien-ceo-nhi` và `path` lần lượt là:
- `dai-dien-ceo-nhi/noi-cho-team-hieu-1-luat-va-khuon-tin.md`: luật, khuôn tin và thẻ nhanh. Đọc file này trước, mọi lần.
- `dai-dien-ceo-nhi/noi-cho-team-hieu-2-giai-thich-va-tieng-viet.md`: cách giải thích và tiếng Việt. Đọc khi phải giải thích điều khó.
- `dai-dien-ceo-nhi/noi-cho-team-hieu-3-tu-dien-va-tu-hoc.md`: từ điển và bảng kiểm. Đọc khi còn nghi một chữ nghề, và để kiểm lần cuối trước khi gửi.

Không có `talk_card` mà cũng không mở được file 1 (không có quyền hay Nếp không trả lời), hay `my_context` không có Hiến pháp (`constitution`): không gửi lời tự soạn tới người khác hay dân làng khác (S-0042). Nói với người dùng một dòng là chưa đọc được sổ tay hay Hiến pháp nên chưa gửi, rồi dừng phần gửi. Không bịa nội dung sổ tay, không nói đã theo sổ tay khi chưa đọc được.

Chỉ trích sổ tay khi người dùng hỏi; câu trả lời cho người dùng là chữ của chính Claude theo khuôn, không dán nguyên file.
