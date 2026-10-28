# Slidev Studio 🎙️

Ứng dụng Desktop (Electron + React + TypeScript + Tailwind CSS) chuyên dụng để quản lý, tạo mới và live-edit các bài thuyết trình **Slidev** với **Live Preview** tức thì qua Vite HMR.

---

## 🌟 Tính năng nổi bật theo kế hoạch dự án

- **Quản lý dự án thông minh (M2 & M6)**:
  - Mở thư mục bài giảng Slidev có sẵn trên máy tính (`dialog.showOpenDialog`).
  - Hỗ trợ cả project đơn file (`slides.md` như `KneeOsteo`) và project đa file song song (`slides-academic.md`, `slides-scholarly.md`... như `slidev-multi-theme`).
  - Tự động nạp và lưu registry tại `~/.slidev-studio/projects.json`.
  - Hỗ trợ clone trực tiếp từ Git repository (`git clone`).
- **Trình tạo dự án mới — Zero-Setup Wizard (M2b)**:
  - Wizard 3 bước tinh gọn: Tên & Vị trí -> Chọn Theme -> Tiêu đề & Tác giả.
  - Tích hợp sẵn 9 theme tuyển chọn:
    1. **Default Theme**: Giao diện tiêu chuẩn, linh hoạt.
    2. **Frankfurt Academic**: Phong cách học thuật chuẩn Beamer (phù hợp báo cáo NCKH, chuyên đề xAI như trong KneeOsteo).
    3. **Seriph (Editorial)**: Phong cách tạp chí trang nhã.
    4. **Bricks Grid**: Thiết kế dạng khối hiện đại.
    5. **Apple Basic**: Bố cục sáng tối giản theo phong cách Keynote.
    6. **Shibainu**: Bảng màu pastel do Slidev phát hành.
    7. **Penguin**: Theme cộng đồng cho bài thuyết trình kỹ thuật.
    8. **Dracula**: Theme cộng đồng nền tối.
    9. **HCMUT Bách Khoa**: Theme học thuật cục bộ với cover và thanh section riêng.
  - Tự động stream log cài đặt dependencies và mở ngay vào Workspace khi hoàn thành.
- **Quản lý tiến trình & Cổng thông minh (M3)**:
  - Tự động dò và cấp phát cổng trống (Port Allocator), tránh xung đột khi mở nhiều bài thuyết trình cùng lúc.
  - Bắt tín hiệu máy chủ sẵn sàng (`ready`) từ stdout và tự động kết nối Preview.
  - Diệt triệt để toàn bộ tiến trình con khi đóng app bằng `tree-kill`.
- **Trình biên tập Monaco Editor & Autosave (M4)**:
  - Tích hợp VS Code Monaco Editor với cú pháp Markdown và Vue.
  - **Autosave debounce 1200ms**: Guard Markdown mặc định tạm dừng autosave khi frontmatter, code fence, công thức hoặc thẻ component chưa cân bằng.
  - Phím tắt `Cmd+S` / `Ctrl+S` để lưu thủ công ngay lập tức.
  - Cây thư mục (File Tree) hỗ trợ duyệt và chuyển đổi nhanh giữa các file `.md`, `.vue`, ảnh...
- **Live Preview qua Webview (M5)**:
  - Môi trường preview cô lập an toàn bằng `<webview>`.
  - Thanh công cụ điều hướng: Chuyển slide trước/sau (←/→), Tải lại trang, Mở trong trình duyệt ngoài, Mở chế độ Presenter (`?mode=presenter`).
- **Multi-Tab đa dự án**:
  - Hỗ trợ mở song song nhiều dự án trên các tab khác nhau, mỗi tab chạy một máy chủ dev riêng biệt với port độc lập.
- **Đóng gói & Xuất bản (M7 & M8)**:
  - Xuất bài thuyết trình sang **PDF**, **PNG**, **PowerPoint (PPTX)** hoặc build **Static Web App (dist)**.
  - Stream nhật ký xuất file trực tiếp và nút mở nhanh thư mục chứa kết quả.
  - Tùy chỉnh cỡ chữ Editor, giao diện sáng/tối (Dark/Light/System), thư mục lưu mặc định và ghi đè đường dẫn Node.js nếu cần.

---

## 🚀 Khởi chạy ứng dụng

### 1. Chạy chế độ phát triển (Development)

Yêu cầu: Node.js 22 LTS và npm. Cài thêm Git nếu dùng chức năng clone hoặc cộng tác GitHub.

```bash
# Cài đặt thư viện (nếu chưa cài)
npm ci

# Khởi động app ở chế độ dev
npm run dev
```

### 2. Kiểm tra mã nguồn và biên dịch

```bash
# Kiểm tra TypeScript typecheck
npm run typecheck

# Build toàn bộ main, preload và renderer
npm run build
```

### 3. Đóng gói phân phối (Desktop Installer)

```bash
# Đóng gói cho macOS (.dmg)
npm run build:mac

# Đóng gói cho Windows (.exe - NSIS)
npm run build:win

# Đóng gói cho Linux (.AppImage)
npm run build:linux
```

