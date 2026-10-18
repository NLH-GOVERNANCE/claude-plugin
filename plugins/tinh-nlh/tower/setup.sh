#!/bin/bash
# Lệnh "bật Tháp" (/tinh-nlh:batthap) chạy file này trên macOS, một lần mỗi máy. Chép Tháp từ plugin sang
# ~/.tinh-nlh/thap (chỗ cố định, plugin cập nhật không làm mất), rồi tạo "Tháp tỉnh NhiLe.command" trên Desktop: bấm đúp
# là Terminal mở Tháp. Đã có tệp cùng tên trỏ chỗ khác thì giữ nguyên, không ghi đè. Không tự chạy cùng máy, không hỏi
# khoá: khoá hỏi lúc bấm đúp Tháp lần đầu. Cùng cách với setup.ps1 của Windows.
set -eu

DIR="${THAP_DIR:-$HOME/.tinh-nlh/thap}"
DESKTOP="${THAP_DESKTOP:-$HOME/Desktop}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$(dirname "$HERE")"
version="$(sed -n 's/^ *"version": *"\([0-9.]*\)".*/\1/p' "$PLUGIN/.claude-plugin/plugin.json" | head -n 1)"

mkdir -p "$DIR"
cp "$HERE/thap.sh" "$DIR/thap.sh"
chmod +x "$DIR/thap.sh"
cp "$PLUGIN/channel/tower.mjs" "$DIR/tower.mjs"
printf '%s\n' "$version" > "$DIR/version.txt"

name='Tháp tỉnh NhiLe'
link="$DESKTOP/$name.command"
if [ -e "$link" ] && ! grep -qF "$DIR/thap.sh" "$link"; then
  echo "Trên màn hình chính đã có lối tắt $name khác, giữ nguyên lối tắt đó."
  exit 0
fi
cat > "$link" <<EOF
#!/bin/bash
# Bấm đúp để mở Tháp tỉnh NhiLe. Tệp này do lệnh "bật Tháp" của plugin tinh-nlh tạo.
exec /bin/bash "$DIR/thap.sh"
EOF
chmod +x "$link"
echo "Đã có biểu tượng $name trên màn hình chính."
