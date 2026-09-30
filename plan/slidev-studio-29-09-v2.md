# Báo cáo Audit & Kế hoạch sửa lỗi — Slidev Studio

*Ngày review: 29/09/2026 · Bản zip: `Slidev_clean_20260929_150845.zip` · Phạm vi: đọc kỹ toàn bộ `electron/` (main, ipc, services, utils, webview-preload), `shared/`, `tests/`, `scripts/`, và các file renderer liên quan đến editor / preview / workspace / store (`EditorPane`, `PreviewPane`, `ProjectWorkspace`, `processStore`, `slideIndex`, `sourceLocator`). Đọc kỹ cả 9 template Slidev bundle sẵn, đặc biệt theme `hcmut-bach`. Chỉ lướt qua: `HomeDashboard`, `SettingsPage`, `ExportDialog`, `FileTree`, `ProjectCard`, `NewProjectWizard` (chỉ phần gửi title/author), `src/themes/`.*

---

## 0. Trả lời nhanh: lỗi "không biên dịch được slide"

**Kết luận trung thực trước:** mình **chưa thể chỉ ra chắc chắn nguyên nhân duy nhất** của lỗi bạn đang gặp, vì (1) sandbox không có mạng nên không chạy được Slidev thật, (2) mình không có log Console lúc bạn gặp lỗi và không biết deck/slide nào bị. Thay vào đó, mình đã tìm được **4 nguyên nhân có thật hoặc rất có khả năng** làm slide không biên dịch trong chính code của app, xếp theo độ chắc chắn:

| # | Nguyên nhân | Khi nào xảy ra | Issue | Độ chắc chắn |
|---|---|---|---|---|
| 1 | Wizard chèn **Tiêu đề / Tác giả thô** vào YAML frontmatter và Markdown → YAML hỏng khi có dấu `'`, Vue hỏng khi có `<` hoặc `{{` | Dự án **vừa tạo bằng Wizard**, lỗi ngay từ slide 1 | #1 | ✅ **Đã tái hiện** (8/9 template) |
| 2 | **Autosave 600ms** ghi cả bản đang gõ dở (`<Block` chưa đóng, `$$` lẻ, frontmatter dở) → Slidev báo lỗi; và banner lỗi **có thể không tự tắt** sau khi bạn đã sửa xong | Đang gõ trong editor | #2, #3 | ⚠️ Suy luận từ code + hành vi Vite |
| 3 | **Theme chưa cài / lệch phiên bản** (bạn đổi `theme:` trong editor, hoặc theme `latest` vượt quá CLI `^53`) | Đổi theme, hoặc tạo dự án lại sau vài tuần | #4, #6 | ⚠️ Cơ chế đã có bằng chứng ở audit trước; phần lệch version là suy luận |
| 4 | Template `hcmut-bach`: **xung đột `@slidev/cli ^53` với `@slidev/client` ghim cứng `53.0.0`** → `npm install` lỗi | Dự án tạo từ template HCMUT | #5 | ❓ Nghi ngờ, **chưa xác minh** (không có registry) |

### Cách chốt nguyên nhân trong 2 phút (làm giúp mình)

