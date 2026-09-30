# Kế hoạch nâng cấp **Slidev Studio** — Phase 6

> Resizable layout (cột kéo-thả + size động) · Export đa định dạng · Recompile · Bổ sung template từ Theme Gallery

Tài liệu này là bản **nối tiếp** `plan/slidev-28-09.md` (Phase 0-5 đã có sẵn trong code: app shell, process manager, Monaco editor, file tree, project registry, export cơ bản, new-project wizard). Sau khi rà lại source (`Slidev_clean_20260928_163123.zip`), dưới đây là hiện trạng từng phần liên quan tới 4 yêu cầu nâng cấp, kèm giải pháp cụ thể và prompt để đưa thẳng cho AI coding agent.

---

## 0. Đối chiếu hiện trạng

| Yêu cầu | File liên quan | Hiện trạng thực tế trong code |
|---|---|---|
| Cột kéo ra vào | `src/pages/ProjectWorkspace.tsx` (dòng ~418-450) | 3 cột `w-56 shrink-0` (FileTree) + `flex-1` (Editor) + `flex-1` (Preview) — **width cố định**, không có drag-handle. Console drawer cũng `h-64 shrink-0` cố định. |
| Size dynamic | *(chưa có)* | Không có cơ chế lưu/khôi phục kích thước panel theo từng project. |
| Xuất nhiều định dạng | `electron/ipc/export.ipc.ts`, `src/components/ExportDialog.tsx` | Đã hỗ trợ `pdf \| png \| pptx \| build`, gọi đúng `slidev export --format <x> --output <dir>`. Chưa có `md`, `pptx-editable`, chưa có tùy chọn `--range/--dark/--with-clicks/--omit-background`, chưa xuất hàng loạt (batch) cho project nhiều entry file. |
| Recompile | `ProjectWorkspace.tsx` nút **Restart** → `api.process.restart()` | Restart hiện tại chỉ kill + spawn lại tiến trình, **không xoá cache Vite/esbuild** và **mất vị trí slide đang xem** (webview load lại về slide 1). Chưa có nút "buộc biên dịch lại" tách biệt. |
| Thêm template mẫu | `electron/services/scaffolder.ts` (`BUNDLED_TEMPLATES`), `electron/templates/*` | Đã bundle 4 template: `default`, `seriph`, `frankfurt-academic`, `bricks`. Phiên bản `@slidev/cli` giữa các template **không đồng bộ** (`default` ghim `^0.49.0`, `frankfurt-academic` ghim `^52.19.1` — Slidev đổi từ SemVer 0.x sang "Epoch SemVer" kể từ v51, nên hai mốc này thực chất cách nhau rất xa). |

---

## 1. Mục tiêu Phase 6 → Module

| # | Yêu cầu | Module |
|---|---|---|
| 1 | Cột có thể kéo ra vào | **M10 — Resizable Workspace Layout** |
| 2 | Size có thể dynamic | M10 (persist theo `autoSaveId` mỗi project) |
| 3 | Hỗ trợ xuất nhiều định dạng | **M11 — Export nâng cao & Batch Export** |
| 4 | Recompile | **M12 — Force Recompile (phân biệt với Restart)** |
| 5 | Thêm template mẫu từ Theme Gallery | **M13 — Mở rộng thư viện Template** |

---

## 2. M10 — Resizable Workspace Layout

### 2.1 Chọn giải pháp
Dùng thư viện **`react-resizable-panels`** (~7KB, không phụ thuộc, tương thích React 18 đang dùng trong `package.json`). Lý do chọn thay vì tự viết drag-handler bằng tay:
- Có sẵn `autoSaveId` → **tự động lưu % kích thước từng panel vào `localStorage`**, đúng yêu cầu "size dynamic" mà không cần thêm IPC hay sửa `projectStore.ts`.
- Hỗ trợ `minSize`/`maxSize`/`collapsible`/`collapsedSize` theo %, tránh kéo panel về 0px làm vỡ layout Monaco/webview.
- Hoạt động tốt lồng nhau (nested: ngang cho 3 cột, dọc cho console drawer).

```bash
npm install react-resizable-panels
```

### 2.2 Cấu trúc panel đề xuất

```
PanelGroup direction="vertical"  autoSaveId="workspace-v-{projectId}"
├─ Panel "body"     defaultSize=75 minSize=40
│   └─ PanelGroup direction="horizontal" autoSaveId="workspace-h-{projectId}"
│       ├─ Panel "filetree" defaultSize=18 minSize=0 maxSize=35 collapsible collapsedSize=0
│       ├─ ResizeHandle
│       ├─ Panel "editor"   defaultSize=41 minSize=20
│       ├─ ResizeHandle
│       └─ Panel "preview"  defaultSize=41 minSize=20
├─ ResizeHandle (chỉ render khi isConsoleOpen)
└─ Panel "console"  defaultSize=25 minSize=10 maxSize=60   (chỉ render khi isConsoleOpen)
```

### 2.3 Sửa `ProjectWorkspace.tsx` — thay khối "3-Column Split View Body"

