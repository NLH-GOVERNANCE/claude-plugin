#!/bin/bash
# Loa tỉnh NhiLe on macOS. The "Loa tỉnh NhiLe.command" desktop file (made by the "bật Loa" command, setup.sh) opens
# this file from the copy in ~/.tinh-nlh/speaker, so a plugin installed from claude.ai or from GitHub both work, no repo.
# Each launch: take the newest Loa from the installed plugin; install Claude Code or Node if missing (official builds,
# hash checked); if no key is saved, ask for it with the "Cho phép" button (pair.mjs, Keychain); then open Claude Code on Sonnet as Loa.
# Same steps as start.ps1 on Windows.
set -u

DIR="${SPEAKER_DIR:-$HOME/.tinh-nlh/speaker}"
WORK="${SPEAKER_WORK:-$HOME/TinhNhiLe}"
PLUGINS="$HOME/.claude/plugins"
# The key lives in the macOS account Keychain under this service and account; the speaker channel reads the same names.
SERVICE=tinh-nlh-tower
ACCOUNT=tinh-nlh
SECURITY="${SPEAKER_SECURITY:-/usr/bin/security}"

stop_loa() {
  printf '\n%s\n' "$1"
  read -r -p 'Bấm Enter để đóng. ' _
  exit 1
}

# Is $1 newer than $2 (versions a.b.c)? Empty $2 counts as older.
newer() {
  [ -z "$2" ] && return 0
  [ "$1" = "$2" ] && return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)" = "$1" ]
}

printf '\033]0;Loa tỉnh NhiLe\007'
mkdir -p "$DIR"

# 1. Newest Loa from the installed plugin (the plugin updates itself). Copy over the one in $DIR, used from this launch.
best=""
best_root=""
for file in "$PLUGINS"/cache/*/nlh/*/.claude-plugin/plugin.json "$PLUGINS"/synced/*/*/.claude-plugin/plugin.json; do
  [ -f "$file" ] || continue
  grep -q '"name": *"nlh"' "$file" || continue
  root="$(dirname "$(dirname "$file")")"
  [ -f "$root/speaker/start.sh" ] || continue
  version="$(sed -n 's/^ *"version": *"\([0-9.]*\)".*/\1/p' "$file" | head -n 1)"
  [ -n "$version" ] || continue
  if newer "$version" "$best"; then best="$version"; best_root="$root"; fi
done
current="$(cat "$DIR/version.txt" 2>/dev/null)"
if [ -n "$best_root" ] && { [ -z "$current" ] || [ "$best" = "$current" ] || newer "$best" "$current"; }; then
  # This launcher is not the plugin's newest one (an update came): run the new one right away, once, instead of using it
  # only from the next launch (17e647c1, 26/10: the first launch after the update still set the old 10-minute loop).
  stale=""
  cmp -s "$0" "$best_root/speaker/start.sh" || stale=1
  cp "$best_root/speaker/speaker.mjs" "$DIR/speaker.mjs"
  cp "$best_root/speaker/pair.mjs" "$DIR/pair.mjs"
  # A new file, not written over the one bash is reading now.
  cp "$best_root/speaker/start.sh" "$DIR/start.sh.new" && chmod +x "$DIR/start.sh.new" && mv -f "$DIR/start.sh.new" "$DIR/start.sh"
  printf '%s\n' "$best" > "$DIR/version.txt"
  if [ -n "$stale" ] && [ -z "${SPEAKER_RELAUNCHED:-}" ]; then
    SPEAKER_RELAUNCHED=1 exec /bin/bash "$DIR/start.sh"
  fi
fi
SPEAKER="$DIR/speaker.mjs"
[ -f "$SPEAKER" ] || stop_loa 'Chưa thấy plugin Nếp trên máy. Trong app Claude, mở mục Code, gõ "bật Loa", rồi bấm đúp Loa lại.'