1. Mở **Console** của dự án (nút Terminal) → tìm dòng `[vite] Internal server error` hoặc `Failed to resolve`, rồi đọc **vài dòng ngay bên dưới** (`Plugin:`, `File: …slides.md__slidev_N.md:dòng:cột`). `N` chính là số slide bị lỗi.
2. Nếu lỗi nằm ở **dòng 1–12 của file** → gần như chắc chắn là frontmatter YAML (nguyên nhân #1). Mở file và kiểm tra `title:` / `author:` có dấu `'` bên trong không.
3. Nếu lỗi nằm giữa deck với chữ `Element is missing end tag` / `Unexpected token` → thẻ Vue/HTML chưa đóng hoặc ký tự `<` trần trong văn bản.
4. Nếu Console chỉ có `npm install thất bại` / `ERESOLVE` / `cannot prompt for installation` → nguyên nhân #3 hoặc #4.
5. Gửi mình ~30 dòng log quanh chữ `error` để chốt.

---

## 1. Tổng quan

- **Stack**: Electron 31 + electron-vite 2 + React 18 + TypeScript + Tailwind + Monaco; điều khiển Slidev CLI v53 qua `execa`. Main process ESM (`"type": "module"`).
- **Quy mô**: ≈ 7.300 dòng TS/TSX của app (không tính template). File lớn nhất: `ProjectWorkspace.tsx` (737), `processManager.ts` (492), `projectStore.ts` (433), `NewProjectWizard.tsx` (391), `ExportDialog.tsx` (387). 9 template Slidev bundle sẵn; `hcmut-bach` là theme tự viết (~600KB gồm font, ảnh).
- **So với báo cáo audit trước** (`plan/slidev-studio-29-09-final.md`): các nhóm lỗi nền tảng ở đó **đã có mặt trong code hiện tại** — `stripAnsi`, `PortAllocator` giữ chỗ port có mutex, `generation` chống output muộn, `pidRegistry` + reaper, `singleInstanceLock`, `installQueue`, `processStore` gom log theo batch, `execa buffer: false`. Mình đã đọc logic và thấy hợp lý, nhưng **chưa chạy lại từng hành vi** nên không khẳng định là đã hết lỗi.
- **Kiểm tra tự động đã chạy** (sandbox không có mạng):

| Kiểm tra | Kết quả |
|---|---|
| `npm ci` | ❌ `403 Forbidden` từ registry → **không chạy được** `typecheck`, `lint`, `test`, `build` |
| Cú pháp TypeScript (`tsc --noResolve`, lọc mã `TS1xxx`) trên `electron/`, `src/`, `shared/`, `tests/` | ✅ 0 lỗi cú pháp (không phải typecheck đầy đủ) |
| `node --check` `check-overflow.mjs`; `py_compile` `compare.py` | ✅ |
| Parse YAML frontmatter của 9 template với input bình thường | ✅ 0 lỗi |
| Parse YAML frontmatter với tiêu đề có dấu `'` (mô phỏng đúng đường đi của `scaffolder.ts`) | ❌ **8/9 template lỗi** (xem #1) |
| `parseSlideIndex` chạy thật (tsx) trên 4 deck mẫu, so với cách đếm slide độc lập | ✅ khớp (13 / 9 / 3 / 5 slide) |
| Cân bằng thẻ `<template>/<script>/<style>` của các file `.vue` trong `hcmut-bach` | ✅ (kiểm tra thô, không phải compile Vue) |
| Chạy Slidev thật, Electron GUI, Vue compile | ❌ không chạy được |

---

## 2. Tóm tắt vấn đề

| Mức độ | Số lượng | Issue |
|---|---|---|
| Critical | 0 | — |
| High | 2 | #1, #2 |
| Medium | 9 | #3, #4, #5, #6, #7, #8, #9, #10, #11 |
| Low | 8 | #12, #13, #14, #15, #16, #17, #18, #19 |
| **Tổng** | **19** | |

**Thứ tự nên làm:** Prompt 1 → 2 → 3 (dứt điểm triệu chứng "không biên dịch") → 4 → 5 → 6 (độ bền dependency/template) → 7 → 8 (bảo mật) → 9 (dọn dẹp + test).

---

## 3. Danh sách vấn đề (sắp theo mức độ giảm dần)

### #1 [High] Wizard chèn Tiêu đề/Tác giả thô vào YAML và Markdown → slide không biên dịch

- **Nhóm**: Logic bug (kèm injection)
- **Vị trí**: `electron/services/scaffolder.ts:204-207` (thay `{{TITLE}}`, `{{AUTHOR}}`, `{{DATE}}`); các template `*/slides.md` có `title: '{{TITLE}}'`, `author: '{{AUTHOR}}'` (default, seriph, bricks, apple-basic, dracula, penguin, shibainu, frankfurt-academic). `NewProjectWizard.tsx:82-83` chỉ `trim()`.
- **Mô tả**: giá trị người dùng nhập được ghép nguyên văn vào chuỗi YAML nằm trong dấu nháy đơn. Nhập `Cây 'AI' của tôi` → `title: 'Cây 'AI' của tôi'` là **YAML không hợp lệ** nên Slidev không đọc được frontmatter. Ngoài ra `String.replace` với chuỗi thay thế còn diễn giải `$&`, `$'`, `$$` (đã chạy thử: `Giá $$ lớn` → `Giá $ lớn`; `Chi phí $& thêm` → chèn nguyên `{{TITLE}}` vào giữa). Ở phần thân, `# {{TITLE}}` bị Vue biên dịch, nên `<` hoặc `{{ }}` trong tiêu đề gây lỗi template (**suy luận** từ cú pháp Vue, chưa chạy).
- **Bằng chứng**: parse YAML bằng PyYAML với tiêu đề `Bài giảng: Cây 'AI' của tôi` → lỗi ở khối frontmatter đầu của **8/9 template**. Chạy `node` cho thấy hành vi `$`.
- **Ảnh hưởng**: dự án mới không chạy được ngay từ lần đầu; người dùng thấy "không biên dịch được slide" mà không biết lý do.

**Kế hoạch sửa:**

1. Trong `scaffolder.ts`, tách hàm `renderTemplate(content, values)`: (a) với dòng frontmatter dạng `key: '{{X}}'` thì thay bằng giá trị đã escape YAML (nhân đôi `'` thành `''`, hoặc xuất chuỗi dạng JSON double-quoted); (b) với các chỗ `{{X}}` còn lại (thân slide, khối `info: |`) thì escape cho Markdown/Vue (`<`→`&lt;`, `{{`→`&#123;&#123;`, `\` giữ nguyên); (c) luôn dùng **hàm** làm replacer (`() => value`) để vô hiệu hoá `$&`.
2. Sau khi sinh `slides.md`, **parse lại frontmatter bằng thư viện YAML**; nếu lỗi thì ném lỗi rõ ràng "Tiêu đề chứa ký tự không hợp lệ" thay vì để Slidev chết về sau.
3. Ở Wizard: giới hạn độ dài (≤ 200), bỏ ký tự điều khiển/xuống dòng.
4. Bonus (#15): dùng ngày **theo múi giờ địa phương** cho `{{DATE}}`.
5. Thêm test cho `renderTemplate` với các tiêu đề: `Cây 'AI'`, `A < B`, `{{x}}`, `Giá $& thêm`, `Dòng: có dấu hai chấm`, chuỗi có `"`.

**Prompt #1 — đưa cho AI để sửa (gộp #1 + #15):**

````text
Bạn đang sửa dự án Electron "Slidev Studio" (TypeScript, main process ESM, test bằng vitest, thư mục tests/).

VẤN ĐỀ
File electron/services/scaffolder.ts, trong Scaffolder.createProject(), đoạn xử lý slides.md hiện là:

  let slidesContent = await fs.readFile(slidesPath, 'utf8')
  slidesContent = slidesContent
    .replace(/\{\{TITLE\}\}/g, title || name)
    .replace(/\{\{AUTHOR\}\}/g, author || 'Slidev Author')
    .replace(/\{\{DATE\}\}/g, today)

và trước đó: const today = new Date().toISOString().split('T')[0].replace(/-/g, '/')

Các template electron/templates/*/slides.md có frontmatter như:
  title: '{{TITLE}}'
  author: '{{AUTHOR}}'
  date: '{{DATE}}'
và thân slide như:  # {{TITLE}}   /   Tác giả: {{AUTHOR}}
(frankfurt-academic còn có khối `info: |` chứa `## {{TITLE}}`).

Lỗi đã tái hiện:
 (a) title = Cây 'AI' của tôi  → title: 'Cây 'AI' của tôi'  = YAML không hợp lệ → Slidev không biên dịch được.
 (b) replace() với chuỗi thay thế diễn giải $& $' $$ : "Chi phí $& thêm" chèn lại chuỗi {{TITLE}}; "$$" thành "$".
 (c) Ở thân slide, ký tự "<" hoặc "{{" trong tiêu đề sẽ bị Vue biên dịch → lỗi template.
 (d) today dùng UTC nên người dùng ở UTC+7 thấy lùi 1 ngày trong khoảng 00:00–07:00.

YÊU CẦU
1. Tạo hàm thuần `renderTemplate(content: string, values: {title:string; author:string; date:string}): string` (đặt trong electron/services/templateRender.ts để test được, không import electron):
   - Dòng frontmatter dạng  `key: '{{TITLE|AUTHOR|DATE}}'` → thay bằng scalar YAML an toàn (nhân đôi dấu ' thành '' khi giữ nguyên dấu nháy đơn; hoặc thay cả cặp nháy bằng chuỗi JSON.stringify(value)).
   - Mọi `{{TITLE}}`/`{{AUTHOR}}`/`{{DATE}}` còn lại → escape cho Markdown+Vue: "<"→"&lt;", "{{"→"&#123;&#123;", "}}"→"&#125;&#125;". KHÔNG dùng chuỗi làm replacement; luôn dùng replacer dạng hàm.
   - Khối `info: |` (block scalar) được xem là "thân" nên dùng escape Vue, không escape YAML.
2. Trong createProject: gọi renderTemplate; sau đó parse frontmatter của slides.md (khối --- đầu tiên) bằng thư viện `yaml` (thêm vào dependencies nếu chưa có); nếu lỗi → throw new Error('Tiêu đề hoặc tác giả chứa ký tự không hợp lệ cho YAML: ...') và dọn thư mục dự án vừa tạo.
3. `today` phải theo giờ địa phương, định dạng YYYY/MM/DD (không dùng toISOString).
4. Wizard (src/pages/NewProjectWizard.tsx dòng ~82-83): title/author giới hạn 200 ký tự, loại bỏ \r \n và ký tự điều khiển trước khi gửi IPC. Ở scaffolder cũng kiểm tra lại (không tin renderer).
5. Viết test tests/scaffolder.test.ts cho renderTemplate với: "Cây 'AI' của tôi", "A < B", "{{x}}", "Giá $& thêm", "Giá $$ lớn", `Nói "xin chào"`, "Dòng: có hai chấm". Với mỗi giá trị: frontmatter phải parse được bằng `yaml`, và giá trị parse ra phải bằng đúng giá trị nhập; thân slide không được chứa "<" hay "{{" trần.

RÀNG BUỘC
- Không đổi placeholder trong các template hiện có (giữ {{TITLE}} {{AUTHOR}} {{DATE}} {{SLUG}}).
- Không đổi chữ ký public của Scaffolder.createProject và IPC 'scaffold:create'.
- Không thay đổi hành vi với tiêu đề bình thường (chỉ chữ/số/dấu cách/dấu tiếng Việt): kết quả phải y hệt hiện tại.
- Chạy `npm run typecheck && npm test` và báo kết quả.
````

---

### #2 [High] Lỗi biên dịch thiếu ngữ cảnh (không biết file/dòng/slide nào) và banner có thể kẹt

- **Nhóm**: Logic bug
- **Vị trí**: `electron/services/processManager.ts:136-141` (`emitCompileError`, được gọi **theo từng dòng** trong `consumeOutput`); `src/state/processStore.ts:46` (chỉ xoá lỗi khi thấy `hmr update`); `processManager.ts` cũng chỉ reset `instance.error` khi khớp `/hmr update/i`; `PreviewPane.tsx` (banner chỉ hiển thị 1 dòng cắt ngắn).
- **Mô tả**: Vite/Slidev thường in lỗi thành **khối nhiều dòng** (`Internal server error: …`, rồi `Plugin: …`, `File: …slides.md__slidev_5.md:12:3`, kèm code frame). Vì xử lý từng dòng, banner chỉ hiện dòng đầu → **không có tên file, dòng, số slide**. Ngược lại, banner chỉ tắt khi log có `hmr update`; Vite còn in `page reload`, `hmr invalidate`, `program reload`… nên sau khi bạn đã sửa đúng, banner "Lỗi biên dịch" có thể **vẫn còn** (**suy luận** từ hành vi Vite, cần xác nhận bằng Console).
- **Ảnh hưởng**: đây chính là triệu chứng bạn mô tả: thấy "không biên dịch được" nhưng không biết chỗ nào, và không biết đã hết lỗi chưa.

**Kế hoạch sửa:**

1. Main process: tạo `CompileErrorAggregator` theo từng project — khi gặp dòng kích hoạt (regex hiện tại) thì mở "khối lỗi", gom các dòng tiếp theo (thụt lề / bắt đầu bằng `Plugin:`, `File:`, code frame) tới khi gặp dòng trống, dòng `[vite]` mới hoặc vượt 40 dòng/4KB; sau đó emit **một** event `process:compile-error` với `{ projectId, summary, raw, file?, line?, column?, slideNo? }`.
2. Tách `File: <path>:<line>:<col>`; nếu path dạng `slides.md__slidev_N.md` thì `slideNo = N` và file gốc = entry; dùng `parseSlideIndex` ở renderer để đổi slide → dòng nguồn khi thiếu line.
3. Thêm event `process:compile-ok` khi thấy bất kỳ: `hmr update`, `page reload`, `hmr invalidate`, `program reload`, `server restarted`, hoặc `ready`. Renderer xoá banner khi nhận event này; thêm nút "Ẩn" thủ công.
4. Renderer: banner có nút **"Đi tới lỗi"** → `editorRef.reveal({file,line,column})`; đồng thời đặt Monaco marker (`setModelMarkers`) đỏ tại dòng lỗi và xoá khi `compile-ok`.
5. Test: hàm aggregator thuần (nhận chuỗi log mẫu → trả object) bằng vitest, dùng log mẫu thật copy từ Console của bạn (nên gửi mình 1 đoạn để đưa vào test).

**Prompt #2 — đưa cho AI để sửa:**

````text
Dự án: Electron + React "Slidev Studio". Cần cải thiện việc hiển thị lỗi biên dịch của Slidev dev server.

HIỆN TRẠNG
electron/services/processManager.ts:
  private emitCompileError(projectId: string, message: string): void {
    const trimmed = stripAnsi(message).trim()
    if (/\b(?:0|no) errors?\b/i.test(trimmed)) return
    const isCompileFailure = /(\[vite\][^\n]*(error|failed)|Internal server error|Pre-transform error|SyntaxError|Failed to resolve)/i.test(trimmed)
    if (isCompileFailure) this.send('process:compile-error', { projectId, message: trimmed.slice(0, 500) })
  }
được gọi cho TỪNG dòng trong consumeOutput(): `this.emitCompileError(projectId, line)`. Cũng trong consumeOutput:
  if (type === 'stdout' && /hmr update/i.test(line) && generation === instance.generation) instance.error = undefined
src/state/processStore.ts (appendLogs): `const clearError = fresh.some((line) => /hmr update/i.test(line.text))`
src/components/PreviewPane.tsx hiển thị banner "Lỗi biên dịch:" + prop compileError (một chuỗi) + nút "Xem Console".
electron/preload.ts expose api.process.onCompileError; src/ipc-client.ts + src/env.d.ts khai báo kiểu.

VẤN ĐỀ
(1) Vite in lỗi nhiều dòng (Internal server error / Plugin / File: …/slides.md__slidev_5.md:12:3 / code frame). Xử lý từng dòng làm mất file/dòng/slide.
(2) Banner chỉ tắt khi có "hmr update"; Vite còn in "page reload", "hmr invalidate", "program reload" nên banner có thể kẹt sau khi đã sửa đúng.

YÊU CẦU
1. Tạo electron/services/compileErrorParser.ts (thuần, không import electron), export class CompileErrorAggregator với method push(line: string): CompileEvent[] . CompileEvent = {type:'error', summary, raw, file?, line?, column?, slideNo?} | {type:'ok'}.
   - Bắt đầu khối lỗi khi khớp regex kích hoạt hiện tại; gom các dòng kế tiếp (thụt lề, hoặc bắt đầu bằng "Plugin:", "File:", số dòng của code frame) cho tới dòng trống / dòng "[vite]" mới / quá 40 dòng hoặc 4KB.
   - Tách "File: <đường dẫn>:<dòng>:<cột>"; nếu tên file dạng "<entry>.md__slidev_<N>.md" thì slideNo=N và file=<entry>.md.
   - Phát {type:'ok'} khi gặp: hmr update | page reload | hmr invalidate | program reload | server restarted.
2. processManager: dùng aggregator (1 instance/project, xoá khi stop/start lại). Gửi 'process:compile-error' với object mới (giữ thêm trường `message` = summary để tương thích ngược) và gửi 'process:compile-ok' khi có {type:'ok'}. Giữ nguyên logic reset instance.error.
3. preload.ts + ipc-client.ts + env.d.ts: thêm onCompileOk; mở rộng kiểu payload của onCompileError.
4. processStore: compileError trở thành object {summary, file?, line?, column?, slideNo?, raw}; xoá khi nhận compile-ok hoặc khi status='starting'; thêm action dismissCompileError(projectId).
5. PreviewPane: banner hiển thị summary + "slide N" nếu có; nút "Đi tới lỗi" (gọi prop onGotoError), nút "Ẩn". ProjectWorkspace: onGotoError dùng editorRef.reveal({file, line, column, length:0, confidence:'exact'}); nếu chỉ có slideNo thì dùng parseSlideIndex(entryText, entryFile) để lấy contentStartLine.
6. EditorPane: nhận prop `errorMarker?: {file,line,column,message}`; dùng monaco.editor.setModelMarkers để tô lỗi ở đúng file đang mở; xoá marker khi prop undefined.
7. Test vitest cho CompileErrorAggregator với ít nhất 3 log mẫu (lỗi Vue "Element is missing end tag", lỗi YAML frontmatter, lỗi "Failed to resolve import") và 1 log "page reload" → {type:'ok'}.

RÀNG BUỘC
- Không đổi tên/kênh IPC hiện có; chỉ thêm 'process:compile-ok'.
- Không làm tăng số lần setState/IPC khi log flood (giữ cơ chế batch log hiện tại).
- Không nuốt các dòng log: mọi dòng vẫn phải xuất hiện trong Console.
- Chạy `npm run typecheck && npm test`.
````

---

### #3 [Medium] Autosave 600ms ghi cả nội dung đang gõ dở → Slidev biên dịch bản lỗi liên tục

- **Nhóm**: Logic bug / UX
- **Vị trí**: `src/components/EditorPane.tsx:~225-235` (debounce autosave); mặc định `autoSaveDelayMs: 600` trong `shared/settings.ts`.
- **Mô tả**: sau mỗi 600ms ngừng gõ, file được ghi xuống đĩa và Vite biên dịch lại. Khi bạn đang gõ `<Block type="alert"` hoặc `$$` hoặc sửa frontmatter, bản dở dang cũng được ghi → lỗi biên dịch tạm thời, preview nhảy/đơ, log spam.
- **Ảnh hưởng**: cảm giác "slide lúc chạy lúc không", đặc biệt với theme có component Vue (Block, Figure…).

**Kế hoạch sửa:** (1) tăng mặc định lên 1200–1500ms; (2) thêm kiểm tra nhanh trước khi **autosave** (không áp dụng cho Cmd+S): frontmatter YAML hợp lệ, số dòng \`\`\` chẵn, số `$$` chẵn, thẻ PascalCase mở/đóng cân bằng; nếu không hợp lệ thì bỏ qua lượt autosave và hiện trạng thái "Chưa lưu: <lý do, dòng N>"; (3) đặt cờ cấu hình `editor.autoSaveGuard` (mặc định bật) trong Settings.

**Prompt #3 — đưa cho AI để sửa (nên làm sau Prompt #2 vì dùng lại marker của Monaco):**

````text
Dự án: Electron + React "Slidev Studio". File src/components/EditorPane.tsx có autosave debounce:

  debounceTimerRef.current = setTimeout(() => {
    const targetPath = contentPathRef.current
    if (targetPath && targetPath === filePathRef.current) void saveFileRef.current(targetPath, currentContentRef.current)
  }, settings.autoSaveDelayMs)

shared/settings.ts: editor.autoSaveDelayMs mặc định 600; projectStore.sanitizeSettings() kẹp 100–10000.

VẤN ĐỀ: autosave ghi cả bản Markdown đang gõ dở (thẻ Vue chưa đóng, "$$" lẻ, fence ``` lẻ, frontmatter YAML dở) → Slidev dev server biên dịch bản lỗi liên tục.

YÊU CẦU
1. shared/settings.ts: đổi mặc định autoSaveDelayMs = 1200; thêm editor.autoSaveGuard: boolean (mặc định true) vào interface AppSettings, DEFAULT_SETTINGS và sanitizeSettings (safeBoolean). Không đổi settingsVersion; cài đặt cũ thiếu trường phải nhận giá trị mặc định (deepMerge đã lo).
2. Tạo src/lib/markdownGuard.ts (thuần, có test): `checkSlideMarkdown(text: string): {ok: true} | {ok: false; line: number; reason: string}` kiểm tra: (a) mọi khối frontmatter (giữa các dòng `---` ngoài code fence) mà trông như YAML thì parse được bằng thư viện `yaml`; (b) số dòng mở/đóng fence ``` hoặc ~~~ cân bằng; (c) số dòng chỉ chứa `$$` là chẵn; (d) thẻ component PascalCase dạng <Foo ...> phải có </Foo> hoặc tự đóng (bỏ qua nội dung trong code fence và inline code). Chỉ áp dụng cho file .md.
3. EditorPane: khi autosave 'afterDelay' và settings.autoSaveGuard bật, gọi checkSlideMarkdown trước khi ghi; nếu !ok thì KHÔNG ghi, giữ isDirty=true, hiện trạng thái "Chưa lưu (tạm dừng autosave): <reason> — dòng N" ở thanh trên editor và dùng monaco.editor.setModelMarkers (owner 'studio-guard', mức Warning) đánh dấu dòng đó; xoá marker khi hợp lệ. Cmd+S/Ctrl+S và nút Lưu LUÔN ghi bất kể guard. autoSave 'onBlur' cũng bỏ qua guard.
4. SettingsPage.tsx: thêm công tắc "Tạm dừng autosave khi Markdown chưa hợp lệ" (autoSaveGuard) ở nhóm Editor, cùng kiểu với các công tắc hiện có.
5. Test vitest cho checkSlideMarkdown: frontmatter hỏng, fence lẻ, $$ lẻ, <Block> thiếu </Block>, và các trường hợp HỢP LỆ (thẻ nằm trong code fence, `a < b` trong inline code, deck mẫu electron/templates/default/slides.md và hcmut-bach/example.md phải ok:true).

RÀNG BUỘC
- Không đổi hành vi flush khi đổi file / đóng tab / beforeunload (vẫn ghi để không mất dữ liệu).
- Không làm chậm gõ phím: guard chạy trong callback debounce, không chạy mỗi lần onChange.
- Chạy `npm run typecheck && npm test`.
````

---

### #4 [Medium] Không kiểm tra trước theme trong frontmatter đã được cài chưa

- **Nhóm**: Logic bug / UX
- **Vị trí**: `electron/services/processManager.ts` (`startInternal`, phần `dependenciesInstalled` chỉ kiểm tra `node_modules/.bin/slidev` hoặc `@slidev/cli`).
- **Mô tả**: nếu bạn đổi `theme:` trong editor sang theme chưa có trong `node_modules`, Slidev thoát sau ~1 giây vì không thể hỏi cài đặt khi `stdin` bị đóng (đã tái hiện ở audit trước, thí nghiệm C). App hiện báo lỗi bằng đoạn cuối log thô — không chỉ ra cách khắc phục.
- **Ảnh hưởng**: người dùng gặp "không biên dịch được" mà thực ra chỉ cần cài 1 package.

**Kế hoạch sửa:** đọc `theme:` từ headmatter của entry; suy ra tên package theo quy tắc Slidev (`@slidev/theme-<x>`, `slidev-theme-<x>`, tên đầy đủ, hoặc đường dẫn `./`, `../`, `/`); kiểm tra `node_modules/<pkg>/package.json` (hoặc thư mục tồn tại với đường dẫn); nếu thiếu và `autoInstallDeps` bật thì cài đúng package đó; nếu có `engines.slidev` không tương thích với CLI đang cài thì báo lỗi rõ ràng. Nên làm cùng #6.

**Prompt #4 — đưa cho AI để sửa (gộp với #6):**

````text
Dự án: Electron "Slidev Studio". electron/services/processManager.ts, hàm startInternal(), hiện chỉ kiểm tra CLI đã cài:

  const localBin = path.join(projectPath, 'node_modules', '.bin', process.platform === 'win32' ? 'slidev.cmd' : 'slidev')
  const cliPackage = path.join(projectPath, 'node_modules', '@slidev', 'cli', 'package.json')
  const dependenciesInstalled = fs.existsSync(localBin) || fs.existsSync(cliPackage)
  if (!dependenciesInstalled) { ... installQueue.run(... execa(server.packageManager, ['install', ...registry]) ...) }

Nếu frontmatter của file entry có `theme:` trỏ tới package chưa cài, Slidev thoát ngay (không prompt được vì stdin='ignore'); người dùng chỉ thấy đoạn log cuối.

Ngoài ra scaffolder.ts (getCustomThemePackage) và các template electron/templates/*/package.json dùng phiên bản "latest" cho theme trong khi CLI là "^53.0.0".

YÊU CẦU
1. Tạo electron/utils/themeResolver.ts (thuần, có test):
   - `readTheme(entryText: string): string | undefined` — parse khối frontmatter đầu bằng thư viện `yaml`, trả về giá trị `theme` (chuỗi) nếu có.
   - `themePackageName(theme: string): {kind:'package'; name: string} | {kind:'path'; path: string}`: 'none' → bỏ qua; bắt đầu bằng '.' hoặc '/' hoặc ổ đĩa Windows → path; bắt đầu '@' hoặc 'slidev-theme-' → package nguyên tên; 'default'|'seriph'|'apple-basic'|'bricks'|'shibainu' → `@slidev/theme-<x>`; còn lại → `slidev-theme-<x>`.
   - `checkThemeInstalled(projectPath, resolved): {ok:true; version?: string; engine?: string} | {ok:false; reason:'missing'|'path-missing'}`.
   - `isEngineCompatible(engineRange: string|undefined, cliVersion: string): boolean` (dùng `semver`; nếu engineRange rỗng thì true).
2. processManager.startInternal: sau khi CLI đã cài và trước khi spawn, đọc entry file, gọi readTheme → themePackageName → checkThemeInstalled.
   - Nếu 'missing' và server.autoInstallDeps: log "[Slidev Studio] Theme <name> chưa cài, đang cài..." rồi chạy `<packageManager> install <name>` (npm: `install --save-dev <name>`; pnpm/yarn/bun dùng lệnh add tương ứng, như getInstallCommand trong export.ipc.ts) qua installQueue, có tôn trọng abortController.
   - Nếu autoInstallDeps tắt: throw Error tiếng Việt nói rõ package nào thiếu và lệnh cần chạy.
   - Sau khi cài, đọc engines.slidev của theme và version của @slidev/cli đã cài; nếu !isEngineCompatible → throw Error: "Theme <name>@<ver> yêu cầu Slidev <range>, đang cài CLI <ver>. Hãy nâng @slidev/cli hoặc ghim theme phiên bản cũ hơn."
3. Template & scaffolder: thêm trường `themeRange` vào TemplateInfo/BUNDLED_TEMPLATES (đặt giá trị tạm '^' + major hiện hành của từng theme sau khi kiểm tra bằng `npm view <pkg> version engines.slidev` trên máy có mạng; ghi rõ trong PR chỗ nào chưa kiểm tra được) và dùng nó thay cho 'latest' khi ghi dependencies. Với customTheme (theme người dùng gõ), thử 'latest' rồi chạy kiểm tra engine ở bước 2.
4. Test vitest cho themeResolver (bảng ví dụ tên theme → package), và test isEngineCompatible.

RÀNG BUỘC
- Không tự tải CLI khác ngoài dự án (giữ thông điệp hiện có "Studio không tự tải một bản CLI khác").
- Theme dạng đường dẫn (vd `./`) chỉ kiểm tra thư mục tồn tại, không cài gì.
- Không làm chậm lần mở dự án đã đủ dependency: thêm tối đa vài lần đọc file nhỏ.
- Chạy `npm run typecheck && npm test`.
````

---

### #5 [Medium] Template `hcmut-bach`: cấu hình "project = theme", nguy cơ xung đột phiên bản, và bỏ qua Tiêu đề/Tác giả của Wizard

- **Nhóm**: Logic bug / Maintainability
- **Vị trí**: `electron/templates/hcmut-bach/package.json`; `electron/services/scaffolder.ts:188-191` (ghi đè `@slidev/cli`); `scaffolder.ts` khối "Process slides.md" (chỉ xử lý `slides.md`).
- **Mô tả**:
  1. `package.json` của template là **package theme** (`name: slidev-theme-hcmut-bach`, `peerDependencies: {"@slidev/client": "53.0.0"}`, `devDependencies: {"@slidev/cli": "53.0.0"}`). Scaffolder xoá `devDependencies["@slidev/cli"]` và thêm `dependencies["@slidev/cli"] = "^53.0.0"`. `@slidev/cli` mới nhất của nhánh 53.x phụ thuộc đúng cùng phiên bản `@slidev/client` (xem `dependencies` của `@slidev/cli`); nếu đó không phải `53.0.0` thì peer `53.0.0` **xung đột** → `npm install` có thể trả `ERESOLVE`. ❓ **Chưa xác minh** vì không có registry; cách kiểm chứng: tạo dự án HCMUT rồi chạy `npm install` và `npm ls @slidev/client @slidev/cli`.
  2. Template không có `slides.md` ở gốc (entry là `example.md`, `theme: ./`), nên **Tiêu đề/Tác giả nhập ở Wizard bị bỏ qua hoàn toàn** cho template này (đã xác nhận qua code: chỉ `slides.md` được thay placeholder). `example.md` còn là nội dung capstone thật ("Group 07", chủ đề knee MRI) nên mọi dự án HCMUT mới đều mang theo nội dung đó.
  3. Dự án mới còn chứa lẫn `starter/`, `scripts/compare.py`, `CHANGELOG.md`, `README.md` của theme.
- **Ảnh hưởng**: tạo dự án HCMUT có thể không cài được; nếu cài được thì deck không phản ánh input của người dùng.

**Kế hoạch sửa:** đổi cấu trúc template thành **project + theme con**: `slides.md` (từ `starter/slides.md`, có placeholder, `theme: ./theme`), thư mục `theme/` chứa `layouts/ components/ styles/ setup/ utils/ assets/` và `package.json` của theme (không có peer ghim cứng), `patches/` ở gốc project, `package.json` của **project** khai báo `@slidev/cli` một range duy nhất + `patch-package`; kiểm chứng bằng `npm ls`.

**Prompt #6 — đưa cho AI để sửa (RỦI RO CAO — cần máy có mạng để xác minh; làm sau Prompt #4 và #5):**

````text
Dự án: Electron "Slidev Studio". Template electron/templates/hcmut-bach hiện là một *package theme* (không phải project Slidev):
 - package.json: name "slidev-theme-hcmut-bach", peerDependencies {"@slidev/client":"53.0.0","vue":"^3.5.0"}, devDependencies {"@slidev/cli":"53.0.0","patch-package":"8.0.1"}, scripts.postinstall "patch-package", slidev.defaults {aspectRatio "4/3", canvasWidth 800, fonts {...local}}.
 - Thư mục: layouts/ components/ styles/ setup/ utils/ assets/ patches/ scripts/ starter/ README.md CHANGELOG.md example.md (example.md có `theme: ./`).
electron/services/scaffolder.ts (createProject) copy nguyên thư mục template, rồi:
   packageJson.dependencies['@slidev/cli'] = projectStore.getSettings().projects.defaultCliRange || '^53.0.0'
   delete packageJson.devDependencies['@slidev/cli']
và chỉ xử lý placeholder cho file slides.md ở gốc (template này không có).

VẤN ĐỀ
(1) Nghi ngờ xung đột: CLI '^53.0.0' kéo @slidev/client cùng phiên bản mới nhất, còn peer của theme ghim cứng 53.0.0 → npm ERESOLVE. (Cần xác minh trên máy có mạng: `npm install` rồi `npm ls @slidev/client @slidev/cli`.)
(2) Tiêu đề/Tác giả/Ngày của Wizard bị bỏ qua vì không có slides.md có placeholder; example.md mang nội dung capstone cố định.
(3) Dự án sinh ra chứa lẫn starter/, scripts/, CHANGELOG.md, README.md của theme.

YÊU CẦU
1. Tái cấu trúc electron/templates/hcmut-bach thành:
   hcmut-bach/
     package.json        (của PROJECT: name "{{SLUG}}", private, type module, scripts dev/build/export chạy `slidev slides.md`, postinstall "patch-package"; dependencies: @slidev/cli (một range duy nhất), vue; devDependencies: patch-package. KHÔNG có peerDependencies, KHÔNG có playwright)
     slides.md           (dựa trên starter/slides.md; headmatter dùng placeholder title: '{{TITLE}}', authors: ['{{AUTHOR}}'], date: '{{DATE}}'; `theme: ./theme`; nội dung mẫu ngắn, trung tính, không dùng nội dung capstone cũ)
     patches/            (chuyển từ patches/ cũ; đảm bảo patch-package tìm thấy ở gốc project)
     theme/              (package.json của theme: name, version, engines.slidev, slidev.defaults; KHÔNG ghim @slidev/client cứng — dùng peer range rộng '^53.0.0' hoặc bỏ peer; layouts/ components/ styles/ setup/ utils/ assets/)
   Giữ bản example.md cũ ở docs/ ngoài thư mục template (hoặc xoá khỏi bundle) — không đưa vào dự án mới.
2. Sửa tất cả đường dẫn tương đối bị ảnh hưởng (import '../assets/...', url('../assets/fonts/...') trong styles/index.css, patches, scripts/check-overflow.mjs nếu giữ) và `theme: ./theme` sao cho Slidev resolve đúng.
3. scaffolder.ts: bỏ nhánh đặc biệt nếu không còn cần; vì template giờ có slides.md và placeholder nên Wizard áp dụng bình thường (kết hợp với renderTemplate của Prompt #1 nếu đã có). Đảm bảo `@slidev/cli` chỉ xuất hiện một lần, trong `dependencies`, đúng `defaultCliRange`.
4. projectStore.validateSlidevFolder phải nhận dự án mới (có @slidev/cli trong dependencies và slides.md có `theme:`).
5. Cập nhật BUNDLED_TEMPLATES nếu id/mô tả đổi. Cập nhật README.md (mục danh sách template).

XÁC MINH (bắt buộc, ghi kết quả vào mô tả PR; nếu không chạy được vì thiếu mạng thì nói rõ):
 - Tạo dự án bằng Wizard với template HCMUT, Tiêu đề "Thử nghiệm 'AI'" → `npm install` thành công, `npm ls @slidev/client @slidev/cli` chỉ có MỘT phiên bản mỗi loại, `npx slidev slides.md` chạy, cover hiển thị đúng tiêu đề/tác giả.
 - `npm run build` (slidev build) thành công.

RÀNG BUỘC
- Không đổi giao diện/CSS/logic layout của theme (chỉ đổi đường dẫn nếu cần).
- Không xoá patches/@shikijs+vitepress-twoslash+4.4.3.patch (giữ nguyên nội dung).
- Không thêm playwright vào dependencies (ExportDialog đã cài theo nhu cầu).
````

---

### #6 [Medium] Theme dùng phiên bản `latest` trong khi CLI là `^53.0.0`

- **Nhóm**: Maintainability / Logic bug
- **Vị trí**: `electron/templates/{default,seriph,bricks,apple-basic,shibainu,dracula,penguin}/package.json` (`"latest"`); `scaffolder.ts:194` (`customTheme` cũng `'latest'`); `shared/settings.ts` `defaultCliRange: '^53.0.0'`.
- **Mô tả**: khi theme phát hành bản mới yêu cầu Slidev cao hơn (`engines.slidev`), dự án tạo mới sẽ có theme "quá mới" so với CLI `^53` → Slidev báo theme không tương thích hoặc lỗi runtime. Kết quả **thay đổi theo ngày tạo dự án**, khó tái hiện.
- **Ảnh hưởng**: lỗi "hôm qua chạy, hôm nay tạo mới thì không".

**Kế hoạch sửa:** ghim range theme theo major đã kiểm thử, thêm kiểm tra `engines.slidev` sau khi cài (đã nằm trong Prompt #4). **Sửa bằng Prompt #4** (mục 3 và 2).

---

### #7 [Medium] Theme HCMUT: ảnh nền `bk_bg.webp` có thể không bao giờ hiển thị (prop Boolean bị Vue ép về `false`)

- **Nhóm**: Logic bug
- **Vị trí**: `electron/templates/hcmut-bach/components/HbFrame.vue:20` (`background?: boolean`) và `:51` (`props.background ?? cfg.background !== false`); tất cả layout (`default.vue:14,19`, `agenda.vue`, `section.vue`, `two-cols.vue`, `end.vue`) truyền `:background="props.background"`.
- **Mô tả**: với `defineProps<{ background?: boolean }>()` mà không đặt `default: undefined`, Vue **ép prop Boolean vắng mặt về `false`** (Boolean casting). Khi đó `props.background ?? …` không bao giờ rơi xuống nhánh cấu hình toàn deck (`cfg.background`), nên `hasBackground` luôn `false` trừ khi từng slide ghi rõ `background: true`. Điều này trái với ghi chú "tắt ảnh nền cho deck…" (mặc định phải bật).
- **Độ chắc chắn**: suy luận từ ngữ nghĩa Vue; **chưa chạy**. Cách xác nhận nhanh: mở `example.md`, kiểm tra trong DevTools xem có phần tử `.hb-bg` không.
- **Ảnh hưởng**: theme mất nền, khác thiết kế Beamer.

**Kế hoạch sửa:** đặt `background: undefined` trong `withDefaults` của `HbFrame.vue` và của mọi layout truyền tiếp prop; giữ `full.vue` với mặc định `false`.

**Prompt #5 — đưa cho AI để sửa:**

````text
Theme Slidev tự viết: electron/templates/hcmut-bach (Vue 3.5, <script setup lang="ts">).
components/HbFrame.vue:
  const props = withDefaults(defineProps<{ cls?: string; headline?: boolean; titled?: boolean; footer?: boolean; size?: ContentSize; background?: boolean }>(), { cls: '', headline: true, titled: true, footer: true })
  const hasBackground = computed(() => props.background ?? cfg.background !== false)
Các layout default.vue, agenda.vue, section.vue, two-cols.vue, end.vue khai báo `background?: boolean` (không default) và truyền `:background="props.background"` cho HbFrame. full.vue có default `background: false`.

VẤN ĐỀ: Vue ép prop Boolean vắng mặt về false → `props.background ?? cfg.background !== false` luôn false → .hb-bg (ảnh assets/bk_bg.webp) không hiển thị và cấu hình `background` toàn deck không có tác dụng.

YÊU CẦU
1. Thêm `background: undefined` vào withDefaults của HbFrame.vue và của default.vue, agenda.vue, section.vue, two-cols.vue, end.vue (KHÔNG đổi full.vue).
2. Xác minh: với slide không khai báo background → `.hb-bg` có mặt; `background: false` ở frontmatter slide → không có; `background: false` ở headmatter toàn deck → không có ở mọi slide (trừ slide đặt `background: true`).
3. Cập nhật CHANGELOG.md của theme (mục 1.1.1: "Sửa: ảnh nền không hiển thị do Boolean casting").

RÀNG BUỘC: không đổi CSS, không đổi tên prop, không đổi hành vi của cover.vue ngoài việc nó dùng HbFrame.
````

---

### #8 [Medium] `git clone` nhận URL từ renderer không kiểm tra → chèn tham số (argument injection)

- **Nhóm**: Security
- **Vị trí**: `electron/services/projectStore.ts:424` (`await execa('git', ['clone', url, destPath])`); `electron/ipc/projects.ipc.ts` (`projects:cloneFromGit`).
- **Mô tả**: `url` đi thẳng vào danh sách tham số của `git`. Một URL bắt đầu bằng `-` (vd. `--upload-pack=<lệnh>`) sẽ được git hiểu là **tuỳ chọn**, có thể dẫn tới chạy lệnh tuỳ ý. Chưa giới hạn giao thức (`ext::`, `file:`), chưa đặt `GIT_TERMINAL_PROMPT=0` (git có thể treo chờ nhập mật khẩu), `repoName` suy từ URL chưa được làm sạch.
- **Ảnh hưởng**: nếu người dùng dán URL từ nguồn không tin cậy, có thể bị thực thi lệnh; thấp về khả năng nhưng cao về hậu quả.

**Kế hoạch sửa:** kiểm tra URL bằng allowlist (`https://`, `ssh://`, `git@host:path`), từ chối bắt đầu bằng `-`, dùng `git clone -- <url> <dest>` kèm `-c protocol.ext.allow=never -c protocol.file.allow=never`, đặt `GIT_TERMINAL_PROMPT=0`, làm sạch `repoName`, kiểm tra `dest` nằm trong `targetDir`, dọn thư mục dở dang nếu clone lỗi.

Xem **Prompt #7** (gộp #8, #9, #14).

---

### #9 [Medium] Tự động `npm install` cho dự án không tin cậy chạy script cài đặt tuỳ ý

- **Nhóm**: Security
- **Vị trí**: `processManager.ts` (`startInternal`, khối cài dependencies); `scaffolder.ts` (bước install); `projects.ipc.ts` (`projects:addFolder`, `projects:cloneFromGit`).
- **Mô tả**: mở một thư mục/repo lạ có `package.json` chưa cài dependency (mặc định `autoInstallDeps: true`) sẽ chạy `npm install`, tức là **chạy lifecycle scripts** (`postinstall`…) của mọi dependency — thực thi mã tuỳ ý trên máy bạn, không có bước xác nhận.
- **Ảnh hưởng**: rủi ro khi clone repo của người khác. Với dự án do chính Studio tạo từ template thì chấp nhận được.

**Kế hoạch sửa:** thêm cờ `trusted` cho từng dự án (dự án do scaffolder tạo = `true`; thêm từ thư mục/clone = `false`); lần đầu cần cài dependency cho dự án `trusted=false` thì hiện hộp thoại xác nhận nêu rõ lệnh sẽ chạy; thêm tuỳ chọn `--ignore-scripts` (lưu ý template HCMUT cần `postinstall: patch-package`).

Xem **Prompt #7**.

---

### #10 [Medium] `<webview>` chưa có lớp bảo vệ khi gắn/điều hướng

- **Nhóm**: Security
- **Vị trí**: `electron/main.ts:40` (`webviewTag: true`, `sandbox: false`); không có xử lý `will-attach-webview`; `PreviewPane.tsx` (`<webview … preload={preloadPath} partition="persist:slidev-preview">`).
- **Mô tả**: nội dung slide là **không tin cậy** (repo clone, embed, script trong slide). Renderer hiện có thể gắn webview với `src`/`preload`/`webpreferences` tuỳ ý, và guest có thể điều hướng ra ngoài `localhost`. `sandbox: false` ở cửa sổ chính là **cần thiết** khi preload được build ra ESM (`.mjs`) — vì vậy càng cần thêm chốt chặn ở main.
- **Ảnh hưởng**: khi có lỗ hổng XSS/nội dung độc trong slide, phạm vi ảnh hưởng rộng hơn cần thiết.

**Kế hoạch sửa:** trong main, `app.on('web-contents-created')` → `will-attach-webview`: xoá `preload` do renderer đưa vào và đặt lại đúng preload của Studio, ép `nodeIntegration=false`, `contextIsolation=true`, `webSecurity=true`; chỉ cho phép `src` là `http://localhost:<port>` / `127.0.0.1` (và host LAN khi bật LAN); chặn `will-navigate` ra ngoài origin đó (mở link ngoài bằng `shell.openExternal` sau khi kiểm tra giao thức); dùng `setWindowOpenHandler` cho guest.

Xem **Prompt #8**.

---

### #11 [Medium] Không có test cho các phần logic phức tạp nhất

- **Nhóm**: Maintainability
- **Vị trí**: `tests/utilities.test.ts` (5 test: `stripAnsi`, `PortAllocator`, `ProjectStore` settings, `samePath`, `waitForReady`).
- **Mô tả**: chưa có test cho `scaffolder` (nguồn của #1, #5), `slideIndex`/`sourceLocator` (tính năng click-to-source mới, logic regex phức tạp), `validateSlidevFolder`, `resolveSlidevRunner`, `emitCompileError`. Mình đã thử `parseSlideIndex` bằng tay trên 4 deck (khớp), nhưng đó chỉ là kiểm tra một lần.
- **Ảnh hưởng**: hồi quy âm thầm mỗi lần sửa.

**Kế hoạch sửa:** thêm test song song với từng prompt (đã nằm trong Prompt #1, #2, #3, #4); bổ sung test cho `parseSlideIndex`/`locateSource` trong Prompt #9.

---

### #12 [Low] Ghi file dùng tên tạm cố định theo PID → hai lần ghi chồng nhau có thể lỗi

- **Nhóm**: Logic bug
- **Vị trí**: `electron/ipc/fs.ipc.ts:57` (tên tạm là `safePath + ".tmp-" + process.pid`, cố định theo PID).
- **Mô tả**: hai lần ghi cùng file gần nhau (autosave + Cmd+S, hoặc flush khi chuyển file) dùng cùng tên tạm; lượt thứ hai có thể ghi đè/đổi tên file tạm của lượt đầu → `ENOENT` ở `rename`, hiện "Lỗi lưu — đang thử lại". Nếu app chết giữa chừng, file `slides.md.tmp-<pid>` bị bỏ lại trong dự án (watcher của Vite và `git status` đều thấy).
- **Ảnh hưởng**: lỗi lưu ngẫu nhiên; rác trong thư mục dự án.

**Kế hoạch sửa:** tên tạm duy nhất (`crypto.randomUUID()`), xoá file tạm khi lỗi, và tuần tự hoá ghi theo từng đường dẫn (hàng đợi Promise theo `safePath`). Xem **Prompt #9**.

---

### #13 [Low] Chế độ Click-to-Source `click` chặn mọi thao tác click trong slide

- **Nhóm**: Logic bug / UX
- **Vị trí**: `electron/webview-preload.ts:~266` (`event.preventDefault(); event.stopImmediatePropagation()` trong `clickPayload`).
- **Mô tả**: khi `sourceJump.trigger = 'click'`, mọi click (kể cả link, nút, `v-click`) đều bị chặn và biến thành thao tác nhảy tới source. Mặc định `alt-click` thì ổn.
- **Ảnh hưởng**: khó tương tác với slide có nút/link khi chọn trigger này.

**Kế hoạch sửa:** không chặn nếu click rơi vào `a, button, input, [data-v-click], video`; hoặc ghi chú rõ trong Settings rằng trigger `click` vô hiệu hoá tương tác slide. Xem **Prompt #8**.

---

### #14 [Low] Nhập file cài đặt cho phép đặt PATH, registry, tham số CLI tuỳ ý không kiểm tra

- **Nhóm**: Security
- **Vị trí**: `projectStore.ts:251` (`importSettings`) và `sanitizeSettings` (chỉ kiểm tra kiểu chuỗi cho `system.nodePathOverride`, `server.registry`, `server.extraArgs`, `export.outputDir`).
- **Mô tả**: một file `settings.json` từ nguồn lạ có thể trỏ `nodePathOverride` tới thư mục chứa `node`/`npm` giả (được đưa lên đầu `PATH` trong `buildEnv`), đặt `registry` sang máy chủ khác, hoặc thêm `extraArgs`.
- **Ảnh hưởng**: thực thi mã/tải package từ nguồn không mong muốn nếu người dùng nhập cài đặt lạ.

**Kế hoạch sửa:** kiểm tra `nodePathOverride` là thư mục tồn tại và chứa `node`; `registry` phải là URL `https://`; `extraArgs` không chứa ký tự điều khiển shell và cảnh báo khi khác rỗng; hiện hộp thoại xác nhận khi import làm thay đổi các trường nhạy cảm. Xem **Prompt #7**.

---

### #15 [Low] `{{DATE}}` dùng giờ UTC

- **Nhóm**: Logic bug
- **Vị trí**: `scaffolder.ts` (`const today = new Date().toISOString().split('T')[0]…`).
- **Mô tả**: ở UTC+7, từ 00:00 đến 07:00 ngày tạo dự án bị ghi lùi 1 ngày.
- **Sửa**: nằm trong **Prompt #1**.

---

### #16 [Low] Đóng gói và tài liệu lệch với thực tế

- **Nhóm**: Maintainability
- **Vị trí**: `electron-builder.yml`; `README.md`.
- **Mô tả**: (a) `files` đã gồm `electron/templates/**/*` **và** `extraResources` copy templates lần nữa → template nằm hai nơi trong bản đóng gói; (b) `mac.icon: build/icon.icns` và `directories.buildResources: build` nhưng zip **không có thư mục `build/`** (có thể do bản "clean"; hãy xác nhận thư mục này có trong repo thật, nếu thiếu thì `electron-builder` sẽ lỗi/cảnh báo icon); (c) README nói "4 theme tuyển chọn" (thực tế 9) và liệt kê `SettingsModal.tsx` (thực tế là `SettingsPage.tsx`).
- **Sửa**: **Prompt #9**.

---

### #17 [Low] Mật khẩu `--remote` hiển thị trong danh sách tiến trình

- **Nhóm**: Security
- **Vị trí**: `processManager.ts:~268` (`--remote=${server.remotePassword}` truyền qua tham số dòng lệnh).
- **Mô tả**: log trong app đã che (`--remote=••••`) nhưng `ps` vẫn thấy mật khẩu. Đây là giới hạn của CLI Slidev.
- **Ảnh hưởng**: thấp (chỉ khi bật chế độ LAN có mật khẩu, người khác trên cùng máy).
- **Sửa**: ghi chú trong Settings; cân nhắc sinh mật khẩu ngẫu nhiên mỗi phiên. Xem **Prompt #9**.

---

### #18 [Low] Nhận diện file entry mong manh; thêm lại dự án ghi đè danh sách entry

- **Nhóm**: Logic bug
- **Vị trí**: `projectStore.ts:318,330` (`content.startsWith('---')`), `addProjectFromFolder` (`existing.entryFiles = validation.entryFiles`).
- **Mô tả**: file có BOM UTF-8 hoặc dòng trống/comment trước `---` không được coi là entry; và mỗi lần "thêm" lại cùng thư mục, danh sách entry mà người dùng đã tuỳ chỉnh qua `updateProject` bị ghi đè.
- **Sửa**: bỏ BOM/khoảng trắng đầu trước khi kiểm tra; khi dự án đã tồn tại thì **gộp** thay vì ghi đè. Xem **Prompt #9**.

---

### #19 [Low] Preview nạp trang hai lần khi mở lần đầu

- **Nhóm**: Performance
- **Vị trí**: `PreviewPane.tsx` (`<webview src={url}>` và `useEffect` gán lại `webviewRef.current.src = nextUrl`).
- **Mô tả**: webview mở `http://localhost:PORT` rồi ngay sau đó bị gán sang `/<slide>` hoặc `/print`. Ở chế độ cuộn, deck được tải hai lần.
- **Ảnh hưởng**: chậm/nháy khi mở, log HMR thừa.
- **Sửa**: không đặt `src` ở JSX mà chỉ gán một lần trong effect, hoặc tính `nextUrl` ngay từ đầu. Xem **Prompt #8**.

---

## 4. Lộ trình sửa (theo pha)

| Pha | Mục tiêu | Issue | Prompt | Ước lượng |
|---|---|---|---|---|
| A | Dứt điểm triệu chứng "không biên dịch được" và cho phép chẩn đoán | #1, #15, #2, #3 | 1 → 2 → 3 | 1–1,5 ngày |
| B | Dependency/template bền vững | #4, #6, #7, #5 | 4 → 5 → 6 | 1–2 ngày (cần mạng để xác minh #5) |
| C | Bảo mật + preview | #8, #9, #14, #10, #13, #19 | 7 → 8 | ~1 ngày |
| D | Dọn dẹp + test | #11, #12, #16, #17, #18 | 9 | ~0,5–1 ngày |

**Phụ thuộc:** Prompt 3 dùng lại marker/cách `reveal` của Prompt 2 (nên làm sau). Prompt 4 dùng thư viện `yaml` do Prompt 1 thêm. Prompt 6 (tái cấu trúc template HCMUT) nên làm sau Prompt 1, 4 và 5 để dùng `renderTemplate`, `themeRange` và tránh sửa chồng lên file `HbFrame.vue`.

> **Bảng tra Prompt ↔ Issue:** Prompt #1 (#1, #15) · #2 (#2) · #3 (#3) · #4 (#4, #6) · #5 (#7) · #6 (#5) · #7 (#8, #9, #14) · #8 (#10, #13, #19) · #9 (#11, #12, #16, #17, #18). Prompt #1–#6 nằm ngay dưới từng issue ở mục 3; Prompt #7–#9 nằm ở mục 5.

---

## 5. Prompt bổ sung (gộp các issue còn lại)

### Prompt #7 — Bảo mật main process: git clone, xác nhận tin cậy, nhập cài đặt (#8, #9, #14)

````text
Dự án: Electron "Slidev Studio" (main process TypeScript ESM, execa, fs-extra).

1) electron/services/projectStore.ts, cloneFromGit(url, targetDir):
     const repoName = url.replace(/\/$/, '').split('/').pop()?.replace(/\.git$/, '') || 'slidev-project'
     const destPath = path.join(targetDir, repoName)
     ...
     await execa('git', ['clone', url, destPath])
   `url` đến từ renderer (ipc 'projects:cloneFromGit' trong electron/ipc/projects.ipc.ts) và không được kiểm tra: URL bắt đầu bằng '-' (vd --upload-pack=...) bị git hiểu là tuỳ chọn.
2) processManager.startInternal (khối installQueue.run chạy `<packageManager> install`) và scaffolder.createProject tự chạy install (mặc định server.autoInstallDeps = true) cho MỌI dự án, kể cả thư mục/clone lạ → chạy lifecycle scripts tuỳ ý.
3) projectStore.importSettings / sanitizeSettings chỉ kiểm tra kiểu chuỗi cho system.nodePathOverride, server.registry, server.extraArgs, export.outputDir.

YÊU CẦU
A. Git clone
 - Tạo hàm thuần validateGitUrl(url): chấp nhận https://…, ssh://…, git@host:owner/repo(.git); từ chối chuỗi rỗng, bắt đầu bằng '-', chứa khoảng trắng/ký tự điều khiển, giao thức khác (ext::, file:, http:).
 - Chạy: execa('git', ['-c','protocol.ext.allow=never','-c','protocol.file.allow=never','clone','--',url,destPath], {env:{...process.env, GIT_TERMINAL_PROMPT:'0'}, timeout: 5*60*1000}).
 - repoName phải khớp /^[A-Za-z0-9._-]{1,64}$/ và không phải '.'/'..'; sau path.resolve phải nằm trong targetDir; nếu clone lỗi thì xoá destPath vừa tạo (chỉ khi do lần clone này tạo).
B. Xác nhận tin cậy
 - Thêm `trusted?: boolean` vào ProjectItem. Dự án tạo bởi scaffolder → trusted:true; addFolder/cloneFromGit → trusted:false (dự án đã lưu trước đó thiếu trường = coi là trusted để không phá hành vi cũ).
 - Khi processManager cần chạy install cho dự án trusted===false: gửi sự kiện 'process:needs-trust' {projectId, command} và chờ renderer trả lời qua ipc 'process:confirmTrust' (Đồng ý một lần / Đồng ý & nhớ / Huỷ). Huỷ → dừng với thông báo rõ ràng. Thêm tuỳ chọn "Bỏ qua script cài đặt (--ignore-scripts)" trong hộp thoại (mặc định bật cho dự án không tin cậy).
 - Renderer: hộp thoại xác nhận trong ProjectWorkspace (dùng lại phong cách modal của App.tsx).
C. Import settings
 - Trước khi áp dụng, kiểm tra: nodePathOverride phải là thư mục tồn tại và có file `node`/`node.exe`; registry rỗng hoặc bắt đầu bằng https://; extraArgs không chứa ký tự điều khiển và ≤ 200 ký tự; export.outputDir tương đối hoặc tuyệt đối tồn tại. Giá trị sai → bỏ qua trường đó và trả về danh sách cảnh báo cho renderer hiển thị.
 - Nếu file import đổi bất kỳ trường nhạy cảm nào ở trên, main phải hỏi xác nhận bằng dialog.showMessageBox trước khi áp dụng.

TEST (vitest): validateGitUrl với các URL hợp lệ/độc hại (`--upload-pack=x`, `ext::sh -c id`, `file:///etc`, `git@github.com:a/b.git`, `https://github.com/a/b`); bảng kiểm tra cho các trường settings.

RÀNG BUỘC: không đổi chữ ký các ipc hiện có (chỉ thêm kênh mới); không hiện hộp thoại cho dự án do Studio tự tạo; giữ nguyên hành vi mở dự án đã có sẵn node_modules. Chạy `npm run typecheck && npm test`.
````

### Prompt #8 — Webview hardening và preload preview (#10, #13, #19)

````text
Dự án: Electron "Slidev Studio". electron/main.ts tạo BrowserWindow với webviewTag:true và sandbox:false (bắt buộc sandbox:false vì preload là ESM .mjs — KHÔNG đổi). src/components/PreviewPane.tsx render:
  <webview ref={webviewRef} src={url} preload={preloadPath} partition="persist:slidev-preview" webpreferences="contextIsolation=yes" .../>
Không có xử lý will-attach-webview/will-navigate. Nội dung slide (repo clone, embed) là không tin cậy.

YÊU CẦU
1. electron/main.ts: thêm app.on('web-contents-created', (_e, contents) => {...}):
   - contents.on('will-attach-webview', (event, webPreferences, params)): xoá webPreferences.preloadURL/preload do renderer gửi và gán lại đúng file webview preload của Studio (cùng cách settings.ipc.ts 'preview:getPreloadPath' tìm .mjs/.js); ép nodeIntegration=false, contextIsolation=true, webSecurity=true, allowRunningInsecureContent=false; chỉ cho phép params.src có origin http://localhost:<port> hoặc http://127.0.0.1:<port> (thêm host LAN hiện tại khi server.bindMode==='lan'); nếu không hợp lệ → event.preventDefault().
   - Với contents.getType()==='webview': contents.on('will-navigate') chặn điều hướng khác origin ban đầu (mở link http/https bên ngoài bằng shell.openExternal sau khi kiểm tra giao thức, không mở file:, javascript:, data:); contents.setWindowOpenHandler tương tự (deny + openExternal cho http/https).
2. electron/webview-preload.ts hàm clickPayload(): không gọi preventDefault/stopImmediatePropagation nếu sự kiện rơi vào phần tử tương tác (a, button, input, textarea, select, summary, [role=button], video) khi trigger === 'click'; với alt-click/ctrl-click/double-click giữ nguyên hành vi.
3. PreviewPane.tsx: bỏ thuộc tính src={url} khỏi JSX; chỉ đặt src một lần qua effect với nextUrl tính từ đầu (routeUrl(url, navMode, slideNo)), để không tải trang hai lần. Giữ nguyên hành vi khôi phục slide và đổi chế độ paged/scroll.

XÁC MINH THỦ CÔNG: mở dự án → preview hiển thị bình thường; slide chứa link https → mở trình duyệt ngoài; slide chứa <a href="file:///etc/passwd"> hoặc window.open('javascript:…') không làm gì; Alt+click vẫn nhảy tới source; chế độ cuộn dọc/ngang vẫn hoạt động; log Console cho thấy chỉ 1 lần tải trang lúc mở.

RÀNG BUỘC: không bật sandbox cho cửa sổ chính; không đổi kênh IPC hiện có. Chạy `npm run typecheck`.
````

### Prompt #9 — Dọn dẹp, ghi file an toàn, test cho slideIndex/sourceLocator (#11, #12, #16, #17, #18)

````text
Dự án: Electron "Slidev Studio". Các việc nhỏ, độc lập:

1. electron/ipc/fs.ipc.ts 'fs:writeFile' dùng tên tạm cố định:
     const tempPath = `${safePath}.tmp-${process.pid}`
     await fs.writeFile(tempPath, content, 'utf8'); await fs.rename(tempPath, safePath)
   Hai lần ghi chồng nhau cùng file có thể làm rename ENOENT; file .tmp bị bỏ lại khi crash.
   → Dùng tên tạm duy nhất `${safePath}.${crypto.randomUUID()}.tmp`, xoá file tạm trong catch, và tuần tự hoá ghi theo từng safePath bằng một Map<string, Promise<void>> (hàng đợi). Test: gọi 20 lần ghi song song cùng file với nội dung khác nhau → file cuối có nội dung của lần gọi cuối cùng, không còn file .tmp.
2. electron-builder.yml: `files` có 'electron/templates/**/*' đồng thời extraResources copy templates → bỏ dòng trong `files` (scaffolder.getTemplatesDir đã ưu tiên process.resourcesPath/templates). Xác nhận thư mục build/ (icon.icns, icon.png) tồn tại trong repo; nếu thiếu thì ghi rõ trong PR, KHÔNG tự bịa file icon.
3. README.md: cập nhật danh sách template (9 mục theo BUNDLED_TEMPLATES trong scaffolder.ts) và tên file `SettingsPage.tsx` thay cho `SettingsModal.tsx`.
4. processManager: khi server.bindMode==='lan' và remotePassword rỗng, tự sinh mật khẩu ngẫu nhiên 8 ký tự cho phiên đó và hiển thị trong log (che ở dòng lệnh như hiện tại). Ghi chú trong SettingsPage rằng mật khẩu có thể thấy qua `ps`.
5. projectStore.validateSlidevFolder/addProjectFromFolder: bỏ BOM (\uFEFF) và khoảng trắng đầu file trước khi kiểm tra content.startsWith('---'); khi dự án đã tồn tại, GỘP entryFiles (giữ thứ tự người dùng đã chỉnh, thêm file mới phát hiện, bỏ file không còn tồn tại) thay vì ghi đè.
6. Thêm tests/slideIndex.test.ts và tests/sourceLocator.test.ts: dùng các deck electron/templates/{default,frankfurt-academic}/slides.md và electron/templates/hcmut-bach/example.md (hoặc starter/slides.md nếu example.md bị chuyển) — kỳ vọng số slide 3 / 5 / 13 (hoặc 9); locateSource trả về đúng dòng cho: heading, mục list, ô bảng, dòng trong code fence, câu có công thức inline.

RÀNG BUỘC: không đổi API IPC; giữ atomic-write (ghi tạm rồi rename). Chạy `npm run typecheck && npm test`.
````

---

## 6. Checklist kiểm thử sau khi sửa

**Pha A (triệu chứng chính)**
- [ ] Wizard, mỗi template: tiêu đề `Cây 'AI' của tôi`, `A < B`, `{{x}}`, `Giá $& thêm`, `Nói "xin chào"` → `slidev` chạy, tiêu đề hiển thị đúng ký tự đã nhập.
- [ ] Trong editor gõ dở `<Block type="alert"` → **autosave tạm dừng**, hiện lý do + dòng; Cmd+S vẫn lưu được.
- [ ] Cố tình lưu bản lỗi (Cmd+S) → banner lỗi hiện **file + dòng + số slide**; bấm "Đi tới lỗi" nhảy đúng dòng.
- [ ] Sửa đúng → banner tự tắt trong ≤ 2 giây (thử cả trường hợp Vite in `hmr update` và `page reload`).

**Pha B (dependency/template)**
- [ ] Đổi `theme: seriph` trong dự án `default` chưa cài theme → app tự cài (hoặc hỏi) rồi chạy được.
- [ ] Tạo dự án HCMUT: `npm install` không `ERESOLVE`; `npm ls @slidev/client @slidev/cli` chỉ một phiên bản; cover hiển thị tiêu đề/tác giả từ Wizard; ảnh nền hiển thị; `slidev build` thành công.
- [ ] Theme `latest` không tương thích → thông báo "Theme X yêu cầu Slidev …" dễ hiểu.

**Pha C (bảo mật)**
- [ ] Clone `--upload-pack=touch /tmp/pwn` bị từ chối; `ext::sh -c id` bị từ chối; URL https hợp lệ clone bình thường.
- [ ] Mở thư mục lạ chưa cài dependency → có hộp thoại xác nhận trước khi `npm install`.
- [ ] Import `settings.json` có `nodePathOverride` trỏ thư mục không tồn tại → bị bỏ qua kèm cảnh báo.
- [ ] Slide chứa `<a href="file:///…">` hoặc điều hướng ra ngoài `localhost` → không mở trong webview.

**Pha D**
- [ ] `npm run typecheck && npm test && npm run lint` đều xanh trên máy có mạng.
- [ ] 20 lần ghi song song cùng file không để lại `.tmp`.
- [ ] Mở dự án: log cho thấy preview chỉ tải một lần.

---

## 7. Điểm mạnh / điều đang làm tốt

- Phân tầng rõ ràng: `ipc/` mỏng, `services/` chứa logic, `contextBridge` với `contextIsolation: true`, `nodeIntegration: false`; đường dẫn IPC đều đi qua `assertInsideAllowedRoot` / `assertRegisteredProjectRoot`.
- Vòng đời tiến trình được làm cẩn thận: `generation` chặn output muộn, `PortAllocator` giữ chỗ port có mutex, `tree-kill` + `SIGKILL` có chờ thoát, `pidRegistry` dọn server mồ côi, `singleInstanceLock`, `AbortController` cho cả install lẫn start.
- `sanitizeSettings` kiểm tra kiểu/miền giá trị rất kỹ và có migrate cài đặt v1 kèm bản sao lưu `.bak-v1`; `deepMerge` dùng `structuredClone` nên không làm bẩn `DEFAULT_SETTINGS`.
- `safeOutputName` và `resolveProjectOutputDir` chặn path traversal khi export; tên dự án và tên theme tuỳ chỉnh được kiểm tra bằng regex.
- `parseSlideIndex` xử lý đúng các trường hợp khó (frontmatter-only slide, code fence, `src:`); đã đối chiếu số slide khớp trên 4 deck.
- Theme HCMUT có cấu trúc gọn (một `HbFrame` dùng chung), có chế độ cảnh báo tràn slide chỉ ở dev, bundle font offline, và kèm script kiểm tra overflow.
- Thư mục `plan/` ghi lại lộ trình và các audit trước, thuận lợi cho việc giao việc cho AI.

## 8. Giới hạn của review này

- **Không có mạng** → không cài được dependency: **chưa chạy** `typecheck` đầy đủ, `eslint`, `vitest`, `electron-vite build`; **chưa chạy Slidev thật** và **không compile Vue**. Các kết luận về hành vi Slidev/Vite (định dạng khối lỗi, dòng `page reload`) là từ hiểu biết chung về Vite, cần đối chiếu với Console thực tế của bạn.
- **Đã tái hiện thật**: #1 (YAML hỏng ở 8/9 template; hành vi `$&` của `String.replace`). Mọi mục khác là suy luận từ code; các mục #5 và #7 đặc biệt cần chạy thử trước khi tin.
- **Không xác định được** deck/slide cụ thể đang lỗi trên máy bạn — cần log Console (xem mục 0).
- **Chỉ lướt qua**: `HomeDashboard`, `SettingsPage`, `ExportDialog`, `FileTree`, `ProjectCard`, `src/themes/`, và phần lớn `NewProjectWizard`. Định dạng `pptx-editable` / `md` của Export chưa được đối chiếu với CLI Slidev 53 nên chưa kết luận. Có thể còn lỗi ở đó.
- **Chưa kiểm tra** Windows/Linux (chỉ đọc code; `install-mac-app.sh` dành cho macOS).
- Số dòng tham chiếu theo bản zip `Slidev_clean_20260929_150845`; sau khi áp dụng các prompt, số dòng sẽ lệch — các prompt đã kèm đoạn code để AI tự định vị.
- Việc **sửa code không được thực hiện** ở lượt này (theo yêu cầu: chỉ audit và lập kế hoạch).