```tsx
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels'

const fileTreePanelRef = useRef<ImperativePanelHandle>(null)

// Handle "resize" component tái sử dụng
const HDivider = () => (
  <PanelResizeHandle className="w-[3px] bg-slate-800 hover:bg-blue-500/70 active:bg-blue-500 transition-colors cursor-col-resize relative group">
    <div className="absolute inset-y-0 -left-1 -right-1" /> {/* vùng bắt chuột rộng hơn cho dễ kéo */}
  </PanelResizeHandle>
)
const VDivider = () => (
  <PanelResizeHandle className="h-[3px] bg-slate-800 hover:bg-blue-500/70 active:bg-blue-500 transition-colors cursor-row-resize" />
)

<PanelGroup direction="vertical" autoSaveId={`workspace-v-${projectId}`} className="flex-1 min-h-0">
  <Panel defaultSize={75} minSize={40}>
    <PanelGroup direction="horizontal" autoSaveId={`workspace-h-${projectId}`}>
      <Panel
        ref={fileTreePanelRef}
        defaultSize={18} minSize={0} maxSize={35}
        collapsible collapsedSize={0}
        onCollapse={() => setIsFileTreeCollapsed(true)}
        onExpand={() => setIsFileTreeCollapsed(false)}
      >
        <FileTree nodes={fileTree} activeFilePath={currentTab.activeFilePath}
          onSelectFile={(p) => onUpdateTab(projectId, { activeFilePath: p })}
          onRefresh={refreshFileTree} />
      </Panel>
      <HDivider />
      <Panel defaultSize={41} minSize={20}>
        <EditorPane filePath={currentTab.activeFilePath} fontSize={settings.editorFontSize} />
      </Panel>
      <HDivider />
      <Panel defaultSize={41} minSize={20}>
        <PreviewPane url={currentTab.serverUrl} status={currentTab.status} error={currentTab.error}
          onRetry={() => startDevServer()} onOpenConsole={() => setIsConsoleOpen(true)} />
      </Panel>
    </PanelGroup>
  </Panel>

  {isConsoleOpen && (
    <>
      <VDivider />
      <Panel defaultSize={25} minSize={10} maxSize={60}>
        <ProcessConsole logs={currentTab.logs}
          onClear={() => onUpdateTab(projectId, { logs: [] })}
          onClose={() => setIsConsoleOpen(false)} />
      </Panel>
    </>
  )}
</PanelGroup>
```

Nút Chevron trên header (đang thu/phóng FileTree bằng state `isFileTreeCollapsed`) chuyển sang gọi:
```ts
isFileTreeCollapsed ? fileTreePanelRef.current?.expand() : fileTreePanelRef.current?.collapse()
```
để hai cơ chế (kéo tay và bấm nút) luôn đồng bộ trạng thái.

### 2.4 "Double-click để reset về mặc định" (UX nhỏ nhưng hữu ích)
Thêm `onDoubleClick` vào mỗi `PanelResizeHandle`, gọi `panelRef.current?.resize(defaultSize)` cho panel liền kề — tránh trường hợp người dùng kéo lệch rồi không biết cách trả lại tỉ lệ ban đầu.

### 2.5 Vì sao đây đã là "dynamic size" đúng nghĩa
- `autoSaveId` khoá theo `projectId` → **mỗi project nhớ layout riêng** (vd. project ít file thì thu gọn FileTree, project cần xem kỹ Preview thì kéo rộng Preview) — tự lưu, tự khôi phục khi mở lại, không cần thêm bảng dữ liệu trong `projects.json`.
- Vì key theo `projectId`, khi xoá project khỏi registry nên dọn luôn `localStorage` key tương ứng (thêm 1 dòng `localStorage.removeItem` trong `projects.ipc.ts`/`projectStore.ts` phần `remove()`).

---

## 3. M11 — Export nâng cao & Batch Export

### 3.1 Định dạng & tuỳ chọn thực tế mà Slidev CLI hỗ trợ (`slidev export [...entry]`)

| Cờ CLI | Ý nghĩa | Đang có trong app? |
|---|---|---|
| `--format pdf\|png\|pptx\|pptx-editable\|md` | Định dạng xuất | Chỉ có `pdf/png/pptx` + `build` (build không phải export mà là `slidev build`) |
| `--output <path>` | Đường dẫn/tên file xuất | Có (cố định `export/<name>-export.*`) |
| `--range "1,4-5,6"` | Chỉ xuất 1 số trang | **Chưa có** |
| `--dark` | Xuất theo theme tối | **Chưa có** |
| `--with-clicks` / `-c` | Mỗi bước click = 1 trang riêng | **Chưa có** |
| `--omit-background` | Bỏ nền mặc định của browser | **Chưa có** |
| `--timeout <ms>` | Timeout render (mặc định 30000) | **Chưa có**, hữu ích cho slide nhiều ảnh/animation nặng |

`pptx-editable` xuất PPTX với shape/text native (chỉnh sửa được trong PowerPoint) thay vì ảnh chụp từng trang — khác hẳn `pptx` thường (ảnh tĩnh). `md` xuất markdown kèm ảnh PNG nhúng cho từng slide, hữu ích khi cần đưa nội dung slide vào tài liệu khác.

