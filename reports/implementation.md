# Kiểm chứng tối ưu Slidev Studio 1.0.1

## Quy trình test trước

Baseline gốc: 82/87 test đạt; lỗi Windows gồm quyền symlink, Git daemon treo khi push, timeout và cleanup bị khóa. Fixture Git chuyển sang smart HTTP qua `git http-backend`, cấu hình checkout cố định LF, và chờ đóng server trước khi dọn. Không bỏ assertion hoặc bỏ qua lỗi.

Các hồi quy đã được tái hiện bằng test thất bại trước khi sửa:

| Hành vi               | Lỗi được tái hiện                              | Cách sửa                                         |
| --------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Autosave tắt          | Chuyển file/unmount vẫn gọi ghi file           | Store tài liệu độc lập, giữ bản nháp             |
| Log dồn dập           | Subscriber chỉ theo dõi status vẫn render lại  | Snapshot status ổn định, subscription log riêng  |
| Đóng dự án            | Log vẫn tồn tại                                | Release store và trạng thái tiến trình đã dừng   |
| Khởi động nhiều dự án | Ba server chạy đồng thời                       | Queue tối đa hai, hủy được công việc đang chờ    |
| Cây file              | Thư mục mặc định mở, render mọi con            | Đọc từng cấp, render theo viewport               |
| Đóng liên tiếp        | Cleanup chạy hai lần                           | Coalesce cả yêu cầu lẫn thao tác hoàn tất        |
| Đường dẫn Windows     | `/` và `\` tạo hai model, mất undo/vị trí cuộn | Chuẩn hóa URI model, bảo toàn đường dẫn IO       |
| Đọc file lỗi          | Nội dung rỗng có thể bị sửa rồi ghi đè         | Khóa chỉnh sửa tới khi đọc lại thành công        |
| Đóng tab rồi đóng app | Yêu cầu toàn app chỉ xử lý scope của tab       | Tuần tự hóa các scope khác nhau                  |
| CLI cục bộ            | Ưu tiên shell shim, dễ để lại Node con         | Chạy entry CLI bằng Node, cleanup cây tiến trình |

Unit test bổ sung xác nhận revision cũ không xóa dirty mới, write coalescing, guard, hủy đóng, lỗi ghi, LRU model và preview, vô hiệu hóa cache, sender/requestId và timeout đóng. Component test dùng Monaco giả; Electron E2E và export smoke dùng Monaco/Slidev thật.

## Lệnh tái lập

```powershell
npm ci
npm run test:desktop:prepare
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run test:export
npm run test:benchmark
```

Fixture runtime được ghim trong `tests/fixtures/slidev-runtime/package-lock.json`; dependencies test cài vào `.cache/slidev-fixture`. Mỗi Electron test dùng profile, registry, PID và dự án tạm riêng. Override `SLIDEV_STUDIO_TEST_DATA_DIR` chỉ hoạt động với Electron chưa đóng gói và `NODE_ENV=test`.

## Cách đọc kết quả

- `baseline.json`: hai lượt làm nóng và năm lượt đo bản cũ khi chặn mạng ngoài. Editor không mở trong 10 giây ở cả bảy lượt; không suy diễn số đo gõ/chuyển tab từ các lượt này.
- `baseline-online.json`: cùng fixture 30/100/300 slide và cùng thao tác với bản cũ khi có mạng.
- `optimized.json`: cùng phép đo với bản tối ưu. Typing/tab là thời gian trong renderer từ sự kiện tới hai animation frame, không cộng thời gian truyền lệnh Playwright. `serverMs` là tới khi Vite sẵn sàng, không phải thời gian preview render xong.
- `export-smoke.json`: xuất thật PDF, PPTX và static web; file được lưu tại `reports/exports` (không đưa vào Git).
- Báo cáo thời gian phản ánh máy Windows hiện tại, không phải cam kết cho mọi cấu hình. RAM dùng `privateBytes` theo Electron; không cộng working set để tránh đếm trùng bộ nhớ chung.

## Giới hạn và đánh đổi

Monaco và worker được đóng gói cục bộ làm bộ cài lớn hơn. Giữ hai preview có thể tăng RAM so với một preview; LRU giới hạn số guest, và model dirty được giữ để bảo vệ bản nháp. Giữ server khi thoát vẫn tuân theo cấu hình người dùng. Không đảm bảo lưu khi mất điện hoặc hệ điều hành cưỡng chế kết thúc ứng dụng.

Không nâng Electron/React trong thay đổi này. Các cảnh báo dependency audit còn lại thuộc nhóm nâng cấp riêng; không chạy `npm audit fix --force` trong đợt tối ưu.