# 2. Claude Code. The official installer (claude.ai/install.sh) puts claude in ~/.local/bin.
CLAUDE="$HOME/.local/bin/claude"
if [ ! -x "$CLAUDE" ]; then
  if command -v claude >/dev/null 2>&1; then
    CLAUDE="$(command -v claude)"
  else
    echo 'Lần đầu: đang cài Claude Code cho máy này, khoảng một phút.'
    curl -fsSL https://claude.ai/install.sh | bash
    [ -x "$CLAUDE" ] || stop_loa 'Chưa cài được Claude Code. Kiểm mạng rồi bấm đúp Loa lại.'
  fi
fi

# 3. Node (the speaker channel is one JavaScript file). Use Node 18+ if present; otherwise download nodejs.org's build into
# $DIR/node once, checking SHA-256 against that release's SHASUMS256.txt.
NODE=""
if command -v node >/dev/null 2>&1; then
  major="$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')"
  [ -n "$major" ] && [ "$major" -ge 18 ] && NODE="$(command -v node)"
fi
if [ -z "$NODE" ]; then
  NODE="$DIR/node/bin/node"
  if [ ! -x "$NODE" ]; then
    echo 'Lần đầu: đang tải phần chạy của Loa, khoảng một phút.'
    case "$(uname -m)" in arm64) arch=darwin-arm64 ;; *) arch=darwin-x64 ;; esac
    base=https://nodejs.org/dist/latest-v22.x
    line="$(curl -fsSL "$base/SHASUMS256.txt" | grep -E "^[0-9a-f]{64}  node-v[0-9.]+-$arch\.tar\.gz$" | head -n 1)"
    [ -n "$line" ] || stop_loa 'Chưa tải được phần chạy của Loa. Kiểm mạng rồi bấm đúp Loa lại.'
    hash="${line%% *}"
    name="${line##* }"
    part="$DIR/node.tar.gz.part"
    if curl -fsSL "$base/$name" -o "$part" && [ "$(shasum -a 256 "$part" | cut -d ' ' -f 1)" = "$hash" ]; then
      rm -rf "$DIR/node" && mkdir -p "$DIR/node" && tar -xzf "$part" -C "$DIR/node" --strip-components 1 "${name%.tar.gz}/bin/node"
    fi
    rm -f "$part"
    [ -x "$NODE" ] || stop_loa 'Chưa tải được phần chạy của Loa. Kiểm mạng rồi bấm đúp Loa lại.'
  fi
fi

# 4. Loa key: if none, the machine makes its own key and asks for it with the "Cho phép" button (pair.mjs, item D): it sends
# only the key's hash, opens the Nếp page of a short code, and saves the key to the Keychain (only this macOS account can open
# it) once the person pressed Cho phép. The key never goes through the hub, the web, chat or the screen. A key the hub
# rejects is removed by the channel and asked again next launch.
if ! "$SECURITY" find-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1; then
  [ -f "$DIR/pair.mjs" ] || stop_loa 'Chưa thấy phần xin khoá của Loa. Trong app Claude, mở mục Code, gõ "bật Loa", rồi bấm đúp Loa lại.'
  echo ''
  echo 'Loa cần được bạn cho phép một lần. Trang Nếp sắp mở: bấm Cho phép.'
  "$NODE" "$DIR/pair.mjs" --dir "$DIR" || stop_loa 'Chưa có khoá cho Loa.'
fi

