# Nếp cho Claude

Nếp là nơi cả công ty NhiLe giao việc, theo dõi việc và ký duyệt. Cài Nếp vào Claude một lần, rồi nói chuyện với Claude bằng câu thường để xem và làm việc của mình.

## Cài (một lần)

**Claude Code trên máy tính** (Windows, Mac, Linux): dán một câu này vào Claude Code, Claude tự cài gói, Nếp và Loa. Bạn chỉ đăng nhập bằng email công ty và dán khoá Loa khi được hỏi.

```
Cài Nếp cho máy này theo https://raw.githubusercontent.com/NLH-GOVERNANCE/claude-plugin/main/SETUP.md
```

Gói mang sẵn Nếp: cài gói là có Nếp, đăng nhập một lần trong trình duyệt. Các bước Claude làm nằm ở [SETUP.md](SETUP.md).

**Claude trên web, ứng dụng máy tính, điện thoại**: mở link [Thêm Nếp vào Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp), bấm **Add**, rồi đăng nhập bằng email công ty. Phiên Claude Code trên mây cũng lấy Nếp từ đây. Claude báo Nếp cần đăng nhập lại thì mở claude.ai › Customize › Connectors, bấm **Connect** ở Nếp.

Muốn có lệnh tắt như `/work` trên app Claude: [Customize > Plugins](https://claude.ai/customize/plugins), **Add**, **Add marketplace**, gõ `NLH-GOVERNANCE/claude-plugin`, cài **Nếp**. Không bắt buộc.

## Dùng

Trên app Claude và điện thoại, gõ `/work` để xem việc. Ở Claude Code và Cowork, mở phiên mới là Claude tự kể việc đang chờ bạn. Ở đâu cũng hỏi được "tôi đang làm gì dở".

### Làm việc trong Claude

Nói với Claude bằng câu thường; lệnh có gạch chéo chỉ là lối tắt.

- "Việc của tôi hôm nay?" (gồm việc chờ tôi ký) · `/work`
- "Giao cho chị Thùy: …, xong khi …" · `/assign`
- "Làm tiếp việc …", ở máy nào cũng được · `/nlh:resume`
- "Tôi dừng đây": Claude tự ghi bàn giao lên phiếu · `/handoff`
- "Góp ý: …" khi vướng hay khó dùng, Claude ghi lại cho Tech Lead
- Xem tình hình trên Telegram hay governance.nlh.vn/app

Nếp tự cập nhật (bấm **Check for updates**, hoặc bật **Sync automatically**). Telegram là tuỳ chọn, chỉ để ký ngay trong nhóm.

### Bật Loa trên máy (Windows và Mac)

Loa ngồi trên máy của bạn: có việc mới cho một ô, Loa báo một câu tới đúng phiên Claude đang ngồi ô đó trong khoảng 15 giây; không có phiên nào đang mở thì Loa mở phiên mới. Máy tắt hay Loa đóng quá 2 giờ thì lúc bật lại Loa chỉ in một dòng "trong lúc vắng có N việc", không mở phiên nào; gõ **làm tiếp** trong Claude để xem. Việc đã có máy khác hay phiên trên mây giữ thì Loa ở máy này không đụng tới. Mỗi máy làm một lần, ba bước:

1. Cài app Claude cho máy tính ở [claude.ai/download](https://claude.ai/download) và Nếp như mục trên; máy đã có thì bỏ qua.
2. Trong app Claude, mở mục **Code**, gõ **bật Loa**, bấm cho phép khi được hỏi: biểu tượng **Loa tỉnh NhiLe** hiện trên màn hình chính.
3. Ở web Nếp, mở **Kết nối**, thẻ **Khoá cho Loa trên máy**, bấm **Tạo khoá mới** và chép khoá, rồi bấm đúp biểu tượng Loa, dán khoá khi cửa sổ hỏi và bấm Enter.

Khi dán, chữ không hiện ra: đó là bình thường. Lần đầu, cửa sổ Loa tự cài phần còn thiếu trong một hai phút, rồi mở trình duyệt để bạn đăng nhập Claude. Mỗi lần mở, cửa sổ hỏi một câu tiếng Anh: chọn dòng **I am using this for local development**, bấm Enter. Để cửa sổ mở là Loa làm việc, máy không ngủ khi Loa mở; đóng cửa sổ là tắt. Từ lần sau Loa tự mở khi bạn đăng nhập máy, chỉ cần chọn dòng tiếng Anh như trên. Khoá tự gia hạn khi Loa chạy, chỉ hết hạn sau 30 ngày không dùng. Không dán khoá vào chat.

Máy đã bật Loa trước khi đổi tên Nếp: gõ **bật Loa** thêm một lần, không cần khoá mới.

## Cho người bảo trì

- `.claude-plugin/marketplace.json`: danh mục `nlh-governance`, một plugin `nlh`. `plugins/tinh-nlh/`: plugin, xem [README của plugin](plugins/tinh-nlh/README.md). `scripts/plugin-zip.mjs`: đóng plugin thành file .zip.
- Tên: người dùng thấy **Nếp** (`displayName` trong `plugin.json` và trong danh mục; D-0055). Tên kỹ thuật `nlh`, anh Sơn chốt 19/10/2026. Tên cũ `tinh-nlh` khai ở `renames` của danh mục để máy đã cài tự chuyển; giữ dòng đó mãi, đổi tên lần nữa thì thêm dòng mới. Thư mục `plugins/tinh-nlh`, chỗ ở của Loa `~/.tinh-nlh`, tên khoá trong Keychain và tên biểu tượng Loa giữ như cũ: người dùng không gõ tới, đổi thì máy đã cài phải chuyển.
- Đổi plugin thì tăng `version` trong `plugins/tinh-nlh/.claude-plugin/plugin.json`, để người đã cài nhận bản mới.
- Trong plugin, Loa có tên tiếng Anh là speaker; hub gọi là tower (đường `/tower/feed`, khoá `nlh_tower_…`): tower = speaker.
- Lệnh `/nlh:speaker` chạy `speaker/setup.ps1` (Windows) hay `speaker/setup.sh` (macOS): chép Loa sang `~/.tinh-nlh/speaker` và tạo lối tắt "Loa tỉnh NhiLe" trên Desktop. Đã có lối tắt cùng tên trỏ chỗ khác thì giữ nguyên; lối tắt cũ "Tháp tỉnh NhiLe" hay "Loa tỉnh NhiLe" trỏ tới bản Loa cũ của mình (`~/.tinh-nlh`) thì tự thay.
- Lối tắt mở `speaker/start.ps1` hay `speaker/start.sh`: lấy bản mới nhất của Loa từ plugin `nlh` đã cài (bản lối mở trong `~/.tinh-nlh/speaker` cũ hơn thì chép bản mới rồi chạy ngay bản mới một lần, không đợi lần mở sau), tự cài Claude Code (`claude.ai/install.ps1`, `install.sh`) và Node (`nodejs.org`, kiểm SHA-256) khi thiếu, hỏi khoá trong ô nhập ẩn chữ, lưu bằng DPAPI (Windows) hay Keychain (macOS), rồi mở Claude Code chạy Sonnet ở `~/TinhNhiLe`. Phiên Loa tắt mọi hook (`--settings` với `disableAllHooks`, tệp `speaker-settings.json`): hook của gói gọi connector Nếp mà phiên Loa không có, nên trước đây mỗi lượt in khoảng 10 dòng lỗi "Stop hook error". Bản Loa chép trước khi đổi tên chỉ tìm plugin `tinh-nlh`, nên máy cũ cần "bật Loa" một lần nữa.
- Cách báo (`speaker/speaker.mjs`): hub gắn vào mỗi việc mã phiên đã ngồi ô đó (`report_session`). Kênh tra mã trong `claude agents --json --all`: phiên đang chạy thì phiên Loa gửi bằng `SendMessage`; phiên app đang nghỉ (đã báo tên, bản ghi trên máy này) thì gửi theo tên để app đánh thức; phiên đã tắt thì không mở lại (`--resume`), vì phiên cũ làm theo kế hoạch cũ trong trí nhớ của nó (việc 17e647c1); chưa có mã hay mã không còn thì tìm phiên đang chạy có tên chứa "(người/tên gọi)" của ô; không thấy mới mở phiên nền mới tên "Ô <tên ô> (<người>/<tên gọi đầu>)", ví dụ "Ô CTO (son/cto)", câu báo dặn phiên đọc bảng (`continue_work`) trước khi làm. Phiên tương tác đang mở của dân làng (tên có "(người/tên gọi)" hay đã `report_session`) luôn được chọn trước phiên nền; phiên nền trùng với nó thì Loa dừng (`claude stop`), mỗi phút soát một lần (việc 5d66123d). Mỗi lần báo ghi một dòng sổ (`POST /tower/forwards`: phiếu, ô, phiên, cách báo, được hay hỏng, không nội dung); `show_stats` đếm theo ngày. Câu báo chỉ nói ô và phiếu; Loa không đọc nội dung phiếu.
- Mỗi việc một nơi (D-0065 điều 1, việc 17e647c1): hub đánh dấu việc đã có nơi giữ ở máy khác hay phiên mây (`held_elsewhere`) thì Loa không đánh thức phiên nào, không nhắc; việc giữ ở chính máy này (`held_here`) thì câu trả lời mới chỉ tới phiên đang giữ. Việc chưa ai giữ thì nơi nhận trước giữ: giếng từ chối dòng nhận thứ hai, nơi kia thấy "phiên khác đang giữ" và dừng.
- Sau quãng nghỉ (việc 17e647c1): lần đọc luồng việc cuối cách đây quá 2 giờ (máy tắt, ngủ, Loa đóng) thì Loa không báo từng việc tồn: in một dòng "Trong lúc vắng có N việc; mở Claude gõ "làm tiếp" để xem.", không mở hay gửi vào phiên nào, bỏ nhắc lại và câu trả lời đang chờ của trước đó, rồi đọc tiếp từ bây giờ như lần chạy đầu. 2 giờ dài hơn một lần khởi động lại, cập nhật gói hay một cuộc họp, và dài hơn lần nhắc lại (30 phút).
- Nhắc lại (việc 6beaa750): việc mới của dân làng hay lời gọi trong nhóm mà Loa đã báo, sau 30 phút vẫn còn trong luồng việc, chưa ai nhận, thì Loa nhắc đúng phiên đã báo một câu "vẫn chưa ai nhận", một lần (việc 17e647c1: trước là 3 lần, anh Sơn bớt để đỡ tốn token); không mở phiên mới để nhắc, không nhắc vào nhóm hay người, không nhắc việc chờ chính bạn. Câu trả lời mới (kể cả chữ ký của người được xin ký) báo một lần cho dân làng đã hỏi, không nhắc "chưa ai nhận" (việc c65f35ed). Mỗi lần nhắc ghi một dòng sổ như lần báo đầu, mã mục bắt đầu bằng `remind<n>:`. Việc đã rời luồng (đã nhận, đã trả lời, đã đóng) thì quên luôn. Câu trả lời mới chờ 2 phút rồi mới báo, và chỉ báo nếu việc còn trong luồng; việc dân làng tự mở cho chính mình thì không báo. Kiểm bằng một lần đọc luồng việc thêm, nhiều nhất mỗi phút một lần và chỉ khi có mục tới hạn; không tốn token AI.
- Tự mở khi đăng nhập: setup đăng ký tác vụ "Loa tỉnh NhiLe" của chính người dùng ở Task Scheduler (Windows, không cần quyền quản trị) hay LaunchAgent `vn.nlh.tinh-nlh.speaker` (macOS). Khi Loa mở, máy không ngủ (`SetThreadExecutionState` trên Windows, `caffeinate` trên macOS). Claude thoát trong một phút đầu (kênh bị chặn, hay bấm không ở hộp kênh thử) thì lối mở chạy lại không cờ kênh, chỉ nhịp 10 phút qua công cụ `pending`, in một dòng. Kênh đã mở thì phiên Loa không đặt vòng 10 phút nào: kênh tự đẩy từng việc, vòng chỉ tốn token (việc 17e647c1).
- Kênh `speaker` nạp qua `--mcp-config` với `--dangerously-load-development-channels server:speaker`, không qua tên plugin: plugin cài từ claude.ai mang tên `nlh@synced`, Claude Code chỉ nhận kênh của plugin cài từ chợ. `NLH_TOWER=1` chỉ nằm trong cấu hình kênh, nên các phiên khác trên máy không đọc luồng việc; phiên Loa mở cũng không mang `NLH_TOWER*`, nên không giữ khoá Loa khi Loa tắt.
- Cờ `--dangerously-load-development-channels`: kênh tự làm chưa nằm trong danh sách kênh Anthropic duyệt sẵn (research preview), nên Claude Code chỉ nạp khi mình nói rõ đang thử, hỏi lại mỗi lần mở. Vì sao an toàn: kênh do repo này viết, chỉ đọc việc của chính bạn bằng khoá riêng, chỉ gửi khoá tới `*.nlh.vn`; không nhận duyệt quyền từ xa; luật của tổ chức (`channelsEnabled`) vẫn áp dụng. Một máy chỉ chạy một Loa.

### Gói mang Nếp (26/10/2026)

Ngày 25/10 (0.20.0) gói bỏ connector riêng, dựa vào connector Nếp trong tài khoản. Anh Sơn nói đó là hiểu sai ý anh: anh muốn cài gói là có luôn Nếp, như [Cloudflare cho Claude Code](https://developers.cloudflare.com/agent-setup/claude-code/). Từ 0.22.0 gói mang lại máy chủ `nep` (`https://mcp.nlh.vn/mcp`, tên trong Claude Code `plugin:nlh:nep`, công cụ `mcp__plugin_nlh_nep__…`).

- Trên máy: máy chủ của gói thắng connector của tài khoản cùng địa chỉ (code.claude.com/docs/en/mcp, thứ tự ưu tiên theo địa chỉ), nên connector tài khoản bị ẩn và người dùng đăng nhập Nếp một lần cho gói (`/mcp`, chọn `plugin:nlh:nep`). `claude mcp login` cần một terminal thật, nên Claude không tự chạy được: người gõ `/mcp`.
- Trên mây: proxy của phiên đổi địa chỉ connector tài khoản, nên hai cái không trùng và cả hai cùng có. Máy chủ của gói không đăng nhập được ở đó (luôn "cần đăng nhập"); Nếp đến từ connector tài khoản như trước. Dòng đầu phiên (`hooks/sign-in-check.mjs`, theo `CLAUDE_CODE_REMOTE`) dặn Claude không xin người đăng nhập máy chủ của gói trên mây.
- Hook gọi `plugin:nlh:nep` trước, rồi connector tài khoản theo mọi tên nó có (`claude.ai Nếp` trên máy, `Nếp` trên mây, hai tên cũ `nhile-governance` và `NhiLe Governance`). Tên nào không nối thì hook đó bỏ qua; hai bản cùng lưu một lượt chat thì giếng bỏ bản trùng trong 2 phút.

### File .zip (để thử)

```
node scripts/plugin-zip.mjs nep.zip
```

Ở [Customize > Plugins](https://claude.ai/customize/plugins): **Add**, **Upload plugin**, chọn `nep.zip`. File .zip không tự cập nhật, nên mọi người dùng đường cài ở trên.

### Kiểm

```
node --test test/*.test.mjs
claude plugin validate .
claude plugin validate ./plugins/tinh-nlh
```
