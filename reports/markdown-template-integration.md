# Báo cáo Markdown A4 - 29/10/2026

Bản mẫu đầy đủ từ DL Assignment 1 và bản app xử lý báo cáo dài: xem [assignment1-markdown-sample.md](assignment1-markdown-sample.md).

Mẫu mặc định đã chuyển sang `dl-assignment-markdown`, nguồn `main.md`, loại dự án `markdown-report`. Wizard chọn **Báo cáo Markdown**. Báo cáo `.tex` của bản preview trước vẫn mở được, nhưng mẫu Markdown không gọi compiler hoặc yêu cầu cài Tectonic.

## Cách hoạt động

- YAML đầu `main.md` chứa thông tin bìa; phần còn lại là Markdown thông thường.
- Heading được đánh số và đưa vào mục lục; caption bảng/hình tạo danh sách riêng.
- Ảnh nằm trong dự án được nhúng vào HTML; công thức dùng KaTeX với font cục bộ.
- Electron dàn trang A4 trong một cửa sổ ẩn, chia đoạn/bảng dài rồi dùng `printToPDF` có sẵn. Không chạy Node/npm/TeX bên ngoài.
- Preview tự cập nhật sau khi lưu. Nút **Lưu & cập nhật PDF** cập nhật ngay; **Xuất PDF** lưu nội dung hiện tại, tạo PDF và mở hộp thoại lưu.
- Output riêng ở `.studio-report/`; nếu YAML/ảnh không hợp lệ, PDF thành công gần nhất vẫn được giữ.
- Markdown report không áp dụng guard cú pháp dành cho slide, nên câu bình thường như `Note: ...` không chặn autosave.

HTML nguồn không được thực thi, CSP không cho script/kết nối mạng, cửa sổ in bật sandbox và không có preload/Node integration. Ảnh ngoài dự án và ảnh qua URL mạng bị từ chối.

## Kiểm chứng

- 131/131 unit/component/integration test đạt. Typecheck, lint và build đạt.
- E2E Markdown đạt khi chặn mạng renderer và đặt PATH trống: wizard, nguồn `.md`, preview tự tạo 4 trang, autosave văn bản có dấu hai chấm, tự cập nhật, xuất PDF và giữ bản tốt khi YAML lỗi.
- E2E LaTeX cũ vẫn đạt sau khi mở từ registry. Kiểm thử editor offline và các chế độ preview/restart của Slidev cũng đạt.
- Executable Windows đóng gói thật tạo PDF mà không cài runtime, không có compiler cache và PATH trống. Đã xem cả 4 trang A4; tiêu đề và tác giả tiếng Việt được giữ đúng.
- Báo cáo stress 25 trang giữ đủ 2.500 lần lặp đoạn văn, hàng bảng thứ 160 và marker cuối tài liệu. Có kiểm thử công thức trong PDF native, không dùng JavaScript chạy công thức qua mạng.
- Cách ngắt dòng, dàn bảng và font của HTML/CSS có thể khác LaTeX; mục tiêu là giữ phong cách báo cáo A4 gốc và nguồn dễ sửa bằng Markdown.

## Bản Windows mới

- Setup: `dist/markdown-report-preview/Slidev Studio-Setup-1.0.2-x64.exe`.
- Chạy trực tiếp: `dist/markdown-report-preview/win-unpacked/Slidev Studio.exe`; giữ nguyên cả thư mục.
- Vẫn là version preview 1.0.2 của repository. Bản LaTeX trước được giữ ở `dist/report-preview/`, không bị ghi đè.
- PDF và ảnh kiểm chứng: `reports/exports/markdown/` (không đưa vào Git).

```powershell
npm run build
npm test
npm run lint
npx playwright test tests/e2e/markdownReports.spec.ts
npx electron-builder --win --config.directories.output=dist/markdown-report-preview
node scripts/markdown-report-packaged-smoke.mjs
```

Không cần `test:report:prepare` cho Markdown. Lệnh đó chỉ dành cho kiểm thử tương thích LaTeX cũ. Chưa chạy lại toàn bộ E2E của app trong đợt chuyển Markdown; timeout cộng tác đã ghi nhận ở lần rà soát trước không được coi là đã sửa.