# 5. Channel config for this session only: NLH_TOWER=1 lives only here, so no other Claude Code session on the machine
# (nor the plugin's own speaker server) reads the feed. CLAUDE_BIN and NLH_TOWER_WORK let the channel look up, resume
# and open sessions. Node writes the JSON so paths with spaces stay right.
CONFIG="$DIR/speaker-mcp.json"
# Loa needs no hook of the plugin: they call the Nếp connector, which the Loa session (only server speaker) does not
# have, so each turn printed about ten "Stop hook error: MCP server ... not connected" lines (17e647c1, 26/10). This
# session only: disableAllHooks, read from a file so no JSON quoting goes through the command line.
SETTINGS="$DIR/speaker-settings.json"
printf '%s\n' '{ "disableAllHooks": true }' > "$SETTINGS" || stop_loa 'Chưa ghi được cấu hình của Loa.'
"$NODE" -e '
const [node, speaker, dir, origin, claude, work] = process.argv.slice(1);
const env = { NLH_TOWER: "1", NLH_TOWER_DIR: dir, NLH_TOWER_WORK: work, CLAUDE_BIN: claude };
if (origin) env.TOWER_ORIGIN = origin;
process.stdout.write(JSON.stringify({ mcpServers: { speaker: { command: node, args: [speaker], env } } }, null, 2));
' "$NODE" "$SPEAKER" "$DIR" "${TOWER_ORIGIN:-}" "$CLAUDE" "$WORK" > "$CONFIG" || stop_loa 'Chưa ghi được cấu hình của Loa.'

# 6. Open Claude Code in its own work folder (new cell sessions open here too). claude and node go on the session PATH
# so plugin hooks run.
mkdir -p "$WORK"
cd "$WORK" || stop_loa 'Chưa mở được thư mục làm việc của Loa.'
export PATH="$(dirname "$CLAUDE"):$(dirname "$NODE"):$PATH"
echo ''
echo 'Loa đang nghe Nếp. Đừng đóng cửa sổ này.'
if [ ! -f "$DIR/opened.txt" ]; then
  echo 'Lần đầu Claude Code hỏi vài câu: bấm Enter để chọn sẵn. Tới bước đăng nhập, trình duyệt mở ra: bấm Authorize, quay lại đây bấm Enter.'
fi
echo 'Mỗi lần mở, hộp "Loading development channels" hiện ra: chọn "I am using this for local development", bấm Enter.'
echo 'Dòng vàng "no MCP server configured with that name" là Claude Code báo nhầm: Loa vẫn nối. Bỏ qua dòng đó.'
echo ''
# With the channel, the opening prompt runs the skill once, no loop: the channel pushes each item (17e647c1 part 4, saves
# tokens). Only the fallback without the channel keeps the 10-minute loop over the pending tool.
LOOP='/loop 10m /nlh:speaker-loop'
set -- /nlh:speaker-loop -n 'Loa tỉnh NhiLe' --model sonnet --settings "$SETTINGS" --mcp-config "$CONFIG" --dangerously-load-development-channels server:speaker
if [ -n "${SPEAKER_DRY_RUN:-}" ]; then
  printf 'DRYRUN %s' "$CLAUDE"
  printf ' | %s' "$@"
  printf '\n'
  printf 'DRYRUN-FALLBACK %s' "$CLAUDE"
  printf ' | %s' "$LOOP" "${@:2:$#-3}"
  printf '\n'
  exit 0
fi
date -u +%Y-%m-%dT%H:%M:%SZ > "$DIR/opened.txt"
# Keep the machine awake while Loa is open; caffeinate ends with this shell. The screen may still turn off.
[ -x /usr/bin/caffeinate ] && /usr/bin/caffeinate -i -w $$ &
# The opening prompt goes before the flags: the channel flag takes several values, a prompt after it reads as a name.
started=$(date +%s)
if ! "$CLAUDE" "$@"; then
  # Claude quit within a minute (channel refused, or the channel dialog declined): run again without the channel.
  [ $(( $(date +%s) - started )) -lt 60 ] || stop_loa 'Loa dừng vì lỗi ở trên. Bấm đúp Loa để mở lại.'
  printf '\n%s\n' 'Kênh báo nhanh chưa mở được. Loa vẫn chạy, mỗi 10 phút xem việc một lần.'
  "$CLAUDE" "$LOOP" "${@:2:$#-3}" || stop_loa 'Loa dừng vì lỗi ở trên. Bấm đúp Loa để mở lại.'
fi
