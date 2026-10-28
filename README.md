# Nếp cho Claude

Nếp là nơi cả công ty NhiLe giao việc, theo dõi việc và ký duyệt. Cài Nếp vào Claude một lần, rồi nói chuyện với Claude bằng câu thường để xem và làm việc của mình.

## Cài (một lần)

**Claude Code trên máy tính** (Windows, Mac, Linux): dán một câu này vào Claude Code, Claude tự cài gói, bạn không gõ lệnh nào. Nếp lấy từ tài khoản Claude của bạn nên không phải đăng nhập lần hai; máy chưa có Nếp thì Claude đưa một link để bạn mở, làm theo màn hình, đăng nhập bằng email bạn đang dùng trong NhiLe Holding hay NhiLe Team.

```
Cài Nếp cho máy này theo https://raw.githubusercontent.com/NLH-GOVERNANCE/claude-plugin/main/SETUP.md
```

Gói không mang máy chủ Nếp riêng: Nếp là connector gắn vào tài khoản Claude, nên cài hay nâng bản gói không bắt đăng nhập lần hai. Các bước Claude làm nằm ở [SETUP.md](SETUP.md).

**Claude trên web, ứng dụng máy tính, điện thoại**: mở link [Thêm Nếp vào Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=N%E1%BA%BFp&connectorUrl=https%3A%2F%2Fmcp.nlh.vn%2Fmcp), rồi làm theo màn hình, đăng nhập bằng email bạn đang dùng trong NhiLe Holding hay NhiLe Team. Phiên Claude Code trên mây cũng lấy Nếp từ đây. Claude báo Nếp cần nối lại thì mở lại link trên, làm theo màn hình. [chưa kiểm: nếu Nếp đã có trong danh sách, màn hình có thể tạo thêm một bản trùng; xoá bản cũ ở claude.ai › Customize › Connectors.]

