#!/usr/bin/env bash
cd "$(dirname "$0")"
./scripts/install-mac-app.sh
osascript -e 'display notification "Slidev Studio đã được build và cập nhật thành công!" with title "Slidev Studio"'
echo "Done! You can close this window."
exit 0
