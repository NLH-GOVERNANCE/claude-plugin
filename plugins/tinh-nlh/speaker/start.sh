#!/bin/bash
# Loa Làng on macOS (named Loa tỉnh NhiLe before 23/10). The "Loa tỉnh NhiLe.command" desktop file (made by the "bật Loa" command, setup.sh) opens
# this file from the copy in ~/.tinh-nlh/speaker, so a plugin installed from claude.ai or from GitHub both work, no repo.
# Each launch: take the newest Loa from the installed plugin; install Claude Code or Node if missing (official builds,
# hash checked); ask for the key in a hidden prompt if none is saved (Keychain); then open Claude Code on Sonnet as Loa.
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

printf '\033]0;Loa Làng\007'
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
  cp "$best_root/speaker/speaker.mjs" "$DIR/speaker.mjs"
  cp "$best_root/speaker/start.sh" "$DIR/start.sh"
  chmod +x "$DIR/start.sh"
  printf '%s\n' "$best" > "$DIR/version.txt"
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

# 4. Loa key: if none, ask in a hidden prompt, check its shape, save to the Keychain (only this macOS account can open
# it). The key reaches security through stdin (security -i), never a command line, the screen or Claude's environment.
# A key the hub rejects is removed by the channel and asked again next launch.
if ! "$SECURITY" find-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1; then
  echo ''
  echo 'Lấy khoá ở web Nếp: Kết nối, Khoá cho Loa trên máy, Tạo khoá mới. Chép khoá rồi dán vào đây.'
  echo 'Chữ không hiện ra khi dán, đó là bình thường. Dán xong bấm Enter.'
  saved=""
  for _ in 1 2 3; do
    IFS= read -r -s -p 'Khoá cho Loa: ' key
    echo ''
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    if [[ "$key" =~ ^nlh_tower_[0-9a-f]{64}$ ]]; then
      printf 'add-generic-password -U -s %s -a %s -w %s\n' "$SERVICE" "$ACCOUNT" "$key" | "$SECURITY" -i >/dev/null 2>&1 && saved=1
      key=""
      [ -n "$saved" ] || stop_loa 'Chưa lưu được khoá vào Keychain. Bấm đúp Loa lại.'
      echo 'Đã lưu khoá Loa trên máy này.'
      break
    fi
    key=""
    echo 'Chuỗi vừa dán không phải khoá Loa (bắt đầu bằng nlh_tower_). Dán lại.'
  done
  [ -n "$saved" ] || stop_loa 'Chưa lưu khoá. Bấm đúp Loa lại khi đã có khoá.'
fi

# 5. Channel config for this session only: NLH_TOWER=1 lives only here, so no other Claude Code session on the machine
# (nor the plugin's own speaker server) reads the feed. CLAUDE_BIN and NLH_TOWER_WORK let the channel look up, resume
# and open sessions. Node writes the JSON so paths with spaces stay right.
CONFIG="$DIR/speaker-mcp.json"
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
echo ''
set -- '/loop 10m /nlh:speaker-loop' -n 'Loa Làng' --model sonnet --mcp-config "$CONFIG" --dangerously-load-development-channels server:speaker
if [ -n "${SPEAKER_DRY_RUN:-}" ]; then
  printf 'DRYRUN %s' "$CLAUDE"
  printf ' | %s' "$@"
  printf '\n'
  printf 'DRYRUN-FALLBACK %s' "$CLAUDE"
  printf ' | %s' "${@:1:$#-2}"
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
  "$CLAUDE" "${@:1:$#-2}" || stop_loa 'Loa dừng vì lỗi ở trên. Bấm đúp Loa để mở lại.'
fi