Trên Windows x64, `npm run build:win` tạo bộ cài `dist/Slidev Studio-Setup-1.0.2-x64.exe` và bản chạy trực tiếp `dist/win-unpacked/Slidev Studio.exe`. Bộ cài cho phép chọn thư mục, cài cho tài khoản hiện tại và tạo shortcut trên Desktop/Start Menu. Logo gốc `build/icon.png` được dùng cho ứng dụng, cửa sổ, shortcut và màn hình chính; macOS dùng `build/icon.icns`.

Mở file Setup để cài đặt, hoặc chạy bản `win-unpacked` để dùng ngay (giữ nguyên cả thư mục). Máy chạy ứng dụng cần có Node.js và npm trong PATH để cài dependencies và chạy các dự án Slidev.

---

## Cộng tác theo section

Chọn mẫu **Cộng tác theo section** trong wizard để tạo bài ba phần và phân công bằng tài khoản GitHub. Workspace có **Lưu nháp**, **Đồng bộ**, **Gửi bài**, preview phần/tổng và export PDF/PPTX/web từ nhánh tổng. Chỉ section của bạn và thư mục asset tương ứng được phép sửa.

Đăng nhập GitHub từ Home bằng Client ID của OAuth App đã bật Device Flow. Điều phối cần tạo repository, mời thành viên và cấu hình bảo vệ nhánh. Xem [hướng dẫn nhóm](electron/templates/git-collab/README.md) và [ghi chú triển khai, kiểm chứng và giới hạn beta](plan/slidev-git-collab-implementation-30-09.md).

## 📁 Cấu trúc thư mục

```
Slidev/
├── electron/
│   ├── main.ts                 # Điểm khởi đầu Main process, cấu hình cửa sổ & cleanup
│   ├── preload.ts              # Expose contextBridge API an toàn
│   ├── ipc/
│   │   ├── projects.ipc.ts     # IPC quản lý danh sách dự án, cài đặt
│   │   ├── process.ipc.ts      # IPC spawn, kill, restart Slidev dev server
│   │   ├── fs.ipc.ts           # IPC đọc, ghi file, duyệt cây thư mục
│   │   ├── scaffold.ipc.ts     # IPC clone template và npm install
│   │   └── export.ipc.ts       # IPC xuất PDF, PNG, PPTX, build dist
│   ├── services/
│   │   ├── projectStore.ts     # Registry lưu trữ ~/.slidev-studio/projects.json
│   │   ├── processManager.ts   # Quản lý tiến trình execa + tree-kill + port detector
│   │   ├── scaffolder.ts       # Nhân bản template + ghi đè frontmatter + npm install
│   │   └── portFinder.ts       # Cấp phát port tự động
│   └── templates/              # Mẫu template được bundle sẵn
│       ├── default/
│       ├── git-collab/         # Ba section, manifest, CODEOWNERS và CI
│       ├── frankfurt-academic/
│       ├── seriph/
│       ├── bricks/
│       ├── apple-basic/
│       ├── shibainu/
│       ├── penguin/
│       ├── dracula/
│       └── hcmut-bach/         # Project template with bundled local theme
├── src/                        # Renderer UI (React + Tailwind CSS)
│   ├── App.tsx                 # Điều hướng Home / Wizard / Workspace
│   ├── main.tsx                # React root mount
│   ├── pages/
│   │   ├── HomeDashboard.tsx   # Màn hình chính quản lý dự án
│   │   ├── ProjectWorkspace.tsx# Workspace 3 cột (FileTree + Editor + Preview)
│   │   └── NewProjectWizard.tsx# Wizard 3 bước tạo dự án mới
│   ├── components/
│   │   ├── ProjectCard.tsx     # Thẻ dự án
│   │   ├── FileTree.tsx        # Cây thư mục dự án
│   │   ├── EditorPane.tsx      # Monaco Editor + guarded autosave 1200ms
│   │   ├── PreviewPane.tsx     # Live Preview qua <webview>
│   │   ├── ProcessConsole.tsx  # Nhật ký terminal dev server realtime
│   │   ├── ExportDialog.tsx    # Hộp thoại xuất file PDF/PPTX/PNG/Build
│   │   └── SettingsPage.tsx    # Cài đặt giao diện, editor, máy chủ, Node path
│   └── ipc-client.ts           # Wrapper gọi window.api an toàn
├── electron-builder.yml        # Cấu hình đóng gói dmg, nsis, AppImage
├── electron.vite.config.ts     # Cấu hình electron-vite
└── package.json
```

## Kiểm thử desktop và hiệu năng

Monaco và worker được đóng gói cùng ứng dụng để editor hoạt động offline. Workspace giữ bản nháp khi chuyển file, chỉ đóng sau khi xử lý nội dung chưa lưu, và giới hạn hai preview gần dùng.

Chạy `npm run test:desktop:prepare` một lần để cài runtime fixture theo lockfile, sau đó `npm run test:e2e` cho Electron thật, `npm run test:export` để xuất PDF/PPTX/web thật và `npm run test:benchmark` để đo hiệu năng. Unit/component test chạy bằng `npm test`.

Xem [báo cáo kiểm chứng](reports/implementation.md) và các số đo JSON trong `reports/`. Bộ cài cũ được giữ trong `dist/releases/baseline/`.

Bản 1.0.2 sửa thao tác cộng tác khi workspace có file chỉ đọc và khi đang khóa editor để chạy Git. Xem [phạm vi kiểm thử cộng tác](reports/team-workflow.md) và [kết quả bản Windows](reports/validation.md).
