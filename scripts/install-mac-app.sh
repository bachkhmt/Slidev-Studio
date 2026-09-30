#!/usr/bin/env bash
set -e

echo "🔨 [1/5] Biên dịch mã nguồn (Typecheck & Vite Build)..."
npm run build

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  OUT_DIR="dist/mac-arm64"
else
  OUT_DIR="dist/mac"
fi

echo "📦 [2/5] Đóng gói Desktop App (${ARCH})..."
npx electron-builder --mac --dir

APP_SOURCE="$OUT_DIR/Slidev Studio.app"
APP_TARGET="/Applications/Slidev Studio.app"
DESKTOP_DIR="$HOME/Desktop"

echo "🚚 [3/5] Cài đặt vào /Applications..."
if pgrep -x "Slidev Studio" >/dev/null 2>&1; then
  osascript -e 'quit app "Slidev Studio"' || true
  for _ in $(seq 1 10); do
    if ! pgrep -x "Slidev Studio" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  if pgrep -x "Slidev Studio" >/dev/null 2>&1; then
    echo "❌ Slidev Studio vẫn đang chạy. Hãy thoát ứng dụng rồi chạy lại script."
    exit 1
  fi
fi
rm -rf "$APP_TARGET"
cp -R "$APP_SOURCE" "$APP_TARGET"

echo "🛡️ [4/5] Gỡ cờ kiểm duyệt Gatekeeper & ký ad-hoc macOS..."
xattr -cr "$APP_TARGET"
codesign --force --deep --sign - "$APP_TARGET"

echo "✨ [5/5] Tạo Shortcut trên Màn hình chính (Desktop)..."
rm -f "$DESKTOP_DIR/Slidev Studio" "$DESKTOP_DIR/Slidev Studio.app"
ln -sf "$APP_TARGET" "$DESKTOP_DIR/Slidev Studio.app"
xattr -cr "$DESKTOP_DIR/Slidev Studio.app" 2>/dev/null || true

# Refresh LaunchServices database
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_TARGET" 2>/dev/null || true

echo "🎉 Hoàn tất! 'Slidev Studio.app' đã sẵn sàng tại /Applications và trên Desktop của bạn!"
