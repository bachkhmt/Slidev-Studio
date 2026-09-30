# Kế hoạch **Slidev Studio** — Phase 7

> Settings Hub · Hệ thống Theme (Overleaf-academic + preset) · Chế độ cuộn Preview · Click-từ-slide-về-Markdown

Nối tiếp `plan/ke-hoach-nang-cap-slidev-studio-28-09.md` (Phase 6: resizable layout, export nâng cao, recompile, thêm template — **đã có trong code**). Tài liệu này dựa trên bản `Slidev_clean_20260929_095038.zip`.

---

## 0. Đối chiếu hiện trạng

| Yêu cầu | Hiện trạng thực tế trong code | Hệ quả |
|---|---|---|
| 1. Settings điều chỉnh mọi thứ | `SettingsModal.tsx` là modal nhỏ (`max-w-lg`) với 4 mục: cỡ chữ editor, `themeMode`, thư mục workspace, đường dẫn Node. Settings đang bị **giữ 3 bản sao**: state cục bộ trong modal, state riêng trong `ProjectWorkspace.tsx`, và 1 lần đọc rời trong `HomeDashboard.tsx`. `updateSettings` trong `projectStore.ts` chỉ **shallow merge**. | Cần chuyển sang 1 nguồn dữ liệu duy nhất (Provider + broadcast) và deep-merge thì mới mở rộng được. |
| Port kết nối | Mặc định `3030` bị hardcode ở **4 nơi** (`App.tsx:42`, `ProjectWorkspace.tsx:188/220/248`) + `processManager.start()`. `findFreePort` quét `+300` cố định. `preferredPort` có trong kiểu `ProjectItem` nhưng chỉ được **hiển thị** ở `ProjectCard`, chưa có chỗ sửa. Host cố định `localhost`, cờ `--open=false` cố định, timeout khởi động 15s cố định. | Toàn bộ nhóm này đưa thành setting; main process tự đọc setting, renderer thôi truyền `\|\| 3030`. |
| 2. Đổi theme app | `themeMode: 'light'\|'dark'\|'system'` **được lưu nhưng không được áp dụng ở đâu cả** (grep không thấy `classList`/`dark:`). UI toàn bằng class `slate-*` (**358 lần**) + `text-white` (57 lần) + 2 màu hex cứng (`#1e1e1e` ở `EditorPane`, `#0a0f1d` ở `ProcessConsole`) + scrollbar hex trong `index.css`. Monaco cứng `theme="vs-dark"`. `BrowserWindow.backgroundColor` cứng `#020617`. | Cần hệ token màu. Có cách rẻ: remap thang `slate` của Tailwind sang CSS variable (xem M15) nên không phải sửa 358 chỗ bằng tay. |
| 3. Hướng cuộn preview | `PreviewPane.tsx` là 1 `<webview>` chạy giao diện play của Slidev; điều hướng chỉ bằng nút ‹ › (giả lập phím Left/Right qua `sendInputEvent`). Không có kênh giao tiếp nào giữa app và nội dung trong webview. | Cần một "webview bridge" (preload script) — dùng chung cho cả yêu cầu 3 và 4. |
| 4. Click slide → nhảy tới chữ trong `.md` | Chưa có. `EditorPane.tsx` chưa có API ngoài (không có `ref`/handle để "reveal line"). | Cần: bridge bắt click → bộ định vị vị trí trong `.md` → `EditorPaneHandle.reveal()`. |

Route của Slidev mà plan này tận dụng (đối chiếu source `packages/client/routes.ts`): `/:no` (play), `/overview` (lưới toàn bộ slide + notes), `/print` (mọi slide xếp dọc, dùng cho export), `/presenter/:no`. Meta route của mỗi slide có `slide.start` (số dòng bắt đầu), `slide.filepath` và `slide.no` — đây là nguồn ánh xạ slide→dòng chính xác nhất.

---

## 1. Mục tiêu → Module

| # | Yêu cầu | Module |
|---|---|---|
| 1 | Mục Settings chỉnh mọi thứ (theme, port, …) | **M14 — Settings Hub** |
| 2 | Chọn theme cho app: hiện tại, academic kiểu Overleaf, thêm gợi ý | **M15 — Theme System** |
| 3 | Preview chọn kiểu lướt: ngang / dọc | **M16 — Preview Scroll Modes** |
| 4 | Bấm chữ trên slide → nhảy về chữ trong `.md` | **M17 — Click-to-Source** |

Thứ tự phụ thuộc: M14 (lõi) → M15 → M14 (UI đầy đủ) ; **Webview Bridge** (chung) → M16 → M17.

---

## 2. M14 — Settings Hub

### 2.1 Schema mới `AppSettings` (v2)

Chia theo nhóm, có `settingsVersion` để migrate từ 4 field cũ.

```ts
export interface AppSettingsV2 {
  settingsVersion: 2

  appearance: {
    themeId: string              // vd 'studio-dark', 'academic-overleaf'
    followSystem: boolean        // true → dùng themeIdLight/themeIdDark theo OS
    themeIdLight: string         // mặc định 'academic-overleaf'
    themeIdDark: string          // mặc định 'studio-dark'
    uiZoom: number               // 0.85 – 1.25 (webFrame.setZoomFactor)
    uiFontFamily: 'system' | 'inter' | 'source-sans'
  }

  editor: {
    fontSize: number             // (cũ: editorFontSize)
    fontFamily: string
    fontLigatures: boolean
    lineNumbers: boolean
    minimap: boolean
    wordWrap: 'on' | 'off'
    tabSize: 2 | 4
    renderWhitespace: 'none' | 'selection' | 'all'
    autoSave: 'off' | 'afterDelay' | 'onBlur'
    autoSaveDelayMs: number      // (hiện cứng 600)
    monacoTheme: 'follow-app' | string
  }

  preview: {
    navMode: 'paged' | 'scroll-vertical' | 'scroll-horizontal'   // M16
    wheelAxis: 'horizontal' | 'vertical' | 'both'                // chỉ áp dụng ở 'paged'
    scrollSnap: boolean
    slideGapPx: number
    fitMode: 'fit-width' | 'fit-height' | 'manual'
    colorScheme: 'follow-app' | 'light' | 'dark' | 'slide-default'
    restoreSlideAfterRestart: boolean
    sourceJump: {                                                // M17
      enabled: boolean
      trigger: 'alt-click' | 'ctrl-click' | 'double-click' | 'click'
      flashMs: number
      syncEditorToPreview: boolean
    }
  }

  server: {
    defaultPort: number          // thay cho hardcode 3030
    portScanRange: number        // thay cho +300 cứng
    strictPort: boolean          // true: cổng bận → báo lỗi, không tự tăng
    bindMode: 'localhost' | 'lan'  // 'lan' = cho thiết bị khác cùng mạng xem (--remote)
    remotePassword: string       // dùng khi bindMode='lan'
    openExternalBrowser: boolean // thay cho --open=false cứng
    startupTimeoutMs: number     // thay cho 15000 cứng
    extraArgs: string            // vd "--log info"
    autoInstallDeps: boolean
    packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun'
    registry: string             // rỗng = mặc định
    stopServerOnTabClose: boolean
    keepServersOnQuit: boolean   // mặc định false (giữ hành vi hiện tại)
  }

  export: {
    defaultFormat: ExportFormat
    outputDir: 'project/export' | string
    defaultOptions: ExportOptions
    openFolderAfterExport: boolean
  }

  projects: {
    defaultWorkspaceDir: string  // (cũ)
    defaultAuthor: string        // điền sẵn ở Wizard
    defaultCliRange: string      // "^53.0.0" cho project mới
    gitInitOnCreate: boolean
    restoreTabsOnLaunch: boolean
    confirmBeforeCloseTab: boolean
  }

  system: {
    nodePathOverride: string     // (cũ)
    logLevel: 'error' | 'info' | 'debug'
  }
}
```

