// Hook SessionStart của plugin tinh-nlh, phần phiên tự báo (phiếu 6d4cb2ad). Claude Code đưa vào stdin một JSON có
// session_id và session_title (tên phiên khi đã đặt, ví dụ bằng --name). Hook in một dòng để Claude biết mã và tên của
// chính phiên này, rồi báo về hệ bằng report_session khi nhận ô. Không gọi mạng, không đọc file nào khác.
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let input = {};
try {
  input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
} catch {
  input = {};
}

// Mã và tên đi vào lời dặn cho Claude: chỉ giữ đúng mẫu, bỏ ký tự dựng được thẻ hay ngoặc.
const id = /^[A-Za-z0-9_.:-]{1,100}$/.test(String(input.session_id ?? '')) ? input.session_id : null;
const title = String(input.session_title ?? '')
  .replace(/[\u0000-\u001f\u007f-\u009f<>"`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 200);

if (id) {
  const name = title ? `tên "${title}"` : 'chưa có tên';
  // SendMessage không nhận tên có "@": Tháp không gửi việc tới được phiên tên kiểu "Ô CTO (son@cto)".
  const rename = title.includes('@') ? ' Tên phiên có @ nên Tháp không gửi việc tới được: nhắc người dùng đổi tên dạng "Ô CTO (son/cto)".' : '';
  process.stdout.write(
    `Phiên này: mã ${id}, ${name}. Khi nhận ngồi một ô của tỉnh NhiLe hay đổi sang phiếu khác, gọi report_session của connector NhiLe Governance với session_id ${id}${title ? ` và session_name đúng tên trên` : ''}, cell (tên ô trong sổ, ví dụ dai-dien-kien-truc-son, không phải tên gọi cto) và ticket_id, để Tháp trên máy chuyển việc của ô đó tới phiên này.${rename}\n`,
  );
}
