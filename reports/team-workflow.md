# Kiểm chứng quy trình nhóm — Slidev Studio 1.0.2

## Hai hồi quy đã sửa theo test trước

1. File chung chỉ đọc, không có thay đổi, làm `flushProject` báo lỗi khi chọn section. Test store và component tái hiện trước khi sửa: file sạch được chờ tác vụ ghi đang chạy rồi bỏ qua; file dirty đã mất quyền ghi vẫn bị từ chối và giữ nháp.
2. Workspace khóa editor khi bắt đầu thao tác nhóm; trạng thái khóa tạm thời bị truyền như mất quyền ghi, khiến Lưu nháp thất bại. Test Electron tái hiện không nhận được thông báo lưu thành công; test component xác nhận phải khóa nhập nhưng vẫn flush đúng nháp. Editor nay có khóa tương tác riêng, giữ kiểm tra quyền section ở store và main process.

## Kịch bản đạt

- 117 unit/component/integration test, gồm Git thật qua smart HTTP local: phân công, branch, lưu nháp, push, đồng bộ, conflict, bảo vệ file, phục hồi vai trò và snapshot export từ main.
- Electron thật, Monaco thật: chọn section Alice, nhập Markdown, Lưu nháp tạo commit sạch, Gửi bài push branch; main giữ nguyên. Ghi section Bob qua IPC bị từ chối.
- Checkout khác đẩy thay đổi của Bob lên main; Đồng bộ nhận đúng nội dung. Hai bên sửa cùng section gây conflict; Giữ bản của tôi và Hoàn tất đồng bộ tạo trạng thái Git sạch, giữ đúng nội dung đã chọn.
- Các fixture Git không đọc cấu hình Git toàn cục; app/profile/dự án/PID tạm riêng, không dùng dữ liệu thật.

Test Electron dùng danh tính Alice và dịch vụ PR giả trong tiến trình test. Git add/commit/push/fetch/merge và toàn bộ giao diện/IPC là thật. Đây không phải bằng chứng đã đăng nhập OAuth hay tạo PR bằng nhiều tài khoản người dùng thật.

## Điều kiện dùng nhóm thật

Điều phối cần cung cấp OAuth App Client ID đã bật Device Flow, mời thành viên có quyền vào repository, cấu hình CODEOWNERS và bảo vệ main với review/check bắt buộc. Quyền trong app không thay thế quyền trên GitHub. Không tự sửa những cài đặt GitHub của người dùng trong lần rebuild này.

Đăng nhập OAuth, quyền organization, review/merge và Pages bằng tài khoản thật vẫn cần smoke test sau khi nhóm cấu hình xong. Hướng dẫn đầy đủ: [README template](../electron/templates/git-collab/README.md).

## Tái lập

```powershell
npm ci
npm run test:desktop:prepare
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run test:export
npx electron-builder --win --config.directories.output=dist/releases/1.0.2
node scripts/packaged-smoke.mjs
node scripts/report-validation.mjs
```

Khi tạo báo cáo JSON cho Vitest, dùng `npm test -- --reporter=default --reporter=json --outputFile=reports/unit-tests.json`. Với Playwright, đặt `PLAYWRIGHT_JSON_OUTPUT_NAME=reports/e2e-tests.json` và dùng `npx playwright test --reporter=list,json` sau build. Báo cáo chạy có đường dẫn máy cục bộ được giữ ngoài Git; raw benchmark và báo cáo tổng hợp được đưa vào PR.

Các số đo hiệu năng trong validation.md thuộc bản tối ưu 1.0.1, chưa đo lại trên bản sửa cộng tác 1.0.2. Bản cũ được giữ tại dist/releases/baseline và dist/releases/1.0.1.

## Cài đặt Windows

Đã chạy bộ cài NSIS 1.0.2 cho tài khoản hiện tại. Shortcut Desktop **Slidev Studio** trỏ tới `%LOCALAPPDATA%/Programs/Slidev/Slidev Studio.exe`, phiên bản file 1.0.2 và icon lấy từ executable.

Smoke test chạy lại chính executable đã cài bằng profile/dự án tạm: editor offline, lưu file, worker JSON/TypeScript cục bộ, đủ 10 template và logo trùng byte với logo gốc đều đạt. Không mở profile thật của người dùng trong kiểm thử.