**Migration** (`projectStore.init()`): nếu file `~/.slidev-studio/projects.json` chưa có `settingsVersion` → map `editorFontSize→editor.fontSize`, `themeMode→appearance` (dark→`studio-dark`, light→`academic-overleaf`, system→`followSystem=true`), `defaultWorkspaceDir→projects.defaultWorkspaceDir`, `nodePathOverride→system.nodePathOverride`; sao lưu bản cũ thành `projects.json.bak-v1` trước khi ghi.

### 2.2 Kiến trúc

```
main:  projectStore (deep-merge + sanitize + migrate)
        └─ ipc settings:get | settings:update(partial) | settings:reset(group?) | settings:export | settings:import
        └─ sau mỗi update → broadcast 'settings:changed' tới mọi BrowserWindow
preload: api.settings.{get,update,reset,export,import,onChange}   (giữ api.projects.get/updateSettings làm alias 1 phase)
renderer: <SettingsProvider> ở main.tsx → useSettings() thay cho 3 bản sao hiện tại
```

- `sanitizeSettings()` viết tay (không thêm dependency): ép kiểu, `clamp` (port 1024–65535, fontSize 10–32, zoom 0.85–1.25…), enum không hợp lệ → về mặc định.
- **Áp dụng tức thì (live) + nút Hoàn tác**: đổi theme/font/zoom thấy ngay; giữ snapshot lúc mở trang, nút "Hoàn tác thay đổi" khôi phục. Bỏ kiểu "bấm Lưu mới có hiệu lực" cho các mục thuần giao diện; riêng nhóm **Server** hiện banner "Cần khởi động lại server để áp dụng" + nút Restart.
- Ghi file debounce 300ms để kéo slider không ghi đĩa liên tục.

### 2.3 Giao diện trang Settings

Chuyển từ modal sang **view toàn màn hình** (`AppView` thêm `'settings'` trong `App.tsx`), mở từ Home, từ header Workspace và phím `Cmd/Ctrl + ,`. Bố cục: sidebar trái (danh mục) + nội dung phải + ô tìm kiếm ở trên cùng (lọc theo tên/mô tả mục). Mỗi mục có nút reset về mặc định riêng và nhãn "đã thay đổi".

| Danh mục | Nội dung chính |
|---|---|
| Giao diện | Theme picker dạng thẻ có mini-preview, Theo hệ thống (chọn cặp sáng/tối), zoom UI, font UI |
| Trình soạn thảo | Cỡ chữ, font, ligature, minimap, wrap, tab size, autosave (kiểu + độ trễ), theme Monaco |
| Xem trước | Kiểu điều hướng (M16), trục cuộn chuột, snap, khoảng cách slide, fit, color scheme, **Click-to-Source** (M17) |
| Máy chủ & Kết nối | Cổng mặc định, dải quét, strict port, LAN/localhost + mật khẩu, mở trình duyệt ngoài, timeout, tham số CLI thêm, package manager, registry, hành vi khi đóng tab/thoát app |
| Xuất file | Định dạng mặc định, thư mục xuất, tuỳ chọn mặc định, mở thư mục sau khi xuất |
| Dự án & Template | Thư mục mặc định, tác giả mặc định, range `@slidev/cli`, git init, khôi phục tab, xác nhận đóng tab |
| Hệ thống | Đường dẫn Node, chẩn đoán (Node/Git/Playwright), mở thư mục `~/.slidev-studio`, xuất/nhập settings JSON, reset toàn bộ, phiên bản app |
| Phím tắt | Bảng phím tắt hiện có (giai đoạn sau mới cho đổi phím) |

### 2.4 Nhóm Port / kết nối — thay đổi cụ thể

- `processManager.start()` tự đọc `settings.server` (không nhận `preferredPort` mặc định 3030 từ renderer nữa). **Thứ tự ưu tiên cổng:** `project.preferredPort` → `server.defaultPort`.
- `findFreePort(preferred, range, strict)`: `strict=true` mà cổng bận → ném lỗi rõ ràng "Cổng 3030 đang bị chiếm bởi tiến trình khác" (kèm gợi ý đổi cổng), thay vì lặng lẽ nhảy sang 3031.
- URL preview dựng từ cổng thực tế Slidev in ra (đã có regex), không hardcode host; khi `bindMode='lan'` hiển thị thêm địa chỉ mạng LAN trong toolbar Preview để mở trên điện thoại/máy khác.
- Thêm UI sửa `preferredPort` **theo từng dự án** (popover trên header Workspace + menu "…" của `ProjectCard`), ghi qua `projectStore.updateProject()` (hàm đã có).
- Cờ CLI cho LAN/remote/open (`--remote`, `--open`, bind address) **cần xác nhận bằng `slidev --help` của bản `^53`** trước khi map (Phase 7.0).

---

## 3. M15 — Theme System

### 3.1 Kiến trúc token (cách rẻ nhất để phủ 358 chỗ `slate-*`)

**Bước 1 — remap thang màu Tailwind sang CSS variable** (Tailwind ≥3.1 hỗ trợ `<alpha-value>`, dự án đang dùng `^3.4.4`):