> **Điều kiện tiên quyết:** các cờ trên (đặc biệt `pptx-editable`, browser exporter tại `/export`) yêu cầu bản `@slidev/cli` mới. Vì `default` template hiện ghim `^0.49.0` (rất cũ, trước khi Slidev đổi sang Epoch SemVer ở v51), nên **phải đồng bộ version trước** — xem mục 5.4.

### 3.2 Sửa `electron/ipc/export.ipc.ts`

```ts
export interface ExportOptions {
  range?: string
  dark?: boolean
  withClicks?: boolean
  omitBackground?: boolean
  timeout?: number
  outputName?: string   // tên file tuỳ chỉnh, mặc định giữ nguyên logic cũ
}

ipcMain.handle('export:run', async (
  event, projectPath: string, entryFile: string,
  format: 'pdf' | 'pptx' | 'pptx-editable' | 'png' | 'md' | 'build',
  options: ExportOptions = {}
) => {
  // ... giữ nguyên phần dò cmd/localBin/envPath ...

  if (format === 'build') { /* giữ nguyên logic cũ */ }
  else {
    const outDir = path.join(projectPath, 'export')
    await fs.mkdirp(outDir)
    const baseName = options.outputName || entryFile.replace(/\.md$/, '')
    const outputPath = path.join(outDir, baseName)

    args = [
      fs.existsSync(localBin) ? 'export' : 'slidev', ...(fs.existsSync(localBin) ? [] : ['export']),
      entryFile, '--format', format, '--output', outputPath,
      ...(options.range ? ['--range', options.range] : []),
      ...(options.dark ? ['--dark'] : []),
      ...(options.withClicks !== undefined ? ['--with-clicks', String(options.withClicks)] : []),
      ...(options.omitBackground ? ['--omit-background'] : []),
      ...(options.timeout ? ['--timeout', String(options.timeout)] : [])
    ]
  }
  // ... execa như cũ ...
})

// Kiểm tra & cài playwright-chromium nếu thiếu (bắt buộc để `slidev export` chạy được)
ipcMain.handle('export:checkDeps', async (event, projectPath: string) => {
  const hasPlaywright = fs.existsSync(path.join(projectPath, 'node_modules', 'playwright-chromium'))
  return { ok: hasPlaywright }
})

ipcMain.handle('export:installDeps', async (event, projectPath: string) => {
  // execa('npm', ['install', '-D', 'playwright-chromium'], { cwd: projectPath, ... })
  // stream log qua 'export:log' giống pattern trong scaffolder.ts
})
```

### 3.3 Batch export — xuất tất cả entry file cùng lúc
Dự án nhiều theme (`slidev-multi-theme` kiểu `slides-scholarly.md`, `slides-academic.md`...) hiện phải mở `ExportDialog` xuất từng file một. Thêm:

```ts
ipcMain.handle('export:runBatch', async (event, projectPath: string, entryFiles: string[], format, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const results: { file: string; success: boolean; outputPath?: string; error?: string }[] = []
  for (let i = 0; i < entryFiles.length; i++) {
    win?.webContents.send('export:batch-progress', { current: i + 1, total: entryFiles.length, file: entryFiles[i] })
    try {
      const res = await runSingleExport(projectPath, entryFiles[i], format, options) // tách logic export:run hiện tại thành hàm dùng chung
      results.push({ file: entryFiles[i], success: true, outputPath: res.outputPath })
    } catch (err: any) {
      results.push({ file: entryFiles[i], success: false, error: err.message })
    }
  }
  return results
})
```
Chạy **tuần tự, không song song** — mỗi lệnh export tự mở 1 trình duyệt headless (Playwright), chạy song song nhiều project cùng lúc dễ vượt RAM trên máy cá nhân.

### 3.4 Sửa `ExportDialog.tsx`
- Grid định dạng: thêm 2 thẻ `pptx-editable` (icon khác pptx thường, ghi chú "Có thể chỉnh sửa trong PowerPoint") và `md`.
- Thêm accordion "Tuỳ chọn nâng cao" (ẩn mặc định): input `--range` (placeholder `1,4-5,6`), toggle Dark mode, toggle With-clicks, toggle Omit background, input Timeout (số giây).
- Nếu `entryFiles.length > 1`: hiện checkbox "Xuất tất cả file trình chiếu" → khi bật, ẩn dropdown chọn 1 file, gọi `export:runBatch` thay vì `export:run`, hiển thị progress bar `current/total` + danh sách kết quả từng file (✓/✗) cuối cùng.
- Trước khi export lần đầu của project: gọi `export:checkDeps`; nếu `!ok`, hiện banner "Cần cài `playwright-chromium` để xuất file (chỉ cài 1 lần)" kèm nút "Cài ngay" → `export:installDeps` với log tái dùng UI log đã có sẵn.

---

## 4. M12 — Force Recompile (tách biệt khỏi Restart)

