#!/bin/bash
# Tháp tỉnh NhiLe trên macOS. Biểu tượng "Tháp tỉnh NhiLe.command" trên Desktop (do lệnh "bật Tháp", setup.sh, tạo) mở
# file này từ bản chép ở ~/.tinh-nlh/thap, nên plugin cài từ claude.ai hay từ GitHub đều chạy được, không cần repo.
# Mỗi lần mở: lấy bản mới nhất của Tháp từ plugin đã cài; máy chưa có Claude Code hay Node thì tự cài (bản chính thức,
# kiểm mã băm); chưa có khoá thì hỏi trong ô nhập ẩn chữ, lưu vào Keychain; rồi mở Claude Code chạy Sonnet, ngồi ô Tháp.
# Cùng cách với thap.ps1 của Windows. Không tự chạy cùng máy.
set -u

DIR="${THAP_DIR:-$HOME/.tinh-nlh/thap}"
WORK="${THAP_WORK:-$HOME/TinhNhiLe}"
PLUGINS="$HOME/.claude/plugins"
# Khoá nằm trong Keychain của tài khoản macOS: dịch vụ và tài khoản này, kênh tower đọc đúng hai tên đó.
SERVICE=tinh-nlh-tower
ACCOUNT=tinh-nlh
SECURITY="${THAP_SECURITY:-/usr/bin/security}"

stop_thap() {
  printf '\n%s\n' "$1"
  read -r -p 'Bấm Enter để đóng. ' _
  exit 1
}

# $1 mới hơn $2 (số phiên bản a.b.c)? $2 trống thì có.
newer() {
  [ -z "$2" ] && return 0
  [ "$1" = "$2" ] && return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)" = "$1" ]
}

printf '\033]0;Tháp tỉnh NhiLe\007'
mkdir -p "$DIR"

# 1. Bản mới nhất của Tháp từ plugin đã cài (plugin tự cập nhật). Chép đè bản ở $DIR, dùng từ lần mở này.
best=""
best_root=""
for file in "$PLUGINS"/cache/*/tinh-nlh/*/.claude-plugin/plugin.json "$PLUGINS"/synced/*/*/.claude-plugin/plugin.json; do
  [ -f "$file" ] || continue
  grep -q '"name": *"tinh-nlh"' "$file" || continue
  root="$(dirname "$(dirname "$file")")"
  [ -f "$root/tower/thap.sh" ] || continue
  version="$(sed -n 's/^ *"version": *"\([0-9.]*\)".*/\1/p' "$file" | head -n 1)"
  [ -n "$version" ] || continue
  if newer "$version" "$best"; then best="$version"; best_root="$root"; fi
done
current="$(cat "$DIR/version.txt" 2>/dev/null)"
if [ -n "$best_root" ] && { [ -z "$current" ] || [ "$best" = "$current" ] || newer "$best" "$current"; }; then
  cp "$best_root/channel/tower.mjs" "$DIR/tower.mjs"
  cp "$best_root/tower/thap.sh" "$DIR/thap.sh"
  chmod +x "$DIR/thap.sh"
  printf '%s\n' "$best" > "$DIR/version.txt"
fi
TOWER="$DIR/tower.mjs"
[ -f "$TOWER" ] || stop_thap 'Chưa thấy plugin Tỉnh NhiLe trên máy. Trong app Claude, mở mục Code, gõ "bật Tháp", rồi bấm đúp Tháp lại.'

# 2. Claude Code. Trình cài chính thức (claude.ai/install.sh) đặt claude ở ~/.local/bin.
CLAUDE="$HOME/.local/bin/claude"
if [ ! -x "$CLAUDE" ]; then
  if command -v claude >/dev/null 2>&1; then
    CLAUDE="$(command -v claude)"
  else
    echo 'Lần đầu: đang cài Claude Code cho máy này, khoảng một phút.'
    curl -fsSL https://claude.ai/install.sh | bash
    [ -x "$CLAUDE" ] || stop_thap 'Chưa cài được Claude Code. Kiểm mạng rồi bấm đúp Tháp lại.'
  fi
fi

# 3. Node (kênh tower là một file JavaScript). Máy có Node 18 trở lên thì dùng; không thì tải bản của nodejs.org vào
# $DIR/node một lần, kiểm mã băm SHA-256 theo SHASUMS256.txt của chính bản đó.
NODE=""
if command -v node >/dev/null 2>&1; then
  major="$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')"
  [ -n "$major" ] && [ "$major" -ge 18 ] && NODE="$(command -v node)"