```js
// tailwind.config.js
const scale = (name) => Object.fromEntries(
  [50,100,200,300,400,500,600,700,800,900,950]
    .map(n => [n, `rgb(var(--${name}-${n}) / <alpha-value>)`]))

theme: { extend: { colors: { slate: scale('slate'), blue: scale('accent') } } }
```

Nhờ vậy `bg-slate-900`, `border-slate-800/50`, `text-slate-400`, `bg-blue-600`… tự đổi theo theme mà **không cần sửa từng class**. Ở theme sáng, thang `slate` được đảo (950 = nền sáng nhất, 50 = chữ đậm nhất).

**Bước 2 — sinh thang màu từ ít màu neo** (không viết tay 11 bậc × 14 theme): mỗi theme chỉ khai `bg, surface, border, fg, fgMuted, accent`; hàm `buildScale()` nội suy sRGB từ `bg → fg` ra 11 bậc và từ `accent` ra thang accent. `applyTheme(theme)` set các biến lên `document.documentElement.style` + `data-theme` + `color-scheme`.

**Bước 3 — dọn ngoại lệ** (~1 buổi, có thể grep-sửa):
- `text-white` / `hover:text-white` trên nền trung tính (57 chỗ) → `text-slate-50` (để theme sáng không bị "chữ trắng trên nền trắng"); giữ `text-white` chỉ trên nút accent.
- `bg-[#1e1e1e]` (EditorPane) và `bg-[#0a0f1d]` (ProcessConsole) → `bg-slate-950`/`bg-slate-900`.
- Scrollbar trong `index.css` → dùng biến `--slate-*`.
- Màu trạng thái (`emerald/amber/rose`) giữ nguyên, kiểm tra độ tương phản trên theme sáng; nếu thiếu thì thêm biến `--ok/--warn/--danger`.

**Bước 4 — đồng bộ các "bề mặt" ngoài React:**
- **Monaco:** `beforeMount` gọi `monaco.editor.defineTheme('studio-<themeId>', { base: 'vs' | 'vs-dark' | 'hc-black', inherit: true, rules: [], colors: { 'editor.background': bg, 'editor.foreground': fg, 'editorLineNumber.foreground': fgMuted, 'editorCursor.foreground': accent, 'editor.selectionBackground': accent+'40', … } })`; `EditorPane` bỏ `theme="vs-dark"` cứng.
- **Cửa sổ Electron:** `main.ts` đặt `backgroundColor` theo theme đã lưu (tránh nháy trắng/đen khi mở), `nativeTheme.themeSource = 'light'|'dark'|'system'`; lắng nghe `nativeTheme.on('updated')` để đổi theme khi `followSystem`.
- **Chống nháy khi khởi động:** `index.html` có script inline đọc `localStorage['studio-theme-cache']` và set biến CSS trước khi React render; `SettingsProvider` cập nhật cache mỗi khi theme đổi.
- **Webview (slide):** tuỳ chọn `preview.colorScheme` (follow-app / light / dark / slide-default) áp qua bridge (M16), vì Slidev có chế độ sáng/tối riêng lưu trong `localStorage` của trang (tên khoá cần xác nhận ở Phase 7.0).

### 3.2 Danh sách theme đề xuất

Màu dưới đây là **điểm neo xấp xỉ** theo bảng màu công khai của từng theme, tinh chỉnh khi implement. Không dùng logo/tài sản thương hiệu của Overleaf — chỉ lấy *cảm giác bố cục và bảng màu* (thanh công cụ tối, vùng soạn thảo sáng, nút xanh lá).

**Nhóm Sáng**

| id | Tên | bg | surface | border | fg | accent | Ghi chú |
|---|---|---|---|---|---|---|---|
| `academic-overleaf` | **Academic (kiểu Overleaf)** | `#ffffff` | `#f4f5f6` | `#d0d5dd` | `#1b222c` | `#138a07` | Header/toolbar tối `#1b222c` chữ sáng, vùng editor và panel nền sáng, nút hành động chính màu xanh lá. Font UI Source Sans 3 (template `hcmut-bach` đã có sẵn file woff2, tái dùng được). Đây là theme sáng mặc định. |
| `github-light` | GitHub Light | `#ffffff` | `#f6f8fa` | `#d0d7de` | `#1f2328` | `#0969da` | Sạch, quen mắt dân dev |
| `solarized-light` | Solarized Light | `#fdf6e3` | `#eee8d5` | `#d3cbb7` | `#586e75` | `#268bd2` | Dịu mắt, tương phản vừa phải |
| `catppuccin-latte` | Catppuccin Latte | `#eff1f5` | `#e6e9ef` | `#ccd0da` | `#4c4f69` | `#1e66f5` | Pastel hiện đại |
| `paper-sepia` | Paper / Sepia | `#f4ecd8` | `#ebe1c7` | `#d6c9a6` | `#433422` | `#a0522d` | Đọc lâu, hợp lúc chỉnh nội dung dài |

**Nhóm Tối**

| id | Tên | bg | surface | border | fg | accent | Ghi chú |
|---|---|---|---|---|---|---|---|
| `studio-dark` | **Studio Dark (hiện tại)** | `#020617` | `#0f172a` | `#1e293b` | `#f1f5f9` | `#3b82f6` | Giữ nguyên diện mạo hiện có, là theme tối mặc định |
| `github-dark` | GitHub Dark | `#0d1117` | `#161b22` | `#30363d` | `#e6edf3` | `#2f81f7` | |
| `dracula` | Dracula | `#282a36` | `#21222c` | `#44475a` | `#f8f8f2` | `#bd93f9` | Khớp với template slide `dracula` đã bundle |
| `nord` | Nord | `#2e3440` | `#3b4252` | `#4c566a` | `#eceff4` | `#88c0d0` | Xanh lạnh, ít chói |
| `tokyo-night` | Tokyo Night | `#1a1b26` | `#16161e` | `#292e42` | `#c0caf5` | `#7aa2f7` | |
| `catppuccin-mocha` | Catppuccin Mocha | `#1e1e2e` | `#181825` | `#313244` | `#cdd6f4` | `#cba6f7` | Cặp với Latte |
| `solarized-dark` | Solarized Dark | `#002b36` | `#073642` | `#586e75` | `#93a1a1` | `#268bd2` | Cặp với Solarized Light |
| `midnight-oled` | Midnight OLED | `#000000` | `#0a0a0a` | `#1c1c1c` | `#e5e5e5` | `#22d3ee` | Đen tuyền cho màn OLED |
| `high-contrast` | High Contrast | `#000000` | `#0a0a0a` | `#ffffff` | `#ffffff` | `#ffd60a` | Khả năng tiếp cận; Monaco base `hc-black` |