### 4.1 Vấn đề cụ thể
- **Restart** (đã có) = kill process + spawn lại — Vite vẫn dùng cache pre-bundle dependency cũ trong `node_modules/.vite`. Nếu người dùng vừa đổi theme, thêm package, hoặc sửa `vite.config.ts`, HMR/Restart đôi khi không nhận thay đổi → phải tự tay xoá cache, rất bất tiện cho use-case cá nhân đang chỉnh nhiều theme song song.
- Restart hiện tại cũng khiến `<webview>` load lại `serverUrl` gốc → **mất slide đang xem**, phải bấm sang lại slide đó.

### 4.2 Giải pháp: nút "Buộc biên dịch lại" riêng, dùng cờ `--force` có sẵn của Slidev
Theo tài liệu CLI (`slidev [entry] --force, -f`): *"force the optimizer to ignore the cache and re-bundle"* — đúng cơ chế cần dùng, không cần tự viết logic xoá cache thủ công.

**`electron/ipc/process.ipc.ts`** — thêm handler mới, không sửa `process:restart` cũ:
```ts
ipcMain.handle('process:recompile', async (event, projectId: string, projectPath: string, entryFile: string, port: number) => {
  await processManager.stop(projectId) // tree-kill như cũ
  return processManager.start(projectId, projectPath, entryFile, port, { force: true }) // truyền thêm --force vào execa args
})
```
Trong `processManager.ts`, hàm `start()` nhận thêm `{ force?: boolean }`, nếu có thì thêm `'--force'` vào mảng `args` khi gọi `execa('npx', ['slidev', entryFile, '--port', String(port), ...(force ? ['--force'] : [])], ...)`.

### 4.3 Giữ nguyên vị trí slide đang xem qua lần recompile
Trong `PreviewPane.tsx`, trước khi gọi recompile, đọc URL hiện tại của webview:
```ts
const handleRecompile = async () => {
  const currentUrl = webviewRef.current?.getURL?.() // vd: http://localhost:3030/12?...
  const suffix = currentUrl ? currentUrl.replace(/^https?:\/\/[^/]+/, '') : ''
  await onRecompile() // gọi IPC, cập nhật currentTab.serverUrl mới (port có thể đổi nếu port cũ chưa kịp giải phóng)
  // sau khi status chuyển 'running' và có serverUrl mới, set lại:
  webviewRef.current.src = `${newServerUrl}${suffix}`
}
```
Việc "chờ status running rồi set lại suffix" nên đặt trong `ProjectWorkspace.tsx` qua `useEffect` lắng nghe khi `status` chuyển từ `starting` → `running` **do hành động recompile** (dùng 1 ref `pendingRecompileSuffix` để phân biệt với start lần đầu, tránh áp suffix cũ vào lần mở project mới).

### 4.4 Hiển thị lỗi biên dịch ngay trên Preview, không chỉ trong Console ẩn
`processManager.ts` hiện đã bắt được stdout/stderr — bổ sung regex nhận diện dòng lỗi rõ ràng (`/error/i`, `[vite] Internal server error`, `Pre-transform error`) để phát thêm event `process:compile-error` mang nội dung dòng lỗi rút gọn. `PreviewPane.tsx` thêm 1 banner nhỏ (không che toàn màn hình như trạng thái `error` cứng) phía trên webview: "⚠ Lỗi biên dịch — xem chi tiết" + nút mở Console, tự ẩn khi có log "ready"/HMR update tiếp theo.

### 4.5 Vị trí nút trên UI
Đặt cạnh nút **Restart** hiện có trong header (`ProjectWorkspace.tsx`, khu vực "Server Controls"):
```tsx
<button onClick={handleRecompile} title="Xoá cache Vite & biên dịch lại từ đầu (--force)"
  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700">
  <RefreshCcwDot className="w-3.5 h-3.5 text-amber-400" />
  <span>Recompile</span>
</button>
```
Tooltip nói rõ khác biệt với Restart để người dùng chọn đúng khi cần (Restart = nhanh, dùng hằng ngày; Recompile = chậm hơn vài giây nhưng chắc chắn nhận mọi thay đổi cache/dependency).

---

## 5. M13 — Mở rộng thư viện Template (theo sli.dev/resources/theme-gallery)

### 5.1 Theme chính thức hiện có trên Theme Gallery (đối chiếu ngày 28/09/2026)

| Theme | Đã bundle? | Ghi chú |
|---|---|---|
| `default` | ✅ | Đã có |
| `seriph` | ✅ | Đã có |
| `bricks` | ✅ | Đã có |
| `apple-basic` | ❌ → **đề xuất thêm** | Phong cách Keynote, tối giản, nhiều khoảng trắng |
| `shibainu` | ❌ → **đề xuất thêm** | Theme chính thức còn lại, phong cách playful/pastel |
| `frankfurt` (cộng đồng, đang bundle với id `frankfurt-academic`) | ✅ | Đã có, chuẩn Beamer học thuật |

### 5.2 Theme cộng đồng phổ biến nên thêm (tuỳ chọn, làm phong phú lựa chọn)

| Theme | Lý do đề xuất |
|---|---|
| `slidev-theme-penguin` | Phong cách kỹ thuật/dev-focused, được nhắc đến nhiều trong cộng đồng Slidev |
| `slidev-theme-dracula` | Bảng màu tối phổ biến với dân lập trình, hợp báo cáo demo code |