fi
if [ -z "$NODE" ]; then
  NODE="$DIR/node/bin/node"
  if [ ! -x "$NODE" ]; then
    echo 'Lần đầu: đang tải phần chạy của Tháp, khoảng một phút.'
    case "$(uname -m)" in arm64) arch=darwin-arm64 ;; *) arch=darwin-x64 ;; esac
    base=https://nodejs.org/dist/latest-v22.x
    line="$(curl -fsSL "$base/SHASUMS256.txt" | grep -E "^[0-9a-f]{64}  node-v[0-9.]+-$arch\.tar\.gz$" | head -n 1)"
    [ -n "$line" ] || stop_thap 'Chưa tải được phần chạy của Tháp. Kiểm mạng rồi bấm đúp Tháp lại.'
    hash="${line%% *}"
    name="${line##* }"
    part="$DIR/node.tar.gz.part"
    if curl -fsSL "$base/$name" -o "$part" && [ "$(shasum -a 256 "$part" | cut -d ' ' -f 1)" = "$hash" ]; then
      rm -rf "$DIR/node" && mkdir -p "$DIR/node" && tar -xzf "$part" -C "$DIR/node" --strip-components 1 "${name%.tar.gz}/bin/node"
    fi
    rm -f "$part"
    [ -x "$NODE" ] || stop_thap 'Chưa tải được phần chạy của Tháp. Kiểm mạng rồi bấm đúp Tháp lại.'
  fi
fi

# 4. Khoá Tháp: chưa có thì hỏi trong ô nhập ẩn chữ, kiểm dạng khoá, lưu vào Keychain (chỉ tài khoản macOS này mở
# được). Khoá đi vào security qua stdin (security -i), không nằm trong dòng lệnh, không ra màn hình, không trong biến
# môi trường của Claude. Hub từ chối khoá thì kênh xoá mục Keychain, lần mở sau hỏi lại.
if ! "$SECURITY" find-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1; then
  echo ''
  echo 'Lấy khoá ở web tỉnh NhiLe: Kết nối, Khoá cho Tháp trên máy, Tạo khoá mới. Chép khoá rồi dán vào đây.'
  echo 'Chữ không hiện ra khi dán, đó là bình thường. Dán xong bấm Enter.'
  saved=""
  for _ in 1 2 3; do
    IFS= read -r -s -p 'Khoá cho Tháp: ' key
    echo ''
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    if [[ "$key" =~ ^nlh_tower_[0-9a-f]{64}$ ]]; then
      printf 'add-generic-password -U -s %s -a %s -w %s\n' "$SERVICE" "$ACCOUNT" "$key" | "$SECURITY" -i >/dev/null 2>&1 && saved=1
      key=""
      [ -n "$saved" ] || stop_thap 'Chưa lưu được khoá vào Keychain. Bấm đúp Tháp lại.'
      echo 'Đã lưu khoá Tháp trên máy này.'
      break
    fi
    key=""
    echo 'Chuỗi vừa dán không phải khoá Tháp (bắt đầu bằng nlh_tower_). Dán lại.'
  done
  [ -n "$saved" ] || stop_thap 'Chưa lưu khoá. Bấm đúp Tháp lại khi đã có khoá.'
fi

# 5. Cấu hình kênh tower cho đúng phiên này: NLH_TOWER=1 chỉ nằm ở đây, nên các phiên Claude Code khác trên máy
# (và server tower có sẵn của plugin) không đọc luồng việc. Node viết JSON để đường dẫn có dấu cách vẫn đúng.
CONFIG="$DIR/tower-mcp.json"
"$NODE" -e '
const [node, tower, dir, origin] = process.argv.slice(1);
const env = { NLH_TOWER: "1", NLH_TOWER_DIR: dir };
if (origin) env.TOWER_ORIGIN = origin;
process.stdout.write(JSON.stringify({ mcpServers: { tower: { command: node, args: [tower], env } } }, null, 2));
' "$NODE" "$TOWER" "$DIR" "${TOWER_ORIGIN:-}" > "$CONFIG" || stop_thap 'Chưa ghi được cấu hình của Tháp.'

# 6. Mở Claude Code ở thư mục làm việc riêng (ô Tháp mở phiên nền cho các ô ở đây). claude và node vào PATH của phiên,
# để Tháp mở được phiên nền và các hook của plugin chạy được.
mkdir -p "$WORK"
cd "$WORK" || stop_thap 'Chưa mở được thư mục làm việc của Tháp.'
export PATH="$(dirname "$CLAUDE"):$(dirname "$NODE"):$PATH"
echo ''
echo 'Tháp đang nghe tỉnh NhiLe. Đừng đóng cửa sổ này.'
if [ ! -f "$DIR/opened.txt" ]; then
  echo 'Lần đầu Claude Code hỏi vài câu: bấm Enter để chọn sẵn. Tới bước đăng nhập, trình duyệt mở ra: bấm Authorize, quay lại đây bấm Enter.'
fi
echo 'Mỗi lần mở, hộp "Loading development channels" hiện ra: chọn "I am using this for local development", bấm Enter.'
echo ''
set -- '/loop 10m /tinh-nlh:thap' -n 'Thap truc' --model sonnet --mcp-config "$CONFIG" --dangerously-load-development-channels server:tower
if [ -n "${THAP_DRY_RUN:-}" ]; then
  printf 'DRYRUN %s' "$CLAUDE"
  printf ' | %s' "$@"
  printf '\n'
  exit 0
fi
date -u +%Y-%m-%dT%H:%M:%SZ > "$DIR/opened.txt"
# Câu mở đầu đứng trước các cờ: cờ kênh nhận nhiều giá trị, câu đứng sau bị hiểu là tên kênh.
"$CLAUDE" "$@" || stop_thap 'Tháp dừng vì lỗi ở trên. Bấm đúp Tháp để mở lại.'