**Gợi ý phạm vi làm:** đợt 1 (MVP) gồm 6 theme: `studio-dark`, `academic-overleaf`, `github-light`, `dracula`, `nord`, `catppuccin-mocha`. Các theme còn lại chỉ là thêm 1 object vào registry `src/themes/registry.ts` nên bổ sung dần không tốn công.

**Cặp "Theo hệ thống" gợi ý:** `academic-overleaf` ↔ `studio-dark` (mặc định), `github-light` ↔ `github-dark`, `solarized-light` ↔ `solarized-dark`, `catppuccin-latte` ↔ `catppuccin-mocha`.

### 3.3 Theme picker trong Settings

Lưới thẻ 2–3 cột; mỗi thẻ vẽ mini-layout (thanh header + 3 cột + accent) bằng đúng màu của theme, có nhãn Sáng/Tối, dấu tick khi đang chọn; rê chuột = xem trước tạm thời, bấm = chọn. Có công tắc "Theo hệ thống" mở ra 2 dropdown chọn cặp sáng/tối.

---

## 4. M16 — Preview Scroll Modes

### 4.1 Ba chế độ

| `preview.navMode` | Cách hoạt động | Cách làm |
|---|---|---|
| `paged` (hiện tại) | Mỗi lần 1 slide, ←/→ | Giữ nguyên `/:no` của Slidev. Thêm `wheelAxis`: cuộn dọc/ngang của chuột/trackpad ↔ slide trước/sau (bridge bắt `wheel`, có ngưỡng + khoá 350ms để không nhảy nhiều slide 1 lần vuốt). |
| `scroll-vertical` | Mọi slide xếp dọc, lướt lên xuống | Webview tải route **`/print`** (mọi slide full-size xếp dọc) rồi bridge `insertCSS` để: co theo bề rộng panel, thêm khoảng cách `slideGapPx`, nền theo theme, bỏ ngắt trang; tuỳ chọn `scroll-snap-type: y mandatory`. |
| `scroll-horizontal` | Dải phim, kéo/vuốt ngang | Cũng `/print`, CSS: container `display:flex; flex-direction:row; overflow-x:auto; scroll-snap-type:x mandatory`, mỗi slide `flex:0 0 auto`; bridge map wheel dọc → cuộn ngang (Shift-less) và cho kéo bằng chuột (pointer drag). |

Lý do chọn `/print` thay vì tự dựng N `<webview>`/iframe: 1 trang duy nhất, dùng đúng renderer của Slidev (theme, layout, component) và không tốn N bản dev-server client. Đổi lại `/print` **không có animation/transition/click-step** (giống bản xuất) — chấp nhận vì đây là chế độ "duyệt/đọc lướt"; cần xem hiệu ứng thì bật `paged`. Phương án dự phòng nếu `/print` lệch layout ở theme nào đó: dùng `/overview` (lưới thumbnail có sẵn của Slidev).

### 4.2 Đồng bộ vị trí khi đổi chế độ

Bridge báo lên app "slide đang xem" (`currentSlideNo`): ở `paged` lấy từ URL `/N`; ở chế độ cuộn dùng `IntersectionObserver` trên các phần tử `[data-slidev-no]` (slide nào chiếm nhiều diện tích nhất). Đổi chế độ → mở route mới rồi `scrollIntoView` tới slide đó, **không nhảy về slide 1**. Giá trị này dùng chung cho: khôi phục sau Recompile/Restart (thay cho việc parse `getURL()` hiện nay), Click-to-Source và đồng bộ editor→preview.

### 4.3 Webview Bridge (hạ tầng dùng chung M16 + M17)

- Thêm file `electron/webview-preload.ts`, build thành entry preload thứ 2 (kiểm tra `electron.vite.config.ts` → `preload.build.rollupOptions.input`), tạo `<webview preload={fileUrl}>`; đường dẫn tuyệt đối lấy qua IPC/`process.resourcesPath` để chạy đúng cả dev lẫn app đã đóng gói.
- Bridge chạy trong isolated world (webview đang `contextIsolation=yes` — vẫn truy cập được DOM, `ipcRenderer.sendToHost` vẫn dùng được). Giao thức tin nhắn:
  - Host → webview: `studio:set-mode {navMode, gap, snap, colorScheme}`, `studio:goto {no}`, `studio:set-jump {enabled, trigger}`.
  - Webview → host (`ipc-message`): `studio:slide-changed {no}`, `studio:source-click {…}` (M17), `studio:ready`.
- Áp lại cấu hình mỗi khi trang điều hướng/HMR làm DOM đổi (`did-finish-load`, `MutationObserver` nhẹ trên container).
- `PreviewPane` bổ sung thanh công cụ: nút chuyển nhanh 3 chế độ (icon), hiển thị "Slide N / Tổng".

---

## 5. M17 — Click-to-Source (slide → `.md`)

### 5.1 Cử chỉ kích hoạt

Mặc định **Alt/Option + Click** (`preview.sourceJump.trigger`) để không phá tương tác của Slidev (nút, `v-click`, component có `@click`). Khi giữ phím: con trỏ đổi thành dạng "định vị", phần tử dưới chuột có viền nhấn nhẹ. Lựa chọn khác: Ctrl+Click, double-click, click thường (cảnh báo dễ xung đột).

### 5.2 Luồng xử lý

```
[webview] click(+modifier)
   → thu thập payload { slideNo, clickedText, context, kind, codeLine?, path? }
   → sendToHost('studio:source-click')
[renderer] SourceLocator.resolve(payload) → { file, line, column, length, confidence }
   → EditorPaneHandle.reveal(...) (mở file nếu khác, mở panel editor nếu đang thu, cuộn, chọn, nhấp nháy)
```

**Payload từ bridge:**
- `slideNo`: `closest('[data-slidev-no]')` (hoạt động ở mọi chế độ, kể cả `/print`); dự phòng lấy từ URL `/N`.
- `clickedText`: từ `document.caretRangeFromPoint(x,y)` lấy text node + offset → mở rộng ra **từ/cụm từ** quanh điểm click; nếu người dùng đang bôi đen thì lấy đúng vùng bôi đen.
- `context`: `innerText` của khối gần nhất (`p, li, h1–h6, td, blockquote`), cắt ~200 ký tự.
- `occurrenceIndex`: đây là lần xuất hiện thứ mấy của `clickedText` trong slide theo thứ tự DOM (để phân biệt khi 1 từ lặp nhiều lần).
- `kind`: `text | heading | list | code | image | table | component`; với code: ngôn ngữ (`pre[class*=language-]`/shiki) và **chỉ số dòng trong khối** (phần tử `.line`).
- `path` (chuỗi tổ tiên tag/class rút gọn) để debug.

