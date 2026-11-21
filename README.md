# Slidev Studio

Slidev Studio là ứng dụng desktop để tạo, quản lý và chỉnh sửa bài thuyết trình Slidev. Ứng dụng tích hợp Monaco Editor, xem trước theo thời gian thực và xuất slide, đồng thời hỗ trợ soạn báo cáo Markdown A4 và cộng tác qua GitHub.

[GitHub Releases](https://github.com/bachkhmt/Slidev-Studio/releases)

## Tính năng nổi bật

- **Quản lý dự án.** Mở thư mục có sẵn hoặc clone từ Git. Workspace hỗ trợ cả dự án có một file `slides.md` và dự án có nhiều bộ slide trong cùng thư mục.
- **Tạo dự án từ mẫu.** Chọn tên và vị trí, chọn mẫu, rồi nhập tiêu đề và tác giả. Studio hiển thị tiến độ cài dependencies và mở workspace khi dự án sẵn sàng. Có chín theme Slidev gồm Default, Frankfurt Academic, Seriph, Bricks, Apple Basic, Shibainu, Penguin, Dracula và HCMUT Bách Khoa.
- **Monaco Editor.** Chỉnh sửa Markdown và Vue, duyệt nội dung qua cây thư mục và lưu bằng `Ctrl+S` hoặc `Cmd+S`. Tự lưu mặc định sau 1,2 giây và tạm dừng nếu frontmatter, khối code, công thức hoặc thẻ component chưa đóng.
- **Xem trước trực tiếp.** Studio tự cấp cổng cho mỗi Slidev dev server và cập nhật nội dung qua Vite HMR. Có thể mở bản xem trước trong trình duyệt hoặc chuyển sang chế độ Presenter.
- **Nhiều tab.** Mở và chỉnh sửa nhiều dự án cùng lúc. Studio quản lý và dừng các tiến trình Slidev khi thoát ứng dụng.
- **Xuất bản và tùy chỉnh.** Xuất PDF, PNG, PowerPoint (`.pptx`) hoặc bản web tĩnh. Cài đặt cho phép đổi giao diện, cỡ chữ editor, thư mục lưu mặc định và đường dẫn Node.js.

## Báo cáo Markdown / PDF

Chọn **Tạo dự án mới → Báo cáo Markdown → Báo cáo Assignment Bách Khoa**. Điền thông tin bìa trong YAML ở đầu `main.md`, rồi viết nội dung, bảng, hình và công thức bằng Markdown.

Dùng **Lưu & cập nhật PDF** để tạo bản xem trước hoặc bật **Tự cập nhật khi lưu**. Studio tự dàn trang A4, tạo bìa, mục lục, danh sách hình và bảng, rồi đánh số trang. Khi có lỗi ở YAML hoặc tệp ảnh, workspace báo lỗi và giữ bản PDF thành công gần nhất. Chọn **Xuất PDF** để lưu bản hoàn chỉnh.

Bản đóng gói xuất PDF Markdown bằng Electron. Dự án LaTeX có sẵn (`.tex`) vẫn mở được và dùng Tectonic để biên dịch. [Cú pháp và mẫu Markdown](electron/templates/dl-assignment-markdown/README.md) · [Mẫu LaTeX](electron/templates/dl-assignment-report/README.md)

## Khởi chạy ứng dụng

### Quick Start

Cài Git, Node.js **22 LTS** và npm. Nếu phiên bản đang dùng đã chỉ định Node.js trong `.nvmrc` và npm trong `packageManager`, dùng các phiên bản đó. Chạy các lệnh sau từ thư mục gốc của repo.

```bash
npm ci
npm run dev
```

### Kiểm tra mã nguồn và build

```bash
npm run lint
npm test
npm run build
```

`npm run build` kiểm tra kiểu TypeScript rồi biên dịch Electron main, preload và giao diện React vào `out/`. Dùng `npm run start` để mở bản vừa build.

### Đóng gói ứng dụng

| Nền tảng           | Lệnh                                     | Đầu ra                    |
| ------------------ | ---------------------------------------- | ------------------------- |
| Windows x64        | `npm run build:win -- --publish never`   | Bộ cài `.exe`             |
| macOS (thử nghiệm) | `npm run build:mac -- --publish never`   | `.dmg` và ứng dụng `.app` |
| Linux (thử nghiệm) | `npm run build:linux -- --publish never` | `.AppImage`               |

Chạy lệnh trên hệ điều hành tương ứng. Bản 1.0.2 xuất vào `dist/`. Xem `directories.output` trong `electron-builder.yml` để xác định đường dẫn của phiên bản đang dùng. Trên Windows, mở file Setup để cài hoặc chạy `win-unpacked/Slidev Studio.exe` trong thư mục đầu ra. Giữ nguyên thư mục `win-unpacked` khi dùng bản chạy trực tiếp.

Máy dùng Studio cần Node.js và npm để cài dependencies và chạy preview cho dự án Slidev.

## Cộng tác theo section

Chọn mẫu **Cộng tác theo section** để tạo bài Slidev có ba section và phân công thành viên qua GitHub. Mỗi người chỉnh sửa section được giao và thư mục tài nguyên tương ứng. Workspace hỗ trợ **Lưu nháp**, **Đồng bộ**, **Gửi bài** và xem trước từng section hoặc toàn bài. Bản xuất PDF, PPTX hoặc web của toàn bài lấy nội dung từ nhánh chính trên `origin`.

Đăng nhập GitHub từ màn hình chính bằng Client ID của OAuth App đã bật Device Flow. Người điều phối tạo repo, mời thành viên và cấu hình bảo vệ nhánh. [Thiết lập cộng tác](electron/templates/git-collab/README.md)

## Cấu trúc thư mục

```text
Slidev-Studio/
├── electron/
│   ├── main.ts                         # Vòng đời ứng dụng và cửa sổ Electron
│   ├── preload.ts                      # API qua contextBridge
│   ├── ipc/
│   │   ├── projects.ipc.ts             # Quản lý dự án
│   │   ├── process.ipc.ts              # Điều khiển Slidev dev server
│   │   ├── fs.ipc.ts                   # Đọc, ghi và duyệt tệp
│   │   ├── scaffold.ipc.ts             # Tạo dự án từ mẫu
│   │   ├── export.ipc.ts               # Xuất slide
│   │   ├── reports.ipc.ts              # Xem trước và xuất báo cáo
│   │   └── collab.ipc.ts               # Cộng tác qua GitHub
│   ├── services/
│   │   ├── projectStore.ts             # Danh sách dự án và cài đặt
│   │   ├── processManager.ts           # Tiến trình Slidev dev server
│   │   ├── portFinder.ts               # Cấp phát cổng
│   │   ├── scaffolder.ts               # Tạo dự án từ mẫu
│   │   ├── reportManager.ts            # Vòng đời và xuất bản báo cáo
│   │   └── markdownPdf.ts              # Dựng PDF từ báo cáo Markdown
│   └── templates/
│       ├── default/                    # Mẫu Slidev mặc định
│       ├── apple-basic/
│       ├── bricks/
│       ├── dracula/
│       ├── frankfurt-academic/
│       ├── penguin/
│       ├── seriph/
│       ├── shibainu/
│       ├── hcmut-bach/                 # Mẫu Slidev với theme HCMUT đi kèm
│       ├── git-collab/                 # Mẫu cộng tác theo section
│       ├── dl-assignment-markdown/     # Mẫu báo cáo Markdown A4
│       └── dl-assignment-report/       # Mẫu báo cáo LaTeX
├── src/
│   ├── App.tsx                         # Điều hướng và workspace
│   ├── main.tsx                        # Điểm khởi chạy giao diện React
│   ├── pages/
│   │   ├── HomeDashboard.tsx           # Quản lý dự án
│   │   ├── NewProjectWizard.tsx        # Tạo dự án
│   │   ├── ProjectWorkspace.tsx        # Workspace Slidev
│   │   ├── ReportWorkspace.tsx         # Workspace báo cáo
│   │   └── SettingsPage.tsx            # Cài đặt ứng dụng
│   ├── components/
│   │   ├── EditorPane.tsx              # Trình soạn thảo Monaco
│   │   ├── FileTree.tsx                # Cây thư mục dự án
│   │   ├── PreviewPane.tsx             # Xem trước Slidev
│   │   ├── PdfPreview.tsx              # Xem trước PDF
│   │   └── ExportDialog.tsx            # Hộp thoại xuất slide
│   └── ipc-client.ts                   # Gọi API qua preload
├── shared/                             # Kiểu dữ liệu dùng chung giữa Electron và React
├── build/                              # Tài nguyên đóng gói
├── examples/                           # Dự án mẫu
├── reports/                            # Kết quả kiểm thử và benchmark
├── scripts/                            # Công cụ kiểm thử, đóng gói và phát hành
├── tests/                              # Test, fixture và kịch bản Electron E2E
├── electron-builder.yml                # Cấu hình bộ cài
├── electron.vite.config.ts             # Cấu hình build Electron
└── package.json                        # Dependencies và lệnh npm
```

## Kiểm thử desktop và hiệu năng

Tạo dự án từ mẫu báo cáo Markdown trong Studio, sau đó cập nhật bản xem trước và xuất PDF để thử quy trình.

Monaco và các worker được đóng gói cùng ứng dụng để editor hoạt động offline. Workspace giữ bản nháp khi chuyển tệp, xử lý nội dung chưa lưu trước khi đóng tab và giữ tối đa hai bản xem trước gần dùng.

| Lệnh                           | Mục đích                                                  |
| ------------------------------ | --------------------------------------------------------- |
| `npm test`                     | Chạy unit test và component test                          |
| `npm run test:desktop:prepare` | Cài runtime Slidev dùng cho kiểm thử                      |
| `npm run test:report:prepare`  | Chuẩn bị Tectonic và cache TeX cho ca LaTeX sau khi build |
| `npm run test:e2e`             | Build và chạy kiểm thử trên Electron                      |
| `npm run test:export`          | Kiểm thử xuất PDF, PPTX và web                            |
| `npm run test:benchmark`       | Đo hiệu năng desktop                                      |

Chuẩn bị runtime Slidev trước khi chạy E2E. Với ca LaTeX, chạy `npm run build` rồi chuẩn bị Tectonic trước khi chạy bộ test. [Báo cáo kiểm chứng](reports/implementation.md) · [Kết quả kiểm thử Windows](reports/validation.md)

## Tài liệu

- [Tích hợp báo cáo Markdown](reports/markdown-template-integration.md)
- [Tích hợp báo cáo LaTeX](reports/latex-template-integration.md)
- [Triển khai và kiểm thử cộng tác](reports/team-workflow.md)
