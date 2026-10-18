#!/bin/bash
# The "bật Loa" command (/tinh-nlh:batthap) runs this on macOS, once per machine. Copies Loa from the plugin to
# ~/.tinh-nlh/thap (a fixed place plugin updates do not wipe), then makes "Loa tỉnh NhiLe.command" on the Desktop:
# double-click opens Loa in Terminal. A file of the same name pointing elsewhere is kept; the old "Tháp tỉnh
# NhiLe.command" that pointed to Loa's earlier launcher is removed. Never asks for the key. Same steps as setup.ps1.
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

name='Loa tỉnh NhiLe'
link="$DESKTOP/$name.command"
old="$DESKTOP/Tháp tỉnh NhiLe.command"
if [ -e "$old" ] && grep -qF "$DIR/thap.sh" "$old"; then
  rm -f "$old"
  echo 'Đã bỏ biểu tượng cũ Tháp tỉnh NhiLe.'
fi
if [ -e "$link" ] && ! grep -qF "$DIR/thap.sh" "$link"; then
  echo "Trên màn hình chính đã có lối tắt $name khác, giữ nguyên lối tắt đó."
  exit 0
fi
cat > "$link" <<EOF
#!/bin/bash
# Double-click to open Loa tỉnh NhiLe. Made by the "bật Loa" command of plugin tinh-nlh.
exec /bin/bash "$DIR/thap.sh"
EOF
chmod +x "$link"
echo "Đã có biểu tượng $name trên màn hình chính."