### 5.3 Ánh xạ slide → dải dòng trong `.md`

Ưu tiên theo thứ tự:

1. **Hỏi chính Slidev** (chính xác nhất): bridge lấy router từ app Vue (`document.querySelector('#app').__vue_app__.config.globalProperties.$router`) rồi đọc `getRoutes().find(r => r.meta?.slide?.no === n).meta.slide` → `{ start, filepath, no }`. Nhờ đó xử lý luôn slide `src:` import từ file khác, slide bị ẩn (`hide`), đánh số chính xác. *(Cần spike xác nhận ở bản `^53`, xem Phase 7.0.)*
2. **Parser dự phòng** `src/lib/slideIndex.ts`: tách `.md` theo `---`, bỏ qua `---` trong code fence (``` và `~~~`), nhận diện frontmatter đầu file và frontmatter từng slide (khối `---` … `---` chứa YAML), trả `[{no, startLine, contentStartLine, endLine, file}]`; theo dõi `src:` để trỏ sang file con. Có unit test với vài `slides.md` mẫu (các template đang bundle).

`endLine` của slide = `start` của slide kế tiếp − 1 (cùng file).

### 5.4 Định vị chữ trong dải dòng

Thuật toán `SourceLocator.locate(text, contextText, occurrenceIndex, lines[])`:

1. **Chuẩn hoá cả hai phía**: bỏ cú pháp Markdown/inline (`**`, `*`, `_`, `` ` ``, `[chữ](url)`→`chữ`, `![alt](src)`, tiêu đề `#`, dấu list/quote, thẻ HTML, `{{ }}` mustache, `$…$` giữ nguyên nội dung), gộp khoảng trắng, hạ chữ hoa/thường, bỏ dấu tiếng Việt khi so sánh phụ (để chịu được khác biệt Unicode NFC/NFD). Giữ bảng ánh xạ vị trí chuẩn hoá → cột thật trong dòng gốc.
2. **Khớp chính xác** `clickedText` chuẩn hoá trong từng dòng của dải (bỏ qua các dòng frontmatter của slide trừ khi `kind` cho biết); gom mọi ứng viên theo thứ tự, chọn ứng viên thứ `occurrenceIndex`.
3. **Khớp mờ** nếu không có: chấm điểm mỗi dòng theo độ trùng token giữa `context` và dòng (Jaccard + thưởng khi chứa cụm dài nhất); chọn dòng điểm cao nhất vượt ngưỡng; cột = vị trí cụm khớp dài nhất.
4. **Code block**: tìm khối fence thứ k trong slide tương ứng (đếm theo thứ tự DOM), dòng = `dòng mở fence + 1 + codeLine` (điều chỉnh khi fence có meta như ```` ```ts {1,3|5} [file.ts] ````; Magic Move/Monaco runner sẽ dùng dự phòng bước 5).
5. **Dự phòng cuối**: nhảy tới dòng đầu nội dung của slide (`contentStartLine`) và hiện toast "Không xác định được vị trí chính xác — đã đưa bạn tới đầu slide N". Trường hợp chữ đến từ component Vue/prop hoặc ký tự do CSS/`::before` sinh ra rơi vào đây.

Kết quả kèm `confidence: 'exact' | 'fuzzy' | 'slide'` để UI hiển thị mức tin cậy (viền nhấp nháy xanh / vàng / xám).

### 5.5 Phía Editor

Biến `EditorPane` thành `forwardRef<EditorPaneHandle>`:

```ts
interface EditorPaneHandle {
  reveal(t: { file: string; line: number; column?: number; length?: number; confidence: 'exact'|'fuzzy'|'slide' }): void
}
```

- Nếu `file` ≠ `activeFilePath` → `onUpdateTab({ activeFilePath: file })`, lưu `pendingReveal` trong ref và thực thi sau khi nội dung nạp xong (hiện `EditorPane` nạp file bất đồng bộ).
- Nếu panel editor đang thu nhỏ → `editorPanelRef.current?.expand()` trước khi reveal.
- `editor.revealLineInCenterIfOutsideViewport(line)`, `setSelection(range)`, `focus()`, và `deltaDecorations` gắn class `.jump-flash` (animation 1 giây theo `flashMs`; màu lấy từ biến accent của theme).
- Chọn vùng chữ khớp (nếu `length` có) để người dùng gõ đè/nhìn thấy ngay.

### 5.6 Chiều ngược lại (tuỳ chọn, cùng bộ máy) — đồng bộ Editor → Preview

`preview.sourceJump.syncEditorToPreview`: khi con trỏ Monaco đứng ở dòng L, dùng chính bảng `slideIndex` (hoặc route meta) tìm slide chứa L rồi `studio:goto {no}` (debounce ~250ms, chỉ chạy khi con trỏ *đổi slide*, và không chạy khi thay đổi đến từ chính lần Click-to-Source để tránh vòng lặp). Tắt mặc định.

---

## 6. Kế hoạch triển khai theo Phase

| Phase | Nội dung | Module | Ước lượng |
|---|---|---|---|
| 7.0 | **Spike xác nhận** (xem 6.1) | — | 0.5 ngày |
| 7.1 | Schema v2, migrate, deep-merge + sanitize, IPC `settings:*`, `SettingsProvider`, xoá 3 bản sao settings | M14 | 1 ngày |
| 7.2 | Token màu (remap `slate`/`blue`), `buildScale`, registry + 6 theme MVP, dọn `text-white`/hex cứng, Monaco theme, `backgroundColor`/`nativeTheme`, chống nháy | M15 | 2 ngày |
| 7.3 | Trang Settings toàn màn hình + đủ 8 danh mục; nối port/host/timeout/strict/extra-args/package-manager vào `processManager` + `portFinder`; UI sửa port theo dự án | M14 | 2 ngày |
| 7.4 | Webview Bridge (preload thứ 2, giao thức, theo dõi `currentSlideNo`) | Chung | 1 ngày |
| 7.5 | 3 chế độ điều hướng, `wheelAxis`, đồng bộ vị trí khi đổi chế độ, nút chuyển nhanh trên toolbar | M16 | 1.5 ngày |
| 7.6 | Click-to-Source: payload, `slideIndex`, `SourceLocator`, `EditorPaneHandle.reveal`, toast/flash | M17 | 2–2.5 ngày |
| 7.7 | (Tuỳ chọn) Editor→Preview sync; thêm các theme còn lại | M17 / M15 | 0.5–1 ngày |

Tổng: **~10–11 ngày công part-time**. 7.1 → 7.2 → 7.3 là một mạch; 7.4 → 7.5 → 7.6 là mạch còn lại và độc lập với theme, làm song song được.

### 6.1 Việc cần kiểm chứng ở Phase 7.0 (trước khi code)

1. Trên 1 project thật (bản `@slidev/cli ^53`): mở `http://localhost:PORT/print` và `/overview` trong webview, kiểm tra có tồn tại `[data-slidev-no]` trên từng slide, bề rộng cố định hay co giãn, có ngắt trang/nền trắng cần ghi đè CSS không.
2. Trong DevTools của webview: `document.querySelector('#app').__vue_app__` có tồn tại ở dev server không, và `$router.getRoutes()` có `meta.slide.start/filepath/no` không. Nếu không → chuyển hẳn sang parser `slideIndex`.
3. `slidev --help`: tên và giá trị mặc định của các cờ bind/remote/open/log.
4. Khoá `localStorage` lưu chế độ sáng/tối của Slidev để ép `preview.colorScheme`.
5. Hành vi click mặc định của Slidev trên vùng slide (có bước tiến click khi bấm không) để chốt cử chỉ mặc định.

---

## 7. Prompt chi tiết cho AI coding agent

### 🔹 Prompt 7.1 — Settings core

```
Bối cảnh: Slidev Studio (Electron + React + Tailwind). Settings hiện là 4 field phẳng
trong electron/services/projectStore.ts, updateSettings() chỉ shallow merge, và bị giữ
3 bản sao ở renderer (SettingsModal.tsx, ProjectWorkspace.tsx, HomeDashboard.tsx).
themeMode được lưu nhưng không áp dụng ở đâu.

Nhiệm vụ:
1. Định nghĩa AppSettingsV2 (xem Mục 2.1 tài liệu kế hoạch) dùng chung cho main và
   renderer (đặt ở một file types chung, tránh khai báo trùng ở env.d.ts và projectStore.ts).
2. projectStore: thêm settingsVersion, hàm migrateV1toV2 (sao lưu projects.json thành
   projects.json.bak-v1 trước khi ghi), deepMerge cho updateSettings, sanitizeSettings
   (clamp số, enum sai → mặc định), ghi file debounce 300ms.
3. IPC mới: settings:get, settings:update(partial), settings:reset(group?), settings:export,
   settings:import; sau mỗi update broadcast 'settings:changed' tới mọi BrowserWindow.
   preload + ipc-client + env.d.ts: expose api.settings.*; giữ api.projects.getSettings/
   updateSettings làm alias tạm.
4. Renderer: tạo SettingsProvider + hook useSettings() (bọc trong main.tsx), thay toàn bộ
   chỗ đọc/giữ settings riêng ở SettingsModal, ProjectWorkspace, HomeDashboard.
5. Sửa mọi chỗ dùng settings.editorFontSize → settings.editor.fontSize, v.v.

Tiêu chí hoàn thành: typecheck sạch; mở app với projects.json cũ (v1) → tự migrate, không
mất project; đổi 1 setting ở một nơi thì mọi nơi khác cập nhật ngay không cần reload.
```

### 🔹 Prompt 7.2 — Theme system

```
Bối cảnh: UI dùng class slate-* (358 chỗ), text-white (57 chỗ), 2 hex cứng (EditorPane
#1e1e1e, ProcessConsole #0a0f1d), scrollbar hex trong index.css, Monaco theme="vs-dark" cứng,
BrowserWindow.backgroundColor cứng. Đã có SettingsProvider (Prompt 7.1).

Nhiệm vụ:
1. tailwind.config.js: remap thang 'slate' → rgb(var(--slate-N) / <alpha-value>) và 'blue'
   → rgb(var(--accent-N) / <alpha-value>) cho N = 50…950.
2. src/themes/: types.ts (Theme { id, name, kind:'light'|'dark', bg, surface, border, fg,
   fgMuted, accent, monacoBase }), buildScale.ts (nội suy sRGB bg→fg và accent ra 11 bậc,
   đảo chiều cho theme sáng), registry.ts (đủ 6 theme: studio-dark, academic-overleaf,
   github-light, dracula, nord, catppuccin-mocha, màu neo theo Mục 3.2), applyTheme.ts
   (set biến CSS + data-theme + color-scheme lên documentElement, ghi cache localStorage).
3. index.html: script inline đọc cache và set biến trước khi React render.
4. Thay text-white/hover:text-white trên nền trung tính bằng text-slate-50; thay hex cứng
   bằng token; index.css scrollbar dùng biến.
5. EditorPane: defineTheme cho Monaco theo theme app (beforeMount), bỏ theme="vs-dark".
6. main.ts: backgroundColor theo theme đã lưu; nativeTheme.themeSource theo appearance;
   khi followSystem thì lắng nghe nativeTheme 'updated' và gửi sự kiện cho renderer.

Tiêu chí hoàn thành: đổi 6 theme ở Settings thì Home, Workspace, Editor (Monaco), Console,
scrollbar, modal, dialog xuất file đều đổi đúng; theme sáng không còn chữ trắng trên nền
sáng; khởi động lại không bị nháy màu; theme 'academic-overleaf' có header tối + vùng
làm việc sáng + accent xanh lá.
```

### 🔹 Prompt 7.3 — Trang Settings đầy đủ + port

```
Bối cảnh: đã có SettingsProvider và theme system. SettingsModal.tsx chỉ có 4 mục.
processManager.start() nhận preferredPort mặc định 3030 (renderer còn truyền `|| 3030` ở
App.tsx và ProjectWorkspace.tsx), findFreePort quét +300 cứng, host localhost cứng,
'--open=false' cứng, timeout 15000 cứng.

Nhiệm vụ:
1. Thay SettingsModal bằng view toàn màn hình 'settings' (thêm vào AppView trong App.tsx),
   mở từ Home, header Workspace và Cmd/Ctrl+, . Sidebar 8 danh mục + ô tìm kiếm; mỗi mục có
   nút reset riêng và nhãn "đã thay đổi"; thay đổi giao diện áp dụng live, có nút Hoàn tác.
2. Theme picker dạng thẻ (mini-layout vẽ bằng màu theme), công tắc "Theo hệ thống" + cặp
   sáng/tối.
3. Nối nhóm Server vào main: processManager và portFinder đọc settings.server
   (defaultPort, portScanRange, strictPort, bindMode, remotePassword, openExternalBrowser,
   startupTimeoutMs, extraArgs, autoInstallDeps, packageManager, registry). Thứ tự ưu tiên
   cổng: project.preferredPort → server.defaultPort. strictPort=true mà bận → ném lỗi rõ.
   Xoá mọi `|| 3030` ở renderer. Các cờ CLI bind/remote/open: xác nhận bằng `slidev --help`
   trước khi map, ghi kết quả vào comment.
4. Nhóm Server đổi xong hiện banner "Cần khởi động lại server" + nút Restart.
5. Thêm UI sửa preferredPort theo dự án (popover header Workspace + menu ProjectCard) dùng
   projectStore.updateProject().
6. Nối các nhóm Editor / Export / Projects / System vào đúng chỗ dùng (autosave delay và
   kiểu, minimap, wordWrap…, ExportDialog lấy mặc định, Wizard điền sẵn author + CLI range).

Tiêu chí hoàn thành: đổi cổng mặc định sang 4000 → mở project mới chạy ở 4000; bật
strictPort khi 4000 bận → hiện lỗi rõ ràng, không tự nhảy cổng; bật LAN → toolbar Preview
hiện địa chỉ mạng; đổi autosave delay có hiệu lực ngay ở editor đang mở.
```

### 🔹 Prompt 7.4 — Webview Bridge

```
Bối cảnh: PreviewPane.tsx dùng <webview> nhưng không có kênh nào với nội dung trong đó.

Nhiệm vụ:
1. Tạo electron/webview-preload.ts; cấu hình electron.vite.config.ts build thêm entry
   preload thứ hai; lấy đường dẫn file:// tuyệt đối (dev và bản đóng gói) qua IPC rồi gán
   thuộc tính preload của <webview>.
2. Giao thức (ipcRenderer.sendToHost / webview.send): host→webview: studio:set-mode,
   studio:goto, studio:set-jump; webview→host: studio:ready, studio:slide-changed {no},
   studio:source-click {…}. Định nghĩa kiểu TS dùng chung cho hai phía.
3. Bridge tự áp lại cấu hình sau did-finish-load và khi DOM đổi (MutationObserver nhẹ).
4. PreviewPane: nghe 'ipc-message', giữ currentSlideNo; hiển thị "Slide N / Tổng" trên
   toolbar; thay cách khôi phục slide sau Recompile bằng currentSlideNo (giữ tương thích
   getCurrentSuffix).

Tiêu chí hoàn thành: chuyển slide bằng phím trong webview thì "Slide N" trên toolbar đổi
theo; sau Recompile vẫn về đúng slide.
```

### 🔹 Prompt 7.5 — Scroll modes

```
Bối cảnh: đã có Webview Bridge (Prompt 7.4). Settings có preview.navMode ('paged' |
'scroll-vertical' | 'scroll-horizontal'), wheelAxis, scrollSnap, slideGapPx, fitMode.

Nhiệm vụ:
1. paged: giữ route /:no; wheelAxis quyết định trục wheel/trackpad nào chuyển slide
   (ngưỡng delta + khoá ~350ms chống nhảy nhiều slide).
2. scroll-vertical: webview tải /print; bridge insertCSS: co theo bề rộng panel (fitMode),
   khoảng cách slideGapPx, nền theo theme, bỏ ngắt trang, tuỳ chọn scroll-snap-type y.
3. scroll-horizontal: cũng /print, CSS flex-row + overflow-x:auto + snap x; wheel dọc →
   cuộn ngang; hỗ trợ kéo chuột (pointer drag).
4. Đổi chế độ giữ nguyên slide đang xem (goto currentSlideNo, không về slide 1); dùng
   IntersectionObserver trên [data-slidev-no] để báo slide-changed ở chế độ cuộn.
5. Toolbar PreviewPane có nút chuyển nhanh 3 chế độ; Settings > Xem trước có đủ tuỳ chọn.
6. Nếu /print lệch layout, có phương án dự phòng dùng /overview (ghi rõ trong code).

Tiêu chí hoàn thành: cả 3 chế độ hoạt động với ít nhất 3 template; đổi chế độ không mất
vị trí; HMR khi sửa .md không làm mất chế độ đang chọn.
```

### 🔹 Prompt 7.6 — Click-to-Source

```
Bối cảnh: đã có Webview Bridge. Cần: Alt+Click vào chữ trên slide (preview) → editor mở
đúng vị trí chữ đó trong .md.

Nhiệm vụ:
1. Bridge: khi giữ phím theo preview.sourceJump.trigger, đổi con trỏ + viền nhấn phần tử,
   chặn click đó khỏi Slidev; thu payload { slideNo (closest [data-slidev-no]),
   clickedText (caretRangeFromPoint, mở rộng thành từ/cụm hoặc vùng bôi đen), context
   (innerText khối gần nhất ≤200 ký tự), occurrenceIndex, kind, codeLine? } rồi sendToHost.
2. Bridge cố lấy meta slide từ Vue router (`#app.__vue_app__…$router`, route.meta.slide
   {start, filepath, no}) và gửi kèm; nếu không có thì renderer dùng parser.