Muốn có lệnh tắt như `/work` trên app Claude: [Customize > Plugins](https://claude.ai/customize/plugins), **Add**, **Add marketplace**, gõ `NLH-GOVERNANCE/claude-plugin`, cài **Nếp**. Không bắt buộc.

## Dùng

Trên app Claude và điện thoại, gõ `/work` để xem việc. Ở Claude Code và Cowork, mở phiên mới là Claude tự kể việc đang chờ bạn. Ở đâu cũng hỏi được "tôi đang làm gì dở".

### Làm việc trong Claude

Nói với Claude bằng câu thường; lệnh có gạch chéo chỉ là lối tắt.

- "Việc của tôi hôm nay?" (gồm việc chờ tôi ký) · `/work`
- "Giao cho chị Thùy: …, xong khi …" · `/assign`
- "Làm tiếp việc …", ở máy nào cũng được · `/nlh:resume`
- "Tôi dừng đây": Claude tự ghi bàn giao lên việc · `/handoff`
- "Góp ý: …" khi vướng hay khó dùng, Claude ghi lại cho Tech Lead
- Xem tình hình trên Telegram hay governance.nlh.vn/app

Nếp tự cập nhật (bấm **Check for updates**, hoặc bật **Sync automatically**). Telegram là tuỳ chọn, chỉ để ký ngay trong nhóm.

### Loa trên máy (Windows và Mac)

Loa báo việc mới tới đúng phiên Claude trên máy của bạn. Cách bật không cần làm tay đang được làm lại, nên Loa tạm chưa dùng; khi xong Claude sẽ tự lo.

## Cho người bảo trì

- `.claude-plugin/marketplace.json`: danh mục `nlh-governance`, một plugin `nlh`. `plugins/tinh-nlh/`: plugin, xem [README của plugin](plugins/tinh-nlh/README.md). `scripts/plugin-zip.mjs`: đóng plugin thành file .zip.
- Tên: người dùng thấy **Nếp** (`displayName` trong `plugin.json` và trong danh mục; D-0055). Tên kỹ thuật `nlh`, anh Sơn chốt 19/10/2026. Tên cũ `tinh-nlh` khai ở `renames` của danh mục để máy đã cài tự chuyển; giữ dòng đó mãi, đổi tên lần nữa thì thêm dòng mới. Thư mục `plugins/tinh-nlh`, chỗ ở của Loa `~/.tinh-nlh`, tên khoá trong Keychain và tên biểu tượng Loa giữ như cũ: người dùng không gõ tới, đổi thì máy đã cài phải chuyển.
- Đổi plugin thì tăng `version` trong `plugins/tinh-nlh/.claude-plugin/plugin.json`, để người đã cài nhận bản mới.
- Trong plugin, Loa có tên tiếng Anh là speaker; hub gọi là tower (đường `/tower/feed`, khoá `nlh_tower_…`): tower = speaker.
- Lệnh `/nlh:speaker` chạy `speaker/setup.ps1` (Windows) hay `speaker/setup.sh` (macOS): chép Loa sang `~/.tinh-nlh/speaker` và tạo lối tắt "Loa tỉnh NhiLe" trên Desktop. Đã có lối tắt cùng tên trỏ chỗ khác thì giữ nguyên; lối tắt cũ "Tháp tỉnh NhiLe" hay "Loa tỉnh NhiLe" trỏ tới bản Loa cũ của mình (`~/.tinh-nlh`) thì tự thay.
- Lối tắt mở `speaker/start.ps1` hay `speaker/start.sh`: lấy bản mới nhất của Loa từ plugin `nlh` đã cài (bản lối mở trong `~/.tinh-nlh/speaker` cũ hơn thì chép bản mới rồi chạy ngay bản mới một lần, không đợi lần mở sau), tự cài Claude Code (`claude.ai/install.ps1`, `install.sh`) và Node (`nodejs.org`, kiểm SHA-256) khi thiếu, nếu máy chưa có khoá thì `speaker/pair.mjs` xin khoá (mục D, `docs/loa-allow-button.md` của api): máy tự sinh khoá, chỉ gửi bản băm SHA-256 tới `POST /tower/pair`, nhận mã ngắn, mở trang `nep.nlh.vn/app/pair?code=…`, hỏi `GET /tower/pair/status` tới khi người bấm **Cho phép**, rồi lưu khoá bằng DPAPI (Windows) hay Keychain (macOS) (khoá chỉ tới hub qua https ở bước hỏi vòng, không tới web, URL, chat hay màn hình; sổ của hub chỉ giữ bản băm); sau đó mở Claude Code chạy Sonnet ở `~/TinhNhiLe`. Phiên Loa tắt mọi hook (`--settings` với `disableAllHooks`, tệp `speaker-settings.json`): hook của gói gọi connector Nếp mà phiên Loa không có, nên trước đây mỗi lượt in khoảng 10 dòng lỗi "Stop hook error". Bản Loa chép trước khi đổi tên chỉ tìm plugin `tinh-nlh`, nên máy cũ cần "bật Loa" một lần nữa.
- Cách báo (`speaker/speaker.mjs`): hub gắn vào mỗi việc mã phiên đã ngồi ô đó (`report_session`). Kênh tra mã trong `claude agents --json --all`: phiên đang chạy thì phiên Loa gửi bằng `SendMessage`; phiên app đang nghỉ (đã báo tên, bản ghi trên máy này) thì gửi theo tên để app đánh thức; phiên đã tắt thì không mở lại (`--resume`), vì phiên cũ làm theo kế hoạch cũ trong trí nhớ của nó (việc 17e647c1); chưa có mã hay mã không còn thì tìm phiên đang chạy có tên chứa "(người/tên gọi)" của ô; không thấy thì không mở phiên nào (không `claude --bg`; app Claude chưa có cách chính thức mở một phiên có tên tự chạy: `claude://code/new` chỉ điền sẵn ô chat và hỏi xác nhận thư mục), in một dòng "Ô <tên ô> (<người>/<tên gọi đầu>) có việc mới, chưa phiên nào mở", mỗi ô một dòng trong 10 phút (việc 3a65c3bd). Phiên tương tác đang mở của dân làng (tên có "(người/tên gọi)" hay đã `report_session`) luôn được chọn trước phiên nền; phiên nền cũ còn sót trùng với nó thì Loa dừng (`claude stop`), mỗi phút soát một lần (việc 5d66123d). Mỗi lần báo ghi một dòng sổ (`POST /tower/forwards`: phiếu, ô, phiên, cách báo, được hay hỏng, không nội dung); `show_stats` đếm theo ngày. Câu báo chỉ nói ô và phiếu; Loa không đọc nội dung phiếu.
- Mỗi việc một nơi (D-0065 điều 1, việc 17e647c1): hub đánh dấu việc đã có nơi giữ ở máy khác hay phiên mây (`held_elsewhere`) thì Loa không đánh thức phiên nào, không nhắc; việc giữ ở chính máy này (`held_here`) thì câu trả lời mới chỉ tới phiên đang giữ. Việc chưa ai giữ thì nơi nhận trước giữ: giếng từ chối dòng nhận thứ hai, nơi kia thấy "phiên khác đang giữ" và dừng.
- Sau quãng nghỉ (việc 17e647c1): lần đọc luồng việc cuối cách đây quá 2 giờ (máy tắt, ngủ, Loa đóng) thì Loa không báo từng việc tồn: in một dòng "Trong lúc vắng có N việc; mở Claude gõ "làm tiếp" để xem.", không mở hay gửi vào phiên nào, bỏ nhắc lại và câu trả lời đang chờ của trước đó, rồi đọc tiếp từ bây giờ như lần chạy đầu. 2 giờ dài hơn một lần khởi động lại, cập nhật gói hay một cuộc họp, và dài hơn lần nhắc lại (30 phút).
- Nhắc lại (việc 6beaa750): việc mới của dân làng hay lời gọi trong nhóm mà Loa đã báo, sau 30 phút vẫn còn trong luồng việc, chưa ai nhận, thì Loa nhắc đúng phiên đã báo một câu "vẫn chưa ai nhận", một lần (việc 17e647c1: trước là 3 lần, anh Sơn bớt để đỡ tốn token); không nhắc khi ô chưa có phiên, không nhắc vào nhóm hay người, không nhắc việc chờ chính bạn. Câu trả lời mới (kể cả chữ ký của người được xin ký) báo một lần cho dân làng đã hỏi, không nhắc "chưa ai nhận" (việc c65f35ed). Mỗi lần nhắc ghi một dòng sổ như lần báo đầu, mã mục bắt đầu bằng `remind<n>:`. Việc đã rời luồng (đã nhận, đã trả lời, đã đóng) thì quên luôn. Câu trả lời mới chờ 2 phút rồi mới báo, và chỉ báo nếu việc còn trong luồng; việc dân làng tự mở cho chính mình thì không báo. Kiểm bằng một lần đọc luồng việc thêm, nhiều nhất mỗi phút một lần và chỉ khi có mục tới hạn; không tốn token AI.
- Tự mở khi đăng nhập: lối mở `start.ps1` đăng ký tác vụ "Loa tỉnh NhiLe" của chính người dùng ở Task Scheduler khi người dùng bấm đúp Loa (Windows, không cần quyền quản trị; không để phiên Claude đặt lịch vì chế độ Auto có thể chặn, 28/10), còn setup trên macOS đăng ký LaunchAgent `vn.nlh.tinh-nlh.speaker` (macOS). Khi Loa mở, máy không ngủ (`SetThreadExecutionState` trên Windows, `caffeinate` trên macOS). Claude thoát trong một phút đầu (kênh bị chặn) thì lối mở chạy lại không cờ kênh, chỉ nhịp 10 phút qua công cụ `pending`, in một dòng. Kênh đã mở thì phiên Loa không đặt vòng 10 phút nào: kênh tự đẩy từng việc, vòng chỉ tốn token (việc 17e647c1).
- Kênh khỏi quyền quản trị (việc 26f86f3d, 28/10, CTO chọn đường B): trên Windows, máy chưa cho phép kênh của gói (danh sách `managed-settings.json`, ghi được chỉ khi có quyền quản trị: người không có mã PIN quản trị bị chặn ở hộp của Windows) thì lối mở dùng kênh phát triển: `--mcp-config` + `--dangerously-load-development-channels server:speaker`. Claude Code hỏi một câu tiếng Anh ở mỗi lần mở ("Loading development channels", chọn sẵn "1. I am using this for local development"); trợ giúp ẩn `start.ps1 -Answer <số hiệu tiến trình>` đọc màn hình của cửa sổ ẩn (`AttachConsole` + `ReadConsoleOutputCharacter`) và chỉ khi thấy đúng câu đó mới ghi một phím Enter vào đầu vào của nó (`WriteConsoleInput`); thử thật trên Windows: kênh nối sau 6 giây, tin đẩy vào được xử lý. Không thấy câu đó trong 3 phút thì ghi một dòng vào `loa.log` và thôi. Máy đã có danh sách cho phép đúng gói (người quản trị đã ghi) thì vẫn mở theo tên gói `--channels plugin:nlh@<kho>`, không hộp nào (`speaker/policy.mjs mode`). Lối mở Windows không còn gọi `policy.mjs ensure`: không hộp xin quyền quản trị nào. macOS giữ cách cũ (hộp mật khẩu), chưa đổi. `NLH_TOWER=1` nằm trong môi trường của lần mở Loa nên các phiên khác trên máy không đọc luồng việc.
- Chạy ẩn (Windows, 28/10): lối tắt và lúc đăng nhập (một giá trị khoá `HKCU...Run` của chính người dùng, không cần quản trị; bản trước dùng tác vụ đặt lịch và bị "Access is denied" trên laptop) mở `speaker/loa.vbs` (wscript, không cửa sổ), nó chạy `start.ps1 -Auto`; không còn bản cửa sổ nhìn thấy cho lần đầu. Các việc cần người đi qua hộp thoại và trình duyệt, không qua cửa sổ đen: khoá Loa bằng nút Cho phép (`pair.mjs`); Claude chưa đăng nhập thì một hộp thoại tiếng Việt ("Loa cần bạn đăng nhập Claude một lần. Bấm OK, trình duyệt sẽ mở: bấm nút xanh là xong."), rồi `claude auth login` chạy ẩn đến khi `claude auth status` báo đã đăng nhập (tối đa 5 phút); `speaker/prepare.mjs` đánh dấu sẵn trong `~/.claude.json` ba thứ còn thiếu (đã qua câu hỏi đầu, kiểu chữ, tin thư mục TinhNhiLe) để Claude Code không hiện màn đầu tiếng Anh. Trục trặc thì để một dòng ở `last-error.json` cho phiên Claude kế tiếp báo. Hai câu người dùng phải thấy ("ô … chưa phiên nào mở", "có việc chờ chính bạn") hiện thêm thành thông báo Windows (`speaker/toast.ps1`, tên "Loa tỉnh NhiLe", bấm vào mở app Claude, hay trang web nếu chưa cài app), vì dòng in trong cửa sổ ẩn không ai thấy. Một máy một Loa (mutex và `loa.pid`). macOS vẫn mở cửa sổ Terminal (chưa làm chạy ẩn, chưa thử).

### Nếp đến từ tài khoản (28/10/2026, 0.23.1)

Ngày 26/10 anh Sơn dặn "cài gói là có luôn Nếp", nên 0.22.0 mang máy chủ `nep` (`https://mcp.nlh.vn/mcp`, tên `plugin:nlh:nep`) để cài gói là có Nếp. Thử 28/10 trên máy sạch: máy chủ đó trùng địa chỉ với connector Nếp của tài khoản nên che nó, đòi đăng nhập riêng (`/mcp`, Connect, "2 to reconnect"), còn đường đồng bộ theo tài khoản thì có Nếp ngay, không đăng nhập (việc d622294a). Từ 0.23.1 gói bỏ máy chủ đó (đảo ý ngày 28/10, việc F 74affec8); Nếp là connector gắn vào tài khoản. Máy chưa gắn thì dòng đầu phiên dặn mở link ở trên, làm theo màn hình, mở phiên mới.

- Hook vẫn gọi `plugin:nlh:nep` trước cho máy còn bản gói cũ, rồi connector tài khoản theo mọi tên nó có (`claude.ai Nếp` trên máy, `Nếp` trên mây, hai tên cũ `nhile-governance` và `NhiLe Governance`, và mã `3398cc99-b4dc-41bd-8007-bd4b6792d5cb` mà phiên mây tạo bằng `create_session` và app Claude dùng làm tên connector của công ty, việc 7b4fbf29). Tên nào không nối thì hook đó bỏ qua; hai bản cùng lưu một lượt chat thì giếng bỏ bản trùng trong 2 phút.

### Loa: cách bật (cho người bảo trì)

Khoá cấp bằng nút **Cho phép** (mục D): cần trang `/app/pair` của web Nếp (phiếu 567e39e0); chưa có trang đó thì Loa dừng ở bước xin khoá.

Loa ngồi trên máy của bạn: có việc mới cho một ô, Loa báo một câu tới đúng phiên Claude đang ngồi ô đó trong khoảng 15 giây; không có phiên nào đang ngồi ô đó thì Loa không mở phiên nào, chỉ in một dòng "Ô … có việc mới, chưa phiên nào mở; mở Claude gõ "làm tiếp"" (việc 3a65c3bd, anh Sơn 26/10: không mở phiên nền); việc vẫn nằm trong hộp việc. Máy tắt hay Loa đóng quá 2 giờ thì lúc bật lại Loa chỉ in một dòng "trong lúc vắng có N việc", không mở phiên nào; gõ **làm tiếp** trong Claude để xem. Việc đã có máy khác hay phiên trên mây giữ thì Loa ở máy này không đụng tới. Mỗi máy làm một lần, ba bước:

1. Cài app Claude cho máy tính ở [claude.ai/download](https://claude.ai/download) và Nếp như mục trên; máy đã có thì bỏ qua.
2. Trong app Claude, mở mục **Code**, gõ **bật Loa**, bấm cho phép khi được hỏi: biểu tượng **Loa tỉnh NhiLe** hiện trên màn hình chính.
3. Bấm đúp biểu tượng Loa: trang Nếp mở ra, bấm **Cho phép**.

Lần đầu, Loa tự cài phần còn thiếu trong một hai phút, không hiện cửa sổ nào: nếu Claude chưa đăng nhập thì một hộp thoại báo, bấm OK, trình duyệt mở ra, bấm nút xanh; rồi trang Nếp mở để bạn bấm Cho phép (mã mười phút; hết hạn thì tự xin mã mới một lần). Không hộp xin quyền quản trị nào. Xong là Loa chạy ẩn; máy không ngủ khi Loa mở. Từ lần sau Loa tự mở khi bạn đăng nhập máy, không hỏi gì. Khoá tự gia hạn khi Loa chạy, chỉ hết hạn sau 30 ngày không dùng. Không dán khoá vào chat.

Máy đã bật Loa trước khi đổi tên Nếp: gõ **bật Loa** thêm một lần; khoá cũ còn thì giữ, không hỏi lại.

### File .zip (để thử)

```
node scripts/plugin-zip.mjs nep.zip
```

Ở [Customize > Plugins](https://claude.ai/customize/plugins): **Add**, **Upload plugin**, chọn `nep.zip`. File .zip không tự cập nhật, nên mọi người dùng đường cài ở trên.

### Bộ ca "người không rành" (trước mỗi lần tăng bản gói)

```
node scripts/persona-suite.mjs
```

Chạy bảy câu người thật đã gõ ("chào em", "Nếp có gì mới không em?"…) qua Claude Code không giao diện với gói ở thư mục này (`--plugin <thư mục>` để thử gói khác, `--only id,id` chạy vài ca, `--out file.json` ghi kết quả, `--no-update` không cho chạy lệnh cập nhật gói, `--runs N` số lần chạy mỗi ca, mặc định 3). Tự chấm: chữ đầu ≤15 giây (trung vị của ba lần, ghi cả ba số) tính từ lúc phiên mở (thời gian khởi động riêng in thành cột "khởi động", dấu vết công cụ từng ca in dưới bảng), "chào em" ≤4 dòng, không chữ cấm và không câu tiếng Anh (hai điều này phải đạt cả ba lần; số phiên Claude khác đang chạy lúc đo được ghi kèm); mã thoát 1 nếu có ca trượt. Điều còn lại, không chỉ tới nút hay trang không có thật, do dân làng Trải nghiệm đọc câu trả lời script in ra. Thêm ca hay sửa chữ cấm: sửa `scripts/persona-cases.json`, không đụng code. Cần Claude thật và hạn mức nên không chạy trong CI; Người duyệt golive (Tech Lead) chỉ duyệt bản gói lên `main` khi có kết quả đạt ghi trên việc 26f86f3d. Ca chạy bằng tài khoản thật trên giếng thật: Claude chỉ được tự gọi công cụ đọc của Nếp (`readTools` trong file ca) và đúng các lệnh cập nhật gói (`commandTools`, thật sự cập nhật gói đã cài trên máy chạy; `--no-update` tắt các lệnh này); công cụ ghi (`writeTools`) bị chặn hẳn, ca nào cần ghi thì chấm ở câu trả lời Claude định làm. Hook của gói thì không chặn được: mỗi ca vẫn lưu một lượt chat (câu hỏi giả) và báo một phiên lên giếng, nên chạy bộ ca là có ghi thật, bảy ca ba lần thì hai mươi mốt lượt.

### Kiểm

```
node --test test/*.test.mjs
claude plugin validate .
claude plugin validate ./plugins/tinh-nlh
```
