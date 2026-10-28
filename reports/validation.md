# Kết quả kiểm chứng Slidev Studio 1.0.2

Windows x64, ngày 29/10/2026. Bản cũ và bộ cài mới được giữ riêng trong **dist/releases/**.

## Kiểm thử

- 117/117 unit/component/integration test đạt; không có test bị bỏ qua.
- 8 Electron E2E đạt; lỗi 0, bỏ qua 0, flaky 0.
- 20 vòng mở/đóng kiểm tra PID Slidev đã thoát, model Monaco = 0, subscription = 0 và webview = 0.
- Thư mục 5.000 file chỉ render phần nhìn thấy; junction ra ngoài dự án bị từ chối.
- Bản .exe đóng gói thật: editor hoạt động khi chặn mạng ngoài, JSON/TypeScript worker cục bộ, 10 template và logo trùng byte với build/icon.png.
- Xuất PDF/PPTX/web thật: pdf: đạt (3 trang); pptx: đạt; build: đạt. PPTX được kiểm tra có 3 phần slide XML.

## Hiệu năng

Hai lượt làm nóng và năm lượt đo cùng fixture 30/100/300 slide trên bản tối ưu 1.0.1; bản 1.0.2 bổ sung sửa luồng cộng tác, chưa đo lại benchmark. p95 gõ/chuyển tab tính trong renderer từ sự kiện tới hai animation frame, không cộng thời gian truyền lệnh Playwright. Số đo phản ánh phiên Windows hiện tại, không phải cam kết cho mọi máy.

| Chỉ số | Bản cũ, có mạng | Bản tối ưu |
| --- | ---: | ---: |
| Mở màn hình chính, median | 605.6 ms | 618.6 ms |
| Mở editor đầu tiên, 30 slide, median | 1170.5 ms | 822.5 ms |
| Gõ, p95 | 31.1 ms | 30.8 ms |
| Chuyển tab đã mở, p95 | 112.1 ms | 40.8 ms |
| RAM riêng Electron sau chuỗi thao tác, median | 389.5 MiB | 512.1 MiB |

Chuyển tab giảm khoảng 63.6%. Độ trễ gõ gần tương đương; khởi động màn hình chính không cải thiện đáng kể. Hai mục tiêu gõ <50 ms và chuyển tab <300 ms đều đạt.

**Đánh đổi RAM:** giữ hai preview để chuyển nhanh làm mẫu RAM Electron tăng khoảng 122.6 MiB. Đây là mẫu sau chuỗi thao tác, không phải phép đo RAM ổn định dài hạn; không gồm các server Node của Slidev và không cộng working set có thể đếm trùng bộ nhớ chung. Giới hạn tài nguyên được kiểm tra riêng bằng vòng mở/đóng.

Ở phép thử chặn mạng ngoài, editor bản cũ không mở trong 10 giây ở cả bảy lượt. Bản mới mở được offline. Dữ liệu này được lưu riêng trong baseline.json, không trộn với phép so sánh có mạng.

## Preview và HMR

HMR đo từ ghi file xuống đĩa tới nội dung xuất hiện trong guest DOM, không cộng debounce autosave 1.200 ms.

| Số slide | Server sẵn sàng | Preview hiển thị | HMR p95, 5 mẫu sau 2 warmup |
| --- | ---: | ---: | ---: |
| 30 | 2657.8 ms | 5252.5 ms | 552.2 ms |
| 100 | 2400.8 ms | 5622.4 ms | 608.5 ms |
| 300 | 2443.1 ms | 6992.4 ms | 865.0 ms |

Thời gian server/Vite và preview được tách khỏi độ trễ giao diện. Bài 300 slide vẫn cần vài giây để biên dịch và render lần đầu.

## Bản bàn giao và giới hạn

- Bộ cài: dist/releases/1.0.2/Slidev Studio-Setup-1.0.2-x64.exe (78.9 MiB).
- Chạy trực tiếp: dist/releases/1.0.2/win-unpacked/Slidev Studio.exe; giữ nguyên cả thư mục.
- SHA-256: 7c633ab239a87b16ece00adb118b7edc694ff6255ab22466d97001c74d4c33d0.
- Kết quả cài đặt Desktop và kiểm thử cộng tác: [team-workflow.md](team-workflow.md).
- Monaco/worker offline làm bộ cài lớn hơn. Electron/React giữ nguyên phiên bản chính; cảnh báo dependency audit chưa được xử lý bằng nâng cấp diện rộng.
- PDF có chọn range dùng chế độ per-slide của Slidev 53 để bảo đảm đúng số trang; chế độ này không giữ liên kết chéo/TOC của PDF. PDF toàn bộ tiếp tục dùng đường in mặc định.
- Không bảo đảm lưu bản nháp khi mất điện hoặc hệ điều hành cưỡng chế kết thúc tiến trình.

Chi tiết triển khai và lệnh tái lập: [implementation.md](implementation.md). Các báo cáo JSON giữ toàn bộ mẫu đo và kết quả kiểm thử.