> Không nên bundle quá 8 template để tránh phình dung lượng cài đặt (mỗi template kèm `node_modules` riêng khi user tạo project). Các theme khác trong Theme Gallery vẫn dùng được — thêm 1 ô "Tên theme tuỳ chỉnh (nâng cao)" ở bước 2 của Wizard để gõ tay tên theme bất kỳ trên npm (`slidev-theme-<tên>`), Slidev tự prompt cài khi chạy dev server lần đầu.

### 5.3 Cấu trúc thêm 1 template mới — theo đúng pattern đang có
Ví dụ thêm `apple-basic`, tạo `electron/templates/apple-basic/`:

`package.json`
```json
{
  "name": "{{SLUG}}",
  "type": "module",
  "private": true,
  "scripts": { "build": "slidev build", "dev": "slidev --open", "export": "slidev export" },
  "dependencies": {
    "@slidev/cli": "^53.0.0",
    "@slidev/theme-apple-basic": "latest",
    "vue": "^3.5.0"
  }
}
```
`slides.md`
```md
---
theme: apple-basic
title: '{{TITLE}}'
author: '{{AUTHOR}}'
date: '{{DATE}}'
---

# {{TITLE}}

{{AUTHOR}}

---

## Slide mẫu

Nội dung của bạn ở đây...
```
Giữ nguyên `.gitignore` copy từ template `default`.

Tương tự cho `shibainu` (`@slidev/theme-shibainu`), `penguin`/`dracula` (gói cộng đồng, khai trong `devDependencies` giống cách `frankfurt-academic` đang khai `slidev-theme-frankfurt`).

### 5.4 Cập nhật `scaffolder.ts`
```ts
export const BUNDLED_TEMPLATES: TemplateInfo[] = [
  { id: 'default', name: 'Default Theme', description: '...', theme: 'default' },
  { id: 'seriph', name: 'Seriph (Editorial)', description: '...', theme: 'seriph' },
  { id: 'bricks', name: 'Bricks Grid', description: '...', theme: 'bricks' },
  { id: 'frankfurt-academic', name: 'Frankfurt Academic', description: '...', theme: 'frankfurt' },
  { id: 'apple-basic', name: 'Apple Basic', description: 'Phong cách Keynote, tối giản, nhiều khoảng trắng', theme: 'apple-basic' },
  { id: 'shibainu', name: 'Shibainu', description: 'Theme chính thức, phong cách nhẹ nhàng, pastel', theme: 'shibainu' },
  { id: 'penguin', name: 'Penguin (Dev)', description: 'Theme cộng đồng thiên về kỹ thuật, hợp demo code', theme: 'penguin' },
  { id: 'dracula', name: 'Dracula Dark', description: 'Bảng màu tối quen thuộc với lập trình viên', theme: 'dracula' }
]
```
Không cần sửa gì thêm trong `createProject()` — logic copy + thay `{{SLUG}}/{{TITLE}}/{{AUTHOR}}/{{DATE}}` đã tổng quát, tự chạy đúng cho template mới.

### 5.5 Cập nhật `NewProjectWizard.tsx`
Bổ sung nhánh trong `getTemplateIcon(id)`:
```ts
case 'apple-basic': return <Sparkles className="w-6 h-6 text-slate-300" />
case 'shibainu': return <Heart className="w-6 h-6 text-pink-400" />
case 'penguin': return <Terminal className="w-6 h-6 text-cyan-400" />
case 'dracula': return <Moon className="w-6 h-6 text-violet-400" />
```
Thêm input "Theme tuỳ chỉnh" (mục 5.2) ở cuối lưới chọn template — khi người dùng gõ tên, `templateId` tạm dùng `default` làm khung project rồi ghi đè `theme: <tên nhập>` vào frontmatter `slides.md` thay vì copy từ 1 thư mục bundle riêng.

### 5.6 Chuẩn hoá version `@slidev/cli` giữa các template (fix đi kèm)
Toàn bộ `package.json` trong `electron/templates/*/` nên ghim cùng một version range (vd `^53.0.0`) thay vì để `default` kẹt ở `^0.49.0` — vừa tránh bug hành vi khác nhau giữa các template, vừa là điều kiện để các định dạng export mới ở Mục 3 (`pptx-editable`, browser exporter `/export`) hoạt động nhất quán trên mọi project tạo từ Wizard.

---

## 6. Kế hoạch triển khai theo Phase

| Phase | Nội dung | Module | Ước lượng |
|---|---|---|---|
| 6.1 | Cài `react-resizable-panels`, chuyển layout 3 cột + console sang PanelGroup, migrate nút collapse cũ | M10 | 1 ngày |
| 6.2 | Mở rộng `export:run` (format `md`/`pptx-editable` + tuỳ chọn nâng cao), `export:checkDeps`/`installDeps` | M11a | 1 ngày |
| 6.3 | `export:runBatch` + UI checkbox "xuất tất cả", progress bar | M11b | 0.5-1 ngày |
| 6.4 | `process:recompile` (`--force`), giữ vị trí slide, banner lỗi biên dịch trên Preview | M12 | 1 ngày |
| 6.5 | Thêm 4 template (`apple-basic`, `shibainu`, `penguin`, `dracula`), input theme tuỳ chỉnh, chuẩn hoá version CLI | M13 | 0.5-1 ngày |