3. src/lib/slideIndex.ts: parser slides.md → [{no,startLine,contentStartLine,endLine,file}]
   (bỏ --- trong code fence ``` và ~~~, nhận frontmatter đầu file và từng slide, theo src:);
   kèm unit test cho slides.md của các template đang bundle.
4. src/lib/sourceLocator.ts: chuẩn hoá Markdown/inline/Unicode (có bảng ánh xạ cột), khớp
   chính xác theo occurrenceIndex → khớp mờ theo context → code block theo chỉ số dòng →
   dự phòng đầu slide; trả { file,line,column,length,confidence }. Có unit test cho: chữ
   in đậm/nghiêng, link, tiêu đề, list, chữ lặp nhiều lần, tiếng Việt có dấu, code block.
5. EditorPane → forwardRef<EditorPaneHandle> với reveal(): mở file nếu khác (pendingReveal
   chờ nạp xong), mở panel editor nếu đang thu, revealLineInCenterIfOutsideViewport,
   setSelection, focus, nhấp nháy bằng deltaDecorations (class .jump-flash, theo flashMs);
   toast khi confidence='slide'.
6. Settings > Xem trước > Click-to-Source: bật/tắt, cử chỉ, thời gian nhấp nháy.

Tiêu chí hoàn thành: Alt+Click vào tiêu đề, một dòng list, một từ in đậm, một dòng trong
code block, và một từ xuất hiện 3 lần trong cùng slide đều nhảy đúng dòng/cột; slide nhập
qua `src:` mở đúng file con; chữ do component sinh ra rơi về đầu slide kèm toast.
```

---

## 8. Rủi ro kỹ thuật cần lưu ý

1. **Remap `slate` cho theme sáng chưa hoàn hảo 100%**: những chỗ dùng `text-white`, `bg-black/…`, hoặc ảnh/SVG cứng màu sẽ lộ ra khi test theme sáng → chuẩn bị 1 vòng rà giao diện bằng mắt cho từng màn hình (Home, Wizard, Workspace, Export, Settings).
2. **`/print` không có animation/click-step** và có thể ép nền trắng/kích thước trang cố định tuỳ theme; chế độ cuộn là để duyệt/đọc, cần bản render đúng hiệu ứng thì dùng `paged`. Theme có CSS `@media print` riêng (như `hcmut-bach`) cần test riêng.
3. **`__vue_app__`/route meta là chi tiết nội bộ của Slidev** — có thể đổi giữa các phiên bản; vì vậy luôn giữ parser `slideIndex` làm đường dự phòng và bọc phần đọc router trong `try/catch`.
4. **Khớp chữ mờ có thể trỏ sai** khi cùng một cụm xuất hiện ở nhiều slide/dòng gần giống, hoặc khi nội dung sinh từ component/`v-for`/biến — nên luôn hiển thị `confidence` và cho phép người dùng thấy nó đã nhảy "đầu slide" thay vì im lặng trỏ sai.
5. **Alt+Click xung đột** với Slidev khi người dùng đã tự bind phím/`@click` cho slide → có tuỳ chọn đổi cử chỉ; bridge chỉ chặn sự kiện khi phím bổ trợ đang giữ.
6. **Cấu hình server lệch sau khi đổi setting**: đổi cổng/bind khi server đang chạy không tự áp dụng → bắt buộc có banner + nút Restart (đã đưa vào M14) để người dùng không tưởng app bỏ qua thay đổi.
7. **Chia sẻ qua LAN (`bindMode='lan'`)** mở server dev ra mạng: mặc định để `localhost`, khi bật phải hiện cảnh báo và khuyến nghị đặt mật khẩu.
8. **Nhồi quá nhiều tuỳ chọn** làm Settings khó dùng: giữ nhóm "Nâng cao" thu gọn mặc định (extra args, registry, timeout, dải quét cổng), ô tìm kiếm là đường vào chính.

---

## 9. Checklist kiểm thử

**Settings / Port**
- [ ] Mở app với `projects.json` phiên bản cũ → tự migrate, project còn đủ, có file `.bak-v1`.
- [ ] Đổi một setting → mọi màn hình liên quan cập nhật ngay, không cần reload.
- [ ] Đổi cổng mặc định → project mới chạy đúng cổng đó; `preferredPort` theo dự án ghi đè được cổng mặc định.
- [ ] `strictPort` bật + cổng bận → lỗi rõ ràng, không tự nhảy cổng; tắt → tự tăng cổng trong dải quét.
- [ ] `bindMode='lan'` → toolbar hiển thị địa chỉ LAN, truy cập được từ thiết bị khác (có mật khẩu nếu đặt).
- [ ] Nhập/xuất settings JSON, "Reset toàn bộ", "Reset nhóm" đều hoạt động; giá trị sai trong file nhập bị sanitize.
- [ ] Ô tìm kiếm trong Settings lọc đúng theo tên và mô tả.

**Theme**
- [ ] 6 theme MVP áp dụng đúng cho Home, Wizard, Workspace, Export, Settings, Console, scrollbar, Monaco.
- [ ] `academic-overleaf`: header tối, vùng làm việc sáng, accent xanh lá, không có chữ trắng trên nền sáng.
- [ ] "Theo hệ thống": đổi chế độ sáng/tối của OS → app đổi theo cặp đã chọn khi đang chạy.
- [ ] Khởi động lại không nháy màu; cửa sổ mở ra đúng màu nền theme đã lưu.
- [ ] `preview.colorScheme` ép được chế độ sáng/tối của slide trong webview.

**Scroll modes**
- [ ] `paged`: `wheelAxis` dọc/ngang/cả hai hoạt động, một cú vuốt không nhảy nhiều slide.
- [ ] `scroll-vertical` và `scroll-horizontal` hiển thị đủ slide đúng theme, cuộn/snap mượt, kéo chuột được ở chế độ ngang.
- [ ] Đổi chế độ giữ nguyên slide đang xem; Recompile/Restart vẫn quay về đúng slide.
- [ ] HMR khi gõ trong editor không làm mất chế độ đang chọn hay vị trí cuộn.

**Click-to-Source**
- [ ] Alt+Click vào: tiêu đề, dòng list, từ in đậm, link, ô bảng → nhảy đúng dòng và tô đúng chữ.
- [ ] Từ lặp 3 lần trong một slide → chọn đúng lần xuất hiện được click.
- [ ] Click vào dòng trong code block → nhảy đúng dòng trong fence (kể cả fence có `{1,3|5}`).
- [ ] Slide nhập bằng `src:` → mở đúng file con; panel editor đang thu nhỏ tự mở ra.
- [ ] Chữ do component sinh ra → về đầu slide kèm toast, không báo sai.
- [ ] Chạy đúng ở cả 3 chế độ điều hướng; cử chỉ khác (Ctrl+Click / double-click) đổi được trong Settings.
- [ ] (Nếu làm 7.7) Di chuyển con trỏ sang slide khác trong editor thì preview theo, không bị vòng lặp với Click-to-Source.

---

## 10. Tài liệu tham khảo

- Slidev routes (`/:no`, `/overview`, `/print`, `/presenter/:no`, meta `slide.start/filepath/no`): `packages/client/routes.ts` trong repo slidevjs/slidev
- Slidev CLI (các cờ `--port`, `--open`, `--remote`, `--force`, …): https://sli.dev/builtin/cli — **đối chiếu lại bằng `slidev --help` của bản đang dùng**
- Slidev Overview: https://sli.dev/guide/overview
- Tailwind — màu với `<alpha-value>` và CSS variable: https://tailwindcss.com/docs/customizing-colors
- Monaco `defineTheme`: https://microsoft.github.io/monaco-editor/typedoc/functions/editor.defineTheme.html
- Electron `<webview>` (preload, `sendToHost`, `insertCSS`): https://www.electronjs.org/docs/latest/api/webview-tag
