#!/bin/bash
# The "bật Loa" command (/tinh-nlh:speaker) runs this on macOS, once per machine. Copies Loa from the plugin to
# ~/.tinh-nlh/speaker (a fixed place plugin updates do not wipe), then makes "Loa tỉnh NhiLe.command" on the Desktop:
# double-click opens Loa in Terminal. A file of the same name pointing elsewhere is kept; the old "Tháp tỉnh
# NhiLe.command" that pointed to Loa's earlier launcher is removed. Never asks for the key. A LaunchAgent opens Loa
# in Terminal at every login (ticket 98bd8b93, line 4b62d007 point 3). Same steps as setup.ps1.
set -eu

DIR="${SPEAKER_DIR:-$HOME/.tinh-nlh/speaker}"
DESKTOP="${SPEAKER_DESKTOP:-$HOME/Desktop}"
AGENTS="${SPEAKER_AGENTS:-$HOME/Library/LaunchAgents}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$(dirname "$HERE")"
version="$(sed -n 's/^ *"version": *"\([0-9.]*\)".*/\1/p' "$PLUGIN/.claude-plugin/plugin.json" | head -n 1)"

mkdir -p "$DIR"
cp "$HERE/start.sh" "$DIR/start.sh"
chmod +x "$DIR/start.sh"
cp "$HERE/speaker.mjs" "$DIR/speaker.mjs"
cp "$HERE/pair.mjs" "$DIR/pair.mjs"
cp "$HERE/policy.mjs" "$DIR/policy.mjs"
printf '%s\n' "$version" > "$DIR/version.txt"

name='Loa tỉnh NhiLe'
link="$DESKTOP/$name.command"
# Open Loa at every login: a LaunchAgent of the user's own opens the launcher in Terminal. Takes effect from the next
# login; writing it again replaces it.
if [ -z "${SPEAKER_NO_AUTOSTART:-}" ]; then
  mkdir -p "$AGENTS"
  cat > "$AGENTS/vn.nlh.tinh-nlh.speaker.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>vn.nlh.tinh-nlh.speaker</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/open</string><string>-a</string><string>Terminal</string><string>$DIR/start.sh</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
  echo 'Loa sẽ tự mở mỗi khi bạn đăng nhập máy.'
fi
old="$DESKTOP/Tháp tỉnh NhiLe.command"
if [ -e "$old" ] && grep -qF "/.tinh-nlh/" "$old"; then
  rm -f "$old"
  echo 'Đã bỏ biểu tượng cũ Tháp tỉnh NhiLe.'
fi
if [ -e "$link" ] && ! grep -qF "/.tinh-nlh/" "$link"; then
  echo "Trên màn hình chính đã có lối tắt $name khác, giữ nguyên lối tắt đó."
  exit 0
fi
cat > "$link" <<EOF
#!/bin/bash
# Double-click to open Loa tỉnh NhiLe. Made by the "bật Loa" command of plugin tinh-nlh.
exec /bin/bash "$DIR/start.sh"
EOF
chmod +x "$link"
echo "Đã có biểu tượng $name trên màn hình chính."