Tổng: **~4-5 ngày công part-time**, có thể làm song song 6.1 và 6.5 (không phụ thuộc nhau) rồi tới 6.2→6.3→6.4.

---

## 7. Prompt chi tiết cho AI coding agent

### 🔹 Prompt 6.1 — Resizable Workspace Layout

```
Bối cảnh: ProjectWorkspace.tsx hiện có layout 3 cột cố định width bằng class Tailwind
(FileTree w-56, Editor flex-1, Preview flex-1) và console drawer cố định h-64.
Cần chuyển sang panel có thể kéo-thả resize và tự lưu kích thước theo từng project.

Nhiệm vụ:
1. npm install react-resizable-panels
2. Viết lại khối "3-Column Split View Body" + "Bottom Collapsible Console Drawer"
   trong ProjectWorkspace.tsx bằng PanelGroup lồng nhau (ngoài direction="vertical"
   bọc body+console, trong direction="horizontal" cho filetree/editor/preview).
   autoSaveId phải chứa projectId để mỗi project nhớ layout riêng:
   `workspace-v-${projectId}` và `workspace-h-${projectId}`.
3. FileTree panel: defaultSize=18, minSize=0, maxSize=35, collapsible, collapsedSize=0,
   dùng ref kiểu ImperativePanelHandle, nối 2 chiều với state isFileTreeCollapsed hiện có
   (nút Chevron trên header vẫn hoạt động, gọi panelRef.current.expand()/collapse()).
4. Editor panel và Preview panel: defaultSize=41 mỗi bên, minSize=20.
5. Console panel: chỉ render (kèm PanelResizeHandle phía trên) khi isConsoleOpen=true,
   defaultSize=25, minSize=10, maxSize=60.
6. Style PanelResizeHandle: thanh mỏng 3px, bg-slate-800, hover:bg-blue-500/70,
   cursor-col-resize (ngang) / cursor-row-resize (dọc), vùng bắt chuột nên rộng hơn
   phần hiển thị (dùng div con position absolute mở rộng -left-1/-right-1).
7. Thêm onDoubleClick vào mỗi PanelResizeHandle để reset panel liền kề về defaultSize
   (dùng panelRef.current.resize(defaultSize)).

Tiêu chí hoàn thành: kéo được cả 2 đường chia dọc và 1 đường chia ngang (console),
đóng app mở lại đúng project → layout giữ nguyên tỉ lệ đã kéo lần trước. Double-click
vào 1 đường chia trả layout về mặc định.
```

### 🔹 Prompt 6.2 — Export nâng cao (định dạng mới + tuỳ chọn CLI)

```
Bối cảnh: electron/ipc/export.ipc.ts đang gọi `slidev export <entry> --format <pdf|png|pptx>
--output <dir>`. Slidev CLI thực tế hỗ trợ thêm format 'md' và 'pptx-editable', cùng các cờ
--range, --dark, --with-clicks, --omit-background, --timeout.

Nhiệm vụ:
1. Đổi type format trong export:run thành
   'pdf' | 'pptx' | 'pptx-editable' | 'png' | 'md' | 'build', thêm tham số thứ 5
   options: { range?, dark?, withClicks?, omitBackground?, timeout?, outputName? }.
2. Map options sang đúng cờ CLI như bảng ở Mục 3.1 tài liệu này, chỉ thêm cờ khi
   giá trị tương ứng được set (tránh gửi --dark false không cần thiết).
3. Thêm 2 handler export:checkDeps(projectPath) kiểm tra
   node_modules/playwright-chromium có tồn tại không, và export:installDeps(projectPath)
   chạy `npm install -D playwright-chromium`, stream log qua kênh export:log có sẵn.
4. src/components/ExportDialog.tsx: thêm 2 thẻ định dạng "PPTX (Editable)" và "Markdown",
   thêm khối <details> "Tuỳ chọn nâng cao" ẩn mặc định chứa input Range, toggle Dark mode,
   toggle With-clicks, toggle Omit background, input Timeout (giây, tự nhân 1000 khi gửi IPC).
   Trước khi cho phép bấm "Bắt đầu xuất" lần đầu của mỗi project, gọi export:checkDeps;
   nếu false, hiện banner cảnh báo + nút "Cài playwright-chromium" gọi export:installDeps.

Tiêu chí hoàn thành: xuất được PPTX editable (mở bằng PowerPoint sửa được text) và
Markdown (có ảnh PNG nhúng từng slide) thành công trên 1 project thật.
```

### 🔹 Prompt 6.3 — Batch Export nhiều entry file

