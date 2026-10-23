# Nếp cho Claude

Nếp là nơi cả công ty NhiLe giao việc, theo dõi việc và ký duyệt. Cài Nếp vào Claude một lần, rồi nói chuyện với Claude bằng câu thường để xem và làm việc của mình.

## Cài (một lần, ba bước bấm)

1. Cài **Nếp** từ danh mục `nlh-governance`. Trong app Claude, mục **Code**: bấm **+** cạnh ô nhập, chọn **Add plugins**, chọn **Nếp**, bấm cài cho bạn (**Install for you**). Chat và Cowork: [Customize > Plugins](https://claude.ai/customize/plugins), chọn **Nếp**. Chưa thấy danh mục thì thêm một lần: **Add marketplace**, gõ `NLH-GOVERNANCE/claude-plugin`.
2. Mở tab **Connectors** của Nếp, bấm **Connect**, bấm **Đồng ý và đăng nhập** bằng email công ty.
3. Xong. Không có lệnh nào phải gõ, không có script. Nếp tự cập nhật: lần cài đầu, Nếp bật cập nhật tự động cho danh mục `nlh-governance` (Claude Code kéo bản mới ở nền sau tin đầu tiên; phiên mới dùng bản mới, phiên đang chạy giữ bản cũ tới hết, không phải mở lại Claude).

Đã cài từ trước, khi còn tên "tỉnh NhiLe": Nếp tự chuyển sang tên mới, không phải cài lại. Nếu Claude báo không thấy Nếp, làm lại bước 1; nếu báo chưa đăng nhập, làm lại bước 2.

Máy cần Node 18 trở lên ([nodejs.org](https://nodejs.org), một lần): lệnh `node` chạy các hook và Loa Làng của Nếp. Thiếu Node thì các hook im lặng không chạy.

Dùng Claude Code ở terminal thì cài bằng hai dòng, một lần (Nếp tự bật cập nhật như trên):

```
/plugin marketplace add NLH-GOVERNANCE/claude-plugin
/plugin install nlh@nlh-governance
```

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

Nếp tự cập nhật (Claude Code kéo bản mới ở nền; plugin cài từ claude.ai thì bấm **Check for updates**, hoặc bật **Sync automatically**). Telegram là tuỳ chọn, chỉ để ký ngay trong nhóm.

### Loa Làng (Windows và Mac, tuỳ chọn, tự chạy)

Loa Làng ngồi trên máy của bạn: có việc mới cho một dân làng, Loa Làng báo một câu tới đúng phiên Claude đang ngồi đó trong khoảng 15 giây; phiên đã tắt thì mở lại. Không cài gì thêm, không có biểu tượng, không có cửa sổ, không có script. Chỉ cần một khoá, một lần:

1. Ở web Nếp, mở **Kết nối**, thẻ **Khoá cho Loa trên máy**, bấm **Tạo khoá mới** và chép khoá.
2. Dán vào ô **Khoá cho Loa** trong cài đặt plugin Nếp (app Claude: Customize > Plugins > Nếp > cấu hình; Claude Code ở terminal: `/plugin`, chọn Nếp, **Configure options**). Không dán khoá vào chat.
3. Xong. Phiên Claude kế tiếp mở ra, vài giây sau Loa Làng tự chạy nền (một phiên tên "Loa Làng" trong danh sách phiên). Máy tắt rồi bật: Loa Làng mở lại ở phiên Claude đầu tiên. Gõ **bật Loa** để xem Loa Làng chạy chưa.

Plugin có bản mới thì Claude tự kéo bản mới ở nền; Loa Làng tự khởi động lại khi rảnh, giữa hai lượt, không có việc dở. Không phải mở lại Claude, không có lời nhắc mở lại. Khoá tự gia hạn khi Loa chạy, chỉ hết hạn sau 30 ngày không dùng.

Máy đã bật Loa bằng biểu tượng "Loa tỉnh NhiLe" trước đây: vẫn chạy như cũ, không phải làm gì. Muốn chuyển sang tự chạy: dán khoá vào ô ở bước 2, đóng cửa sổ Loa cũ, và bỏ biểu tượng cũ khỏi màn hình chính.

## Cho người bảo trì

- `.claude-plugin/marketplace.json`: danh mục `nlh-governance`, một plugin `nlh`. `plugins/tinh-nlh/`: plugin, xem [README của plugin](plugins/tinh-nlh/README.md). `scripts/plugin-zip.mjs`: đóng plugin thành file .zip.
- Tên: người dùng thấy **Nếp** (`displayName` trong `plugin.json` và trong danh mục; D-0055). Tên kỹ thuật `nlh`, anh Sơn chốt 19/10/2026. Tên cũ `tinh-nlh` khai ở `renames` của danh mục để máy đã cài tự chuyển; giữ dòng đó mãi, đổi tên lần nữa thì thêm dòng mới. Thư mục `plugins/tinh-nlh`, chỗ ở của Loa `~/.tinh-nlh`, tên khoá trong Keychain và tên biểu tượng Loa giữ như cũ: người dùng không gõ tới, đổi thì máy đã cài phải chuyển.
- Đổi plugin thì tăng `version` trong `plugins/tinh-nlh/.claude-plugin/plugin.json`, để người đã cài nhận bản mới.
- Trong plugin, Loa có tên tiếng Anh là speaker; hub gọi là tower (đường `/tower/feed`, khoá `nlh_tower_…`): tower = speaker.
- Loa Làng tự khởi động (việc 0f936d79, 23/10; tên trong mã vẫn là speaker, hub gọi là tower). Kênh (`--channels`, `--dangerously-load-development-channels`) chỉ nạp được khi người mở phiên truyền cờ, và cờ thứ hai hỏi mỗi lần; plugin không bật được, phiên nền thì bỏ qua cờ (thử trên Claude Code 2.1.309). Nên: máy chủ MCP `speaker` của plugin chạy trong mọi phiên có plugin; ở phiên thường, một giây sau khi nối, nó gọi `ensureLoa` (`speaker/loa.mjs`): có khoá (ô "Khoá cho Loa" của plugin, hay file DPAPI / Keychain của biểu tượng cũ) mà chưa có Loa (`tower.lock` còn pid sống, hay phiên tên "Loa Làng" hoặc "Loa tỉnh NhiLe" đang chạy) thì mở một phiên nền `claude --bg -n "Loa Làng"` với `--settings` đặt `NLH_TOWER=1`, `NLH_LOA=monitor`, `NLH_TOWER_DIR`, `NLH_TOWER_WORK`, `CLAUDE_BIN`. Đường claude lấy theo thứ tự `CLAUDE_BIN`, `CLAUDE_CODE_EXECPATH` (claude của chính app Claude), `~/.local/bin/claude`, rồi tên `claude` trên PATH. Khoá `loa-launch.lock` chặn mở trùng trong 3 phút. Phiên Loa chỉ được chạy `SendMessage`, `Skill` và hai công cụ của speaker mà không hỏi. Trong phiên đó máy chủ speaker là bên đọc luồng việc, ghi mỗi tin vào `loa-outbox.jsonl` thay vì đẩy kênh; monitor `loa` của plugin (`monitors/monitors.json`, `speaker/watch.mjs`, `when` là `on-skill-invoke:nlh:speaker-loop`: chỉ chạy khi mô hình gọi skill bằng công cụ Skill, gõ `/nlh:speaker-loop` thì không chạy) in mỗi dòng `LOA {json}` vào phiên; một dòng in ra là đánh thức phiên đang rảnh, nên không tốn token khi chưa có việc. Skill `speaker-loop` biến mỗi dòng thành một `SendMessage`. Bản mới: máy chủ Loa mỗi phút nhìn `installed_plugins.json`; thấy bản trên đĩa mới hơn bản đang chạy, không còn tin chờ gửi và một phút không có dòng mới thì chạy `loa.mjs relaunch` của chính bản mới: dừng phiên Loa cũ, đợi khoá nhả, mở phiên mới. Chưa làm: khoá bị từ chối thì thông báo chỉ nằm trong phiên Loa nền, chưa báo ra cho người dùng.
- Tự cập nhật: không có hook cập nhật nào của mình. Claude Code có sẵn cập nhật theo danh mục (`autoUpdate` ở `extraKnownMarketplaces` của file cài đặt, hay nút **Enable auto-update** ở `/plugin` > **Marketplaces**), mặc định tắt với danh mục ngoài Anthropic. Hook `hooks/auto-update.mjs` (SessionStart) chỉ ghi `extraKnownMarketplaces["nlh-governance"].autoUpdate = true` vào `~/.claude/settings.json` (hay `CLAUDE_CONFIG_DIR`) khi chưa ai đặt, ở cả file đó lẫn `known_marketplaces.json`; người đã tắt bằng nút thì giữ. Một khoá, giữ nguyên thụt dòng, thay file bằng một lần đổi tên. Lịch của Claude Code: sau tin đầu tiên của phiên, chờ ngẫu nhiên tới 10 phút, kéo danh mục rồi cập nhật plugin trên đĩa; phiên đang chạy giữ bản cũ (muốn dùng ngay thì `/reload-plugins`), phiên mới dùng bản mới. Phải tăng `version` trong `plugin.json` thì mới có bản mới. Nếu máy báo "đã mới nhất" mà bản vẫn cũ (bản sao danh mục kéo về mà tệp không đổi): `claude plugin marketplace update nlh-governance`, rồi `claude plugin update nlh@nlh-governance`; vẫn không đổi thì xoá thư mục `~/.claude/plugins/marketplaces/nlh-governance` và thêm lại danh mục (cách gỡ theo tài liệu, chưa gặp lỗi này trong lúc làm).
- Cách cũ cho máy đã cài, vẫn giữ: lệnh `/nlh:speaker` khi người dùng đòi biểu tượng thì chạy `speaker/setup.ps1` (Windows) hay `speaker/setup.sh` (macOS): chép Loa sang `~/.tinh-nlh/speaker` và tạo lối tắt "Loa tỉnh NhiLe" trên Desktop (tên biểu tượng và tác vụ tự mở giữ nguyên; tên phiên, tên cửa sổ và mọi chữ trong phiên đã là "Loa Làng"). Đã có lối tắt cùng tên trỏ chỗ khác thì giữ nguyên; lối tắt cũ "Tháp tỉnh NhiLe" hay "Loa tỉnh NhiLe" trỏ tới bản Loa cũ của mình (`~/.tinh-nlh`) thì tự thay.
- Lối tắt mở `speaker/start.ps1` hay `speaker/start.sh`: lấy bản mới nhất của Loa từ plugin `nlh` đã cài, tự cài Claude Code (`claude.ai/install.ps1`, `install.sh`) và Node (`nodejs.org`, kiểm SHA-256) khi thiếu, hỏi khoá trong ô nhập ẩn chữ, lưu bằng DPAPI (Windows) hay Keychain (macOS), rồi mở Claude Code chạy Sonnet ở `~/TinhNhiLe`. Bản Loa chép trước khi đổi tên chỉ tìm plugin `tinh-nlh`, nên máy cũ cần "bật Loa" một lần nữa.
- Cách báo (`speaker/speaker.mjs`): hub gắn vào mỗi việc mã phiên đã ngồi ô đó (`report_session`). Kênh tra mã trong `claude agents --json --all`: phiên đang chạy thì phiên Loa gửi bằng `SendMessage`; phiên đã tắt thì `claude --bg --resume <mã>` ở thư mục cũ của phiên; chưa có mã hay mã không còn thì tìm phiên đang chạy có tên chứa "(người/tên gọi)" của ô; không thấy mới mở phiên nền mới tên "Ô <tên ô> (<người>/<tên gọi đầu>)", ví dụ "Ô CTO (son/cto)". Phiên tương tác đang mở của dân làng (tên có "(người/tên gọi)" hay đã `report_session`) luôn được chọn trước phiên nền; phiên nền trùng với nó thì Loa dừng (`claude stop`), mỗi phút soát một lần (việc 5d66123d). Mỗi lần báo ghi một dòng sổ (`POST /tower/forwards`: phiếu, ô, phiên, cách báo, được hay hỏng, không nội dung); `show_stats` đếm theo ngày. Câu báo chỉ nói ô và phiếu; Loa không đọc nội dung phiếu.
- Nhắc lại (việc 6beaa750): việc mới của dân làng hay lời gọi trong nhóm mà Loa đã báo, sau 30 phút vẫn còn trong luồng việc, chưa ai nhận, thì Loa nhắc đúng phiên đã báo một câu "vẫn chưa ai nhận", tối đa 3 lần, cách nhau 30 phút; không mở phiên mới để nhắc, không nhắc vào nhóm hay người, không nhắc việc chờ chính bạn. Câu trả lời mới (kể cả chữ ký của người được xin ký) báo một lần cho dân làng đã hỏi, không nhắc "chưa ai nhận" (việc c65f35ed). Mỗi lần nhắc ghi một dòng sổ như lần báo đầu, mã mục bắt đầu bằng `remind<n>:`. Việc đã rời luồng (đã nhận, đã trả lời, đã đóng) thì quên luôn. Câu trả lời mới chờ 2 phút rồi mới báo, và chỉ báo nếu việc còn trong luồng; việc dân làng tự mở cho chính mình thì không báo. Kiểm bằng một lần đọc luồng việc thêm, nhiều nhất mỗi phút một lần và chỉ khi có mục tới hạn; không tốn token AI.
- Tự mở khi đăng nhập: setup đăng ký tác vụ "Loa tỉnh NhiLe" của chính người dùng ở Task Scheduler (Windows, không cần quyền quản trị) hay LaunchAgent `vn.nlh.tinh-nlh.speaker` (macOS). Khi Loa mở, máy không ngủ (`SetThreadExecutionState` trên Windows, `caffeinate` trên macOS). Claude thoát trong một phút đầu (kênh bị chặn, hay bấm không ở hộp kênh thử) thì lối mở chạy lại không cờ kênh, chỉ nhịp 10 phút qua công cụ `pending`, in một dòng.
- Cách cũ (cửa sổ có cờ kênh): kênh `speaker` nạp qua `--mcp-config` với `--dangerously-load-development-channels server:speaker`, không qua tên plugin: plugin cài từ claude.ai mang tên `nlh@synced`, Claude Code chỉ nhận kênh của plugin cài từ chợ. `NLH_TOWER=1` chỉ nằm trong cấu hình kênh, nên các phiên khác trên máy không đọc luồng việc; phiên Loa mở cũng không mang `NLH_TOWER*`, nên không giữ khoá Loa khi Loa tắt.
- Cờ `--dangerously-load-development-channels`: kênh tự làm chưa nằm trong danh sách kênh Anthropic duyệt sẵn (research preview), nên Claude Code chỉ nạp khi mình nói rõ đang thử, hỏi lại mỗi lần mở. Vì sao an toàn: kênh do repo này viết, chỉ đọc việc của chính bạn bằng khoá riêng, chỉ gửi khoá tới `*.nlh.vn`; không nhận duyệt quyền từ xa; luật của tổ chức (`channelsEnabled`) vẫn áp dụng. Một máy chỉ chạy một Loa.

### Khi có tổ chức Team hoặc Enterprise

Chưa dùng. Owner đồng bộ repo này ở [Organization settings > Plugins & skills](https://claude.ai/admin-settings/skills?tab=inventory) (**Add**, **Sync from GitHub**), đặt `nlh` là **Required**, và thêm connector `https://mcp.nlh.vn/mcp` ở [Organization settings > Connectors](https://claude.ai/admin-settings/connectors).

### File .zip (để thử)

```
node scripts/plugin-zip.mjs nep.zip
```

Ở [Customize > Plugins](https://claude.ai/customize/plugins): **Add**, **Upload plugin**, chọn `nep.zip`. Rồi làm bước 3. File .zip không tự cập nhật, nên mọi người dùng đường cài ở trên.

### Kiểm

```
node --test test/*.test.mjs
claude plugin validate .
claude plugin validate ./plugins/tinh-nlh
```
