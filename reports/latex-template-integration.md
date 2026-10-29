# Tích hợp mẫu báo cáo LaTeX vào Slidev Studio

Ghi chú: đây là bản triển khai LaTeX trước khi người dùng làm rõ mong muốn dùng Markdown. Mẫu mặc định hiện đã chuyển sang Markdown; xem [kiểm chứng bản Markdown](markdown-template-integration.md). Phần dưới được giữ làm lịch sử kiểm chứng và tương thích các dự án `.tex` đã tạo.

Ngày kiểm chứng: 29/10/2026, Windows x64.

## Kết quả

- Wizard có hai loại dự án: Slidev và báo cáo LaTeX. Mẫu mới có ID `dl-assignment-report`.
- Mẫu báo cáo giữ bố cục A4 của source người dùng cung cấp: bìa Bách Khoa, mục lục, danh sách hình/bảng và section mẫu.
- Editor hỗ trợ `.tex`/`.bib`/`.sty`/`.cls`; báo cáo có preview PDF cục bộ với đổi trang/phóng to, lưu và biên dịch, biên dịch khi lưu, hủy và xuất PDF qua hộp thoại lưu.
- Báo cáo có loại `latex` trong registry, mở lại/khôi phục tab được, không chạy npm hoặc server Slidev.
- Preview của template được ghi nhãn rõ trước lần biên dịch đầu. Biên dịch lỗi giữ nguyên PDF thành công trước đó; xuất PDF luôn lưu và biên dịch nội dung hiện tại trước.
- Chỉ cho soạn thảo file văn bản trong workspace báo cáo, không đưa PNG/PDF vào editor UTF-8.

## Bộ biên dịch và bố cục

Tectonic 0.17.0 được tải từ bản phát hành chính thức, kiểm tra SHA-256 trước khi cài vào dữ liệu ứng dụng. Chọn bản MSVC trên Windows x64 vì bản GNU trong môi trường kiểm tra thiếu thư viện runtime. Không dùng shell escape; mỗi job có thư mục output riêng dưới `.studio-latex/`, có timeout/hủy và giới hạn log.

Nhánh XeLaTeX/Tectonic dùng TeX Gyre Termes để giữ bố cục Times và hỗ trợ Unicode. Nhánh pdfLaTeX giữ khai báo Unicode của mẫu gốc. `minted` không dùng trong phần nội dung mẫu đã được bỏ; `listings` và cấu hình mã nguồn gốc vẫn có sẵn.

Đã render và xem cả bốn trang PDF, đối chiếu với bản gốc. PDF tạo từ `.exe` đóng gói có bốn trang A4, trích xuất đúng tiêu đề “Báo cáo Deep Learning” và tác giả “Nguyễn Văn A”. Hình ảnh, khung bìa, bảng và phân trang được kiểm tra trực quan.

## Kiểm thử

- TypeScript, ESLint, production build và NSIS packaging đạt.
- Bộ unit/component/integration có 124 test, gồm 7 test mới về phát hiện report, manifest traversal, metadata TeX, thư mục output, giữ PDF tốt và hủy job.
- E2E báo cáo đạt: tạo bằng wizard, PDF worker offline có nội dung được vẽ lên canvas, soạn thảo khi autosave tắt, biên dịch thật, xuất PDF, báo lỗi LaTeX và giữ PDF tốt gần nhất.
- Bộ E2E đầy đủ: 8/9 đạt. Ca cộng tác tại `collaboration.spec.ts:114` timeout khi chờ “Lưu nháp” được bật; cùng lỗi đã xuất hiện trước thay đổi này trong báo cáo rà soát. Chạy riêng lại đạt trong 24 giây. Không coi lượt đầy đủ này là 9/9.
- Smoke trên executable đóng gói thật đạt cho cả Slidev và báo cáo. Report smoke dùng profile tạm, runtime/cache đã chuẩn bị và chặn mạng renderer; không dùng override compiler chỉ dành cho bản development.
- Bộ cài cũ và ứng dụng đang cài trên máy không bị ghi đè.

## Bản Windows để dùng thử

- Setup: `dist/report-preview/Slidev Studio-Setup-1.0.2-x64.exe`.
- Chạy trực tiếp: `dist/report-preview/win-unpacked/Slidev Studio.exe`; giữ nguyên cả thư mục.
- SHA-256 của Setup: `8f868d3c09761e0296cb304c2b24b1e7a7191cc48dd8e07d9dbf4cc5f7aee10a`.
- Đây là bản preview tính năng, vẫn giữ version 1.0.2 của repository.
- Ảnh kiểm chứng và PDF mẫu mới ở `reports/exports/latex/` (không đưa vào Git).

Lần đầu trên profile thật, chọn **Cài bộ biên dịch** rồi **Lưu & biên dịch**. Cần mạng để tải runtime/gói LaTeX chưa có trong cache. Chưa kiểm chứng bộ cài macOS/Linux và đăng nhập GitHub thật trong thay đổi này.

## Tái lập

```powershell
npm ci
npm run test:desktop:prepare
npm run build
npm run test:report:prepare
npm test
npm run lint
npx playwright test tests/e2e/reports.spec.ts
npx electron-builder --win --config.directories.output=dist/report-preview
node scripts/packaged-smoke.mjs "dist/report-preview/win-unpacked/Slidev Studio.exe"
node scripts/report-packaged-smoke.mjs
```

`test:report:prepare` cài runtime và làm nóng cache TeX vào `.cache/report-runtime/`. Chạy một lần trước khi chạy toàn bộ E2E. Với profile tạm của bản Windows đóng gói, fixture tạo cả AppData/Local và AppData/Roaming để native compiler xác định được các thư mục chuẩn của Windows.