```
Bối cảnh: project kiểu "slidev-multi-theme" có nhiều file slides-*.md ở root. Hiện phải
mở ExportDialog xuất từng file một.

Nhiệm vụ:
1. Tách logic export 1 file trong export:run hiện tại (sau khi đã áp dụng Prompt 6.2)
   thành 1 hàm nội bộ runSingleExport(projectPath, entryFile, format, options) tái sử dụng được.
2. Thêm handler export:runBatch(projectPath, entryFiles: string[], format, options),
   chạy TUẦN TỰ (không Promise.all) từng entryFile qua runSingleExport, sau mỗi file
   gửi event export:batch-progress {current, total, file} về renderer, trả về mảng
   kết quả [{file, success, outputPath?, error?}].
3. ExportDialog.tsx: khi entryFiles.length > 1, hiện checkbox "Xuất tất cả file trình
   chiếu (N file)"; khi bật thì ẩn dropdown chọn 1 file, nút "Bắt đầu xuất" gọi
   export:runBatch. Hiện progress bar current/total trong lúc chạy, và bảng kết quả
   (✓/✗ + tên file + đường dẫn hoặc lỗi) khi xong.

Tiêu chí hoàn thành: xuất PDF cho toàn bộ 5 file của 1 project multi-theme trong 1 lần
bấm, thấy progress tăng dần, cuối cùng có bảng 5 dòng kết quả đúng thực tế.
```

### 🔹 Prompt 6.4 — Force Recompile

```
Bối cảnh: nút Restart hiện tại (api.process.restart) chỉ kill+spawn lại process, không
xoá cache Vite nên đôi khi không nhận thay đổi theme/dependency, và làm mất vị trí slide
đang xem trên preview vì webview load lại URL gốc.

Nhiệm vụ:
1. electron/services/processManager.ts: hàm start() nhận thêm option { force?: boolean },
   khi true thì thêm '--force' vào mảng args khi execa spawn 'npx slidev <entry> --port <p>'.
2. electron/ipc/process.ipc.ts: thêm handler process:recompile(projectId, projectPath,
   entryFile, port) = stop() rồi start(..., { force: true }), KHÔNG sửa process:restart cũ.
3. preload.ts + ipc-client.ts: expose api.process.recompile(...).
4. src/components/PreviewPane.tsx: thêm hàm helper lấy path hiện tại của webview
   (webviewRef.current.getURL() rồi strip phần origin), lưu tạm trước khi gọi recompile.
5. src/pages/ProjectWorkspace.tsx: thêm nút "Recompile" (icon khác Restart, tooltip giải
   thích khác biệt) cạnh nút Restart hiện có. Khi bấm: lưu suffix URL hiện tại vào 1 ref,
   gọi api.process.recompile(...), và trong useEffect lắng nghe process:status-changed,
   nếu status chuyển sang 'running' VÀ ref suffix đang có giá trị (phân biệt với lần start
   đầu tiên của project) thì set lại webview.src = serverUrl mới + suffix đã lưu, rồi xoá ref.
6. processManager.ts: thêm regex nhận diện dòng log lỗi biên dịch rõ ràng (chứa "error"
   không phân biệt hoa thường, hoặc "Internal server error"), phát thêm event
   process:compile-error {projectId, message}. PreviewPane hiện banner nhỏ không che toàn
   màn hình phía trên webview khi nhận event này, tự ẩn khi có log chứa "hmr update" tiếp theo.

Tiêu chí hoàn thành: sửa vite.config.ts hoặc đổi theme trong slides.md, bấm Restart không
ăn thua → bấm Recompile thấy log có dòng liên quan --force, sau khi server chạy lại,
preview tự quay về ĐÚNG slide đang xem trước đó (không nhảy về slide 1).
```

### 🔹 Prompt 6.5 — Bổ sung template + chuẩn hoá version

```
Bối cảnh: electron/templates/ hiện có default, seriph, bricks, frankfurt-academic.
scaffolder.ts có mảng BUNDLED_TEMPLATES tương ứng. Cần thêm 4 template mới theo đúng
pattern (package.json + slides.md dùng placeholder {{SLUG}}/{{TITLE}}/{{AUTHOR}}/{{DATE}}).

Nhiệm vụ:
1. Tạo 4 thư mục electron/templates/apple-basic, shibainu, penguin, dracula — mỗi thư mục
   có package.json (dependencies đúng gói theme tương ứng: @slidev/theme-apple-basic,
   @slidev/theme-shibainu là theme chính thức; slidev-theme-penguin, slidev-theme-dracula
   là gói cộng đồng khai trong devDependencies giống cách frankfurt-academic đang khai
   slidev-theme-frankfurt), slides.md 2-3 slide mẫu, .gitignore copy từ template default.
2. Cập nhật BUNDLED_TEMPLATES trong scaffolder.ts thêm 4 entry mới với id/name/description
   đúng theo bảng ở Mục 5.4 tài liệu kế hoạch này.
3. src/pages/NewProjectWizard.tsx: thêm case icon cho 4 template mới trong
   getTemplateIcon(id) (dùng icon khác nhau, màu khác nhau để phân biệt trực quan).
4. Thêm 1 ô input "Theme tuỳ chỉnh (nâng cao)" bên dưới lưới chọn template trong Wizard —
   khi người dùng nhập tên theme (vd tên bất kỳ trên npm dạng slidev-theme-x hoặc theme
   chính thức khác chưa bundle), dùng templateId='default' làm khung, nhưng sau khi copy
   template thì ghi đè giá trị `theme:` trong frontmatter slides.md bằng tên vừa nhập
   thay vì 'default'.
5. Chuẩn hoá: sửa "@slidev/cli" trong TẤT CẢ package.json ở electron/templates/*/ về
   cùng 1 version range (dùng "^53.0.0"), xoá theme-default thừa trong dependencies của
   các template không dùng theme default.

Tiêu chí hoàn thành: từ Home → Tạo project mới, thấy đủ 8 lựa chọn template (4 cũ + 4 mới)
có icon riêng biệt, tạo thử project với apple-basic chạy `npm run dev` thành công và preview
đúng theme. Nhập tên theme tuỳ chỉnh (vd "geist") ở ô nâng cao cũng tạo project chạy được
(Slidev tự hỏi cài package theme khi khởi động lần đầu).
```

---

## 8. Rủi ro kỹ thuật cần lưu ý

1. **`react-resizable-panels` + `<webview>`**: khi kéo resize nhanh, `<webview>` (khác iframe thường) đôi khi không tự resize nội dung theo kịp — nên test kỹ trên cả 3 hệ điều hành; nếu giật hình, thêm `pointer-events-none` cho `<webview>` trong lúc đang kéo (bắt qua callback `onLayout` của `PanelGroup` để set/xoá class tạm thời).
2. **`--force` làm chậm lần recompile đầu** vài giây so với Restart thường (phải re-bundle lại dependency) — nên hiển thị rõ trạng thái "Đang biên dịch lại (--force)..." khác với "Đang khởi động lại" để người dùng không tưởng app treo.
3. **Batch export tốn thời gian tuyến tính** theo số entry file (mỗi file mở 1 trình duyệt headless riêng, không chạy song song vì lý do RAM) — với project 5 file như `slidev-multi-theme`, nên báo trước ước lượng thời gian trong UI (vd "~15-25s mỗi file").
4. **`pptx-editable` và format `md`** cần bản `@slidev/cli` đủ mới — nếu người dùng mở project cũ tạo từ trước khi có bản nâng cấp này (còn ghim `@slidev/cli` cũ), 2 định dạng này sẽ lỗi ngay khi export. Nên bắt lỗi cụ thể (log CLI thường trả `Unsupported exporting format`) và gợi ý "Hãy cập nhật @slidev/cli trong package.json của project rồi npm install lại" thay vì chỉ hiện lỗi chung chung.
5. **Theme cộng đồng (`penguin`, `dracula`) không do đội Slidev bảo trì chính thức** — có rủi ro ngừng cập nhật/breaking change ở version Vue hoặc Slidev mới; nên ghi chú rõ trong mô tả template trên Wizard để người dùng biết đây là lựa chọn "cộng đồng" khác với 2 theme chính thức `apple-basic`/`shibainu`.

---

## 9. Checklist kiểm thử

- [ ] Kéo đường chia FileTree↔Editor và Editor↔Preview mượt, không giật `<webview>`.
- [ ] Thu FileTree về 0 bằng cách kéo tay → nút Chevron trên header đổi trạng thái đúng, bấm nút mở lại được.
- [ ] Mở Console (kéo thanh dọc), chỉnh cao thấp, tắt Console rồi bật lại → chiều cao giữ nguyên như lần chỉnh trước.
- [ ] Đóng app, mở lại đúng project → layout (3 cột + console) giữ nguyên tỉ lệ đã kéo.
- [ ] Mở 2 project khác nhau ở 2 tab → mỗi project có layout riêng, không ảnh hưởng nhau.
- [ ] Xuất thành công cả 6 định dạng: PDF, PNG, PPTX, PPTX-Editable, Markdown, Static Web (build).
- [ ] PPTX-Editable mở bằng PowerPoint sửa được chữ trực tiếp (không phải ảnh).
- [ ] Bật tuỳ chọn `--range "1-3"` chỉ xuất đúng 3 trang đầu.
- [ ] Batch export project nhiều entry file ra đủ số lượng file, tên đúng theo từng entry.
- [ ] Đổi theme trong frontmatter, bấm Restart không nhận thay đổi (giả lập) → bấm Recompile nhận đúng theme mới.
- [ ] Recompile xong, preview quay lại đúng số thứ tự slide đang xem trước đó (không nhảy về slide 1).
- [ ] Cố tình gây lỗi cú pháp trong `slides.md` → banner lỗi biên dịch hiện ngay trên Preview, tự ẩn khi sửa lại đúng.
- [ ] Tạo project mới với từng template trong 4 template bổ sung (`apple-basic`, `shibainu`, `penguin`, `dracula`), preview đúng theme tương ứng.
- [ ] Nhập tên theme tuỳ chỉnh ở ô nâng cao trong Wizard, project tạo ra chạy `npm run dev` không lỗi.

---

## 10. Tài liệu tham khảo

- Slidev CLI Reference (`export`, `--force`, các cờ): https://sli.dev/builtin/cli
- Slidev Exporting Guide (PPTX-Editable, Markdown export): https://sli.dev/guide/exporting
- Slidev Theme Gallery: https://sli.dev/resources/theme-gallery
- `react-resizable-panels`: https://www.npmjs.com/package/react-resizable-panels
