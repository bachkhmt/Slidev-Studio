# Kế hoạch **Slidev Studio** — Phase 8

> Academic Palette Pack (≥ 5 phối màu học thuật) · Template Import · Sửa nền tảng & bổ sung để hoàn thiện

Nối tiếp `plan/ke-hoach-settings-theme-scroll-sync-29-09.md` (Phase 7: Settings Hub, App Theme, Scroll Modes, Click-to-Source — **đã có trong code**) và `plan/slidev-studio-29-09-final.md` (audit độ ổn định). Tài liệu này dựa trên bản `Slidev_clean_20260930_095714.zip`.

---

## 0. Đọc phần này trước

### 0.1 Mình hiểu yêu cầu như thế nào

- **"Theme màu / phối màu học thuật (HCMUT, Stanford, Oxford…)"** → mình hiểu là **bảng màu cho SLIDE** (thứ được xuất ra PDF/PPTX), áp được lên dự án bất kỳ lúc nào, không chỉ lúc tạo dự án. Nếu bạn còn muốn **giao diện app Studio** đổi màu theo trường, mục **M18.9** đã gộp sẵn (tự sinh app theme từ palette).
- **"Chỗ import template dễ dàng"** → một nơi duy nhất để đưa template của bạn/của người khác vào app (thư mục, `.zip`, Git URL, tên theme npm, kéo-thả, và "Lưu dự án hiện tại thành template"), có bước kiểm tra an toàn trước khi dùng.

### 0.2 Phạm vi & độ tin cậy của review

| Phần | Mức độ |
|---|---|
| Đã đọc kỹ | `electron/services/scaffolder.ts`, `templateRender.ts`, `themeColors.ts`, `electron/utils/themeResolver.ts`, `pathGuard.ts`, `ipc/fs.ipc.ts`, `ipc/projects.ipc.ts`, `ipc/scaffold.ipc.ts`, `preload.ts`, `projectStore.addProjectFromFolder`, `src/themes/*`, `shared/settings.ts`, `src/pages/NewProjectWizard.tsx`, cấu trúc `SettingsPage.tsx`, toàn bộ theme `hcmut-bach` (CSS, layouts, grep màu trong `HbFrame.vue`) |
| Chỉ lướt / grep | `ProjectWorkspace.tsx` (toolbar), `PreviewPane.tsx` (webview), `processManager.ts` (chỉ phần trust), `export.ipc.ts` (đầu file) |
| Chưa đọc | `webview-preload.ts`, `EditorPane.tsx`, `ExportDialog.tsx`, phần còn lại của `processManager.ts`/`projectStore.ts` |
| Không chạy được | `npm install`, `typecheck`, `lint`, `vitest` — sandbox không có mạng, repo không kèm `node_modules`. **Mọi phát hiện dưới đây dựa trên đọc code**, chưa có bằng chứng chạy thật. Mỗi prompt đều có bước tự kiểm ở cuối để AI sửa chạy `npm run typecheck && npm test`. |
| Chưa kiểm được | Biến CSS mà 7 theme npm (seriph, apple-basic, bricks, shibainu, frankfurt, penguin, dracula) dùng bên trong — vì không tải được package. Vì vậy plan **không hứa** palette áp hoàn hảo lên các theme đó (xem bảng hỗ trợ ở M18.4). |

### 0.3 Nghiên cứu bảng màu — cách đọc cột "độ tin cậy"

Mình tra trang brand chính thức của từng trường; cột này nói thẳng mã màu nào đã đối chiếu, mã nào chưa:

- ✅ **Official** — thấy trực tiếp trên trang identity/brand chính thức của trường.
- 🟨 **Project** — lấy từ chính code của bạn, đối chiếu chéo với pixel logo.
- ⚠️ **Memory** — lấy từ hiểu biết sẵn có, **chưa đối chiếu được** trong lần tra này → cần mở brand guide chính thức kiểm lại trước khi phát hành.
- 🎨 **Original** — palette do mình thiết kế, không gắn với trường nào.

---

## 1. Đối chiếu hiện trạng

| Chủ đề | Hiện trạng thực tế trong code | Hệ quả |
|---|---|---|
| Màu slide | Chỉ chọn được **template** lúc tạo (`NewProjectWizard.tsx` bước 2). Sau khi tạo, workspace **không có** chỗ đổi theme/màu slide (grep `theme` trong `ProjectWorkspace.tsx` chỉ thấy `effectiveThemeId` của app). Theme `hcmut-bach` có biến `--hb-light/dark/ink/tint/alert` trong `theme/styles/index.css`; 7 theme npm dùng màu cố định của chúng. | Cần một **lớp palette** tách khỏi template: 1 bộ token → sinh CSS → ghi vào dự án. |
| Palette hiện có | Chỉ tồn tại **app theme** (6 cái trong `src/themes/registry.ts`). Không có khái niệm palette cho slide. | Thêm mới hoàn toàn; tái dùng được kiểu dữ liệu và `buildScale` cho phần đồng bộ UI. |
| Import template | `BUNDLED_TEMPLATES` là mảng cứng (`scaffolder.ts:30–93`); `createProject` chặn mọi `templateId` ngoài mảng đó (`scaffolder.ts:161`); có `if (templateId === 'hcmut-bach' && …)` viết riêng trong bộ lọc copy (`scaffolder.ts:188`). Template nằm trong `extraResources` (`electron-builder.yml`) → **chỉ đọc** khi app đã đóng gói. `package.json` **không có** thư viện giải nén zip. Wizard chỉ có 1 ô "Theme tuỳ chỉnh (nâng cao)" để gõ tên npm. | Phải có `TemplateRegistry` (bundled + user), thư mục template người dùng ngoài app (`~/.slidev-studio/templates`), thư viện zip an toàn, manifest. |
| Placeholder | Regex cố định `TITLE\|AUTHOR\|DATE` (`templateRender.ts:7`); `{{SLUG}}` xử lý riêng ở `scaffolder.ts:204` và **chỉ** trong `package.json`. | Template import không thể có thêm trường (viện, giảng viên, mã đề tài…) nếu không mở rộng. |
| Trust | Cổng "tin cậy" chỉ thấy ở bước **cài dependency** (`processManager.ts:157,191`). `scaffolder.createProject` tự chạy `npm install` (`scaffolder.ts:269–290`) **không** qua cổng này rồi đăng ký dự án với `trusted = true` (`scaffolder.ts:294`). Grep không thấy cổng trust ở bước **start** dev server. | Với template có sẵn thì ổn; với template **import** thì đây là lỗ hổng thực thi mã tuỳ ý (xem F8). |

---

## 2. M18 — Academic Palette Pack

### 2.1 Danh sách palette (9 bộ, vượt yêu cầu ≥ 5)

| # | ID | Tên hiển thị | Chế độ | Gốc | Độ tin cậy |
|---|---|---|---|---|---|
| 1 | `hcmut-bach` | HCMUT · Bách Khoa | Light | Trường ĐH Bách Khoa – ĐHQG-HCM | 🟨 Project |
| 2 | `stanford-cardinal` | Stanford · Cardinal | Light | Stanford University | ✅ Official (một phần ⚠️) |
| 3 | `oxford-navy` | Oxford · Navy & Mauve | Light | University of Oxford | ✅ Official |
| 4 | `mit-cardinal` | MIT · Cardinal & Silver | Light | MIT | ⚠️ Memory |
| 5 | `tum-blue` | TUM · Blue & Ivory | Light | Technical University of Munich | ⚠️ Memory |
| 6 | `scholar-ivory` | Scholar Ivory (giấy ngà) | Light | Thiết kế riêng, hợp báo cáo nhiều chữ / in ấn | 🎨 Original |
| 7 | `ocean-research` | Ocean Research | Light | Thiết kế riêng, hợp CS/AI/data | 🎨 Original |
| 8 | `midnight-lab` | Midnight Lab (nền tối) | **Dark** | Thiết kế riêng, hợp phòng tối / demo code | 🎨 Original |
| 9 | `user:*` | Palette của tôi | Tuỳ | Người dùng tạo/import (M18.8) | — |

**Ghi chú về nguồn từng bộ (để bạn kiểm lại nếu cần):**

- **HCMUT** — mình **không tìm thấy mã hex chính thức** do trường công bố (trang của trường chỉ nói màu chủ đạo của logo là xanh). Vì vậy dùng đúng giá trị đang có trong theme của bạn (`#1488DB` xanh nhạt, `#032B91` xanh đậm, lấy từ `SudaBeamer.sty` theo comment trong `styles/index.css`) và **đã đo pixel `bk_logo.png`**: cụm màu chính ra `#1088D8` và `#002890` — khớp với hai giá trị trên. Nếu Phòng Truyền thông trường có bộ nhận diện chính thức, thay hai mã này là xong (chỉ sửa 1 dòng dữ liệu).
- **Stanford** — đã đối chiếu trang identity Stanford: Cardinal Red `#8C1515`, Black `#2E2D29`, Cool Grey `#53565A`, Digital Red `#B1040E`, Palo Verde `#279989`, Light grey `#E4E4E3`/`#D5D5D4`. Trang Stanford còn nhấn mạnh **tỉ lệ tương phản tối thiểu 3:1** cho chữ. ⚠️ Chưa đối chiếu được: Palo Alto Green `#175E54` (mình dùng làm `secondary`), Poppy `#E98300`, link `#006CB8`. Stanford khuyên dùng phông Source Sans, Source Serif, Crimson Text — trùng với Source Sans 3 đã bundle sẵn trong `hcmut-bach`.
- **Oxford** — đã đối chiếu trang communications của Oxford: Oxford Blue `#002147` (Pantone 282), Mauve `#776885`, Peach `#E08D79`, Potters Pink `#ED9390`, Dusk `#C4A29E`; màu xanh đậm hơn `#00152E` và xám-be `#C7C2BC` lấy từ style guide số của Oxford. Nền be nhạt `#F3F1EE` lấy từ bộ dữ liệu bên thứ ba (semi-official). `link`/`alert` là màu **suy ra** để đủ tương phản, không phải màu của Oxford.
- **MIT, TUM** — ⚠️ mã lấy từ trí nhớ (MIT Red `#A31F34`, silver `#8B959E`; TUM Blue `#0065BD`, `#005293`, `#003359`, ivory `#DAD7CB`, orange `#E37222`, green `#A2AD00`). Lần tra web này không xác nhận được. **Không phát hành hai bộ này cho tới khi bạn mở brand guide chính thức của MIT/TUM để đối chiếu.** Trong prompt P1 mình đã gắn cờ `verified: 'memory'` để UI hiện nhãn "chưa đối chiếu".

### 2.2 Bảng màu chi tiết

Mỗi palette có các token: `primary` (thanh tiêu đề, nút), `primaryDark` (heading, footer), `secondary`, `accent` (điểm nhấn — chỉ dùng cho **nền/đường kẻ/icon/biểu đồ**), `alert` (chữ nhấn/cảnh báo), `bg`, `surface` (khung trích dẫn, block), `ink` (chữ thân bài), `muted`, `border`, `link`, `codeBg`, `onPrimary` và `chart[5]`.

| ID | primary | primaryDark | secondary | accent | bg | surface | ink |
|---|---|---|---|---|---|---|---|
| hcmut-bach | `#1488DB` | `#032B91` | `#5DA9E9` | `#BF0000` | `#FFFFFF` | `#E9F0FA` | `#111111` |
| stanford-cardinal | `#8C1515` | `#820000` | `#175E54` | `#E98300` | `#FFFFFF` | `#F4F4F4` | `#2E2D29` |
| oxford-navy | `#002147` | `#00152E` | `#776885` | `#E08D79` | `#FFFFFF` | `#F3F1EE` | `#1B1F27` |
| mit-cardinal | `#A31F34` | `#750014` | `#8B959E` | `#D9822B` | `#FFFFFF` | `#F2F2F2` | `#1A1A1A` |
| tum-blue | `#0065BD` | `#005293` | `#98C6EA` | `#E37222` | `#FFFFFF` | `#F3F2EE` | `#1B1B1B` |
| scholar-ivory | `#7A1F2B` | `#5A1720` | `#B08D57` | `#B08D57` | `#FBF8F1` | `#F1EADB` | `#23201B` |
| ocean-research | `#0F5C7A` | `#0B4359` | `#2A9D8F` | `#E76F51` | `#FFFFFF` | `#EAF4F6` | `#14262B` |
| midnight-lab | `#1E3A8A` | `#93C5FD` | `#34D399` | `#FBBF24` | `#0F172A` | `#1E293B` | `#E2E8F0` |

### 2.3 Kiểm tra độ tương phản (WCAG) — đã tính thật

Mình tính tỉ lệ tương phản bằng công thức WCAG 2.x cho từng cặp màu quan trọng (ngưỡng: chữ thường ≥ 4.5, chữ lớn ≥ 3.0):

| Palette | ink/bg | muted/bg | Chữ trên thanh tiêu đề | Heading | Link | Alert |
|---|---|---|---|---|---|---|
| hcmut-bach | 18.88 | 9.74 | **3.77** (chữ lớn 26px đậm → đạt 3.0) | 11.94 | 6.31 | 6.53 |
| stanford-cardinal | 13.78 | 7.38 | 9.40 | 10.77 | 5.47 | 7.26 |
| oxford-navy | 16.51 | 8.21 | 16.05 | 18.31 | 6.43 | 6.12 |
| mit-cardinal | 17.40 | 8.25 | 7.49 | 11.89 | 7.49 | 5.02 |
| tum-blue | 17.22 | 8.86 | 5.84 | 7.99 | 5.84 | 4.94 |
| scholar-ivory | 15.30 | 6.96 | 9.62 | 12.55 | 9.62 | 5.60 |
| ocean-research | 15.65 | 7.65 | 7.41 | 10.71 | 7.41 | 5.18 |
| midnight-lab | 14.48 | 8.68 | 10.36 | 9.90 | 8.65 | 9.41 |

**Quy tắc bắt buộc rút ra từ phép tính:** các màu `accent` của Stanford (Poppy, 2.72:1 trên trắng), Oxford (Peach, 2.54:1), TUM (orange, 3.14:1), Ocean (coral, 3.09:1) và Ivory (gold, 2.91:1) **không được dùng làm màu chữ nhỏ trên nền sáng**. Chúng chỉ dành cho nền, đường kẻ, icon, mảng biểu đồ. Chữ nhấn dùng token `alert`. Quy tắc này phải được ghi trong CSS sinh ra **và** được kiểm bằng unit test (xem 2.10).

### 2.4 Kiến trúc — tách 3 lớp

```
shared/palettes.ts          ← DỮ LIỆU: kiểu SlidePalette + BUNDLED_PALETTES (dùng chung main & renderer)
shared/contrast.ts          ← TOÁN: hex→luminance→ratio, lint palette, normalizeHex (chấp nhận #abc/#aabbcc)
electron/services/paletteService.ts   ← GHI FILE: sinh CSS, chèn/thay/gỡ khối trong dự án, đọc palette đang áp
electron/ipc/palette.ipc.ts           ← IPC: palette:list / apply / remove / getApplied / saveUser / deleteUser / importFile / exportFile
src/components/PalettePicker.tsx      ← UI: popover ở toolbar workspace + mini-slide preview
src/components/PaletteEditor.tsx      ← UI: tạo/sửa palette của tôi (M18.8)
```

**Kiểu dữ liệu (rút gọn):**

```ts
export interface PaletteTokens {
  primary: string; primaryDark: string; onPrimary: string
  secondary: string; accent: string; alert: string
  bg: string; surface: string; ink: string; muted: string
  border: string; link: string; codeBg: string
  chart: [string, string, string, string, string]
}
export interface SlidePalette {
  id: string; name: string; group: 'university' | 'original' | 'user'
  mode: 'light' | 'dark'
  origin?: string                                // "Stanford University"
  verified: 'official' | 'project' | 'memory' | 'original'
  tokens: PaletteTokens
  fonts?: { sans?: string; serif?: string; mono?: string }   // gợi ý, không ép
}
```

**Biến CSS chuẩn sinh ra (tiền tố `--sp-`, "slide palette"):** `--sp-primary`, `--sp-primary-dark`, `--sp-on-primary`, `--sp-secondary`, `--sp-accent`, `--sp-alert`, `--sp-bg`, `--sp-surface`, `--sp-ink`, `--sp-muted`, `--sp-border`, `--sp-link`, `--sp-code-bg`, `--sp-chart-1…5`.

### 2.5 Cơ chế áp palette vào dự án

Cơ sở (đã đối chiếu tài liệu Slidev): Slidev tự nạp `./style.css` **hoặc** `./styles/index.{css,js,ts}` ở gốc dự án; và CSS toàn cục ở đó **cũng ảnh hưởng giao diện Presenter**, nên phải bọc selector trong `.slidev-layout` (biến CSS ở `:root` thì an toàn). Header slide còn hỗ trợ `themeConfig.primary`.

**Thuật toán `applyPalette(projectPath, paletteId)`:**

1. `assertRegisteredProjectRoot(projectPath)` (đã có trong `pathGuard.ts`). Từ chối nếu không phải dự án đã đăng ký.
2. Xác định **file đích** (đúng thứ tự):
   a. Nếu có `styles/index.css` → dùng nó.
   b. Nếu có `styles/index.ts|js` → ghi `styles/palette.generated.css` và thêm một dòng `import './palette.generated.css'` nằm **trong khối đánh dấu** của file `index.ts|js`.
   c. Nếu có `style.css` → dùng nó.
   d. Không có gì → tạo `style.css`.
   *(Nếu tồn tại cả `style.css` và `styles/index.*`, ưu tiên `styles/index.*` và ghi cảnh báo vào log — tránh ghi nhầm file mà Slidev không nạp.)*
3. Sinh CSS và bọc trong **khối đánh dấu** để gỡ/thay an toàn, không đụng nội dung của bạn:

```css
/* >>> slidev-studio:palette id=stanford-cardinal v=1 — do not edit inside this block >>> */
:root:root {
  --sp-primary: #8C1515;
  /* … các biến --sp-* … */
}
/* (lớp tương thích theo template — xem 2.6) */
/* <<< slidev-studio:palette <<< */
```

   Dùng `:root:root` (tăng độ đặc hiệu) để chắc chắn thắng khai báo `:root` của theme dù thứ tự nạp CSS thế nào.
4. Ghi bằng `atomicWriteFile` (đã có). Giữ nguyên kiểu xuống dòng (CRLF/LF) của file.
5. Với template `default`: đặt thêm `themeConfig.primary` trong frontmatter bằng `yaml.parseDocument` (giữ nguyên comment) — **không** regex trên frontmatter.
6. Không cần restart server: đổi CSS được Vite HMR nạp lại; đổi frontmatter Slidev tự reload.
7. `getAppliedPalette(projectPath)` đọc `id=` từ dòng đánh dấu → UI biết palette nào đang áp (không cần file trạng thái riêng, không thể lệch).
8. `removePalette(projectPath)` xoá đúng khối đánh dấu (và dòng import ở 2b), nếu file rỗng sau khi xoá và do Studio tạo → xoá file.

**Tính chất phải đảm bảo (có test):** idempotent (áp 2 lần = 1 lần), áp A rồi B thì chỉ còn B, nội dung ngoài khối không đổi 1 byte, file không tồn tại/rỗng/CRLF đều xử lý được.

### 2.6 Bảng hỗ trợ theo template (nói thật những gì đảm bảo được)

| Template | Mức hỗ trợ | Cơ chế | Ghi chú |
|---|---|---|---|
| `hcmut-bach` | **Đầy đủ — palette sáng** | Lớp tương thích ánh xạ: `--hb-light→--sp-primary`, `--hb-dark→--sp-primary-dark`, `--hb-ink→--sp-ink`, `--hb-tint→--sp-surface`, `--hb-alert→--sp-alert`, `--slidev-theme-primary→--sp-primary` | Cần vá theme: `HbFrame.vue:196` (`background:#fff`) và bảng `index.css` (`background:#fff`, viền `#222`) đổi sang `var(--sp-bg,#fff)` / `var(--sp-border,#222)` để `scholar-ivory` không bị viền trắng. **Không hỗ trợ palette tối** (bảng/ảnh nền trắng cố định). |
| `academic-base` (**theme mới, M18.6**) | **Đầy đủ — sáng & tối** | Viết sẵn theo biến `--sp-*` | Đây là "sân nhà" của palette: 16:9, mọi layout dùng token. |
| `default` (`@slidev/theme-default`) | Một phần | `themeConfig.primary` + `--slidev-theme-primary` + heading/link trong `.slidev-layout` | Chưa kiểm được các biến nội bộ của theme (không có mạng). |
| seriph, apple-basic, bricks, shibainu, frankfurt, penguin, dracula | **Thử nghiệm** | Chỉ đổi màu nhấn (`--slidev-theme-primary`) | UI hiện nhãn **"Thử nghiệm"** và tắt các palette tối cho theme sáng. Prompt P3 có bước **quét biến CSS của từng theme sau `npm install`** để tự lập bảng ánh xạ thật thay vì đoán. |
| Template import (M19) | Theo manifest | `palette.mode: "native" \| "vars-map" \| "none"` | Mặc định `none` nếu manifest không khai báo. |

### 2.7 UI chọn palette

**Vị trí:** nút mới `Palette` ngay cạnh nút "Xuất Slide" (`ProjectWorkspace.tsx` khoảng dòng 598–606), mở popover 420px.

**Bố cục popover:**

1. Đầu: tên theme slide hiện tại + badge mức hỗ trợ ("Đầy đủ / Một phần / Thử nghiệm").
2. Lưới thẻ palette 2 cột. Mỗi thẻ có **mini-slide** vẽ bằng SVG từ token (thanh tiêu đề `primary`, dòng heading `primaryDark`, 3 gạch chữ `ink`, 1 khối `surface`, footer, 5 chấm `chart`) — không cần chạy Slidev nên hiện tức thì. Dưới thẻ: tên, `Sáng/Tối`, nhãn nguồn (✅ Official / ⚠️ chưa đối chiếu / 🎨 Original).
3. **Xem thử trực tiếp:** rê chuột/nhấn vào thẻ → chèn CSS vào `<webview>` bằng `webview.insertCSS()` (lưu `key`, gỡ bằng `removeInsertedCSS(key)` khi rời/Huỷ). Nhấn **Áp dụng** mới ghi file. Nếu server chưa chạy thì thẻ chỉ hiện mini-slide và nút Áp dụng vẫn hoạt động.
4. Chân popover: `Hoàn tác về mặc định` (gọi `removePalette`), `Tạo palette của tôi…`, `Nhập palette…`.
5. Mở rộng "Báo cáo tương phản" cho palette đang chọn (bảng như 2.3, dòng vi phạm tô đỏ).

**Các điểm tích hợp khác:**

- **Wizard bước 2:** dưới lưới template thêm hàng "Bảng màu" (chỉ hiện khi template hỗ trợ palette); `scaffold:create` nhận thêm `paletteId?`. Chọn `hcmut-bach` mặc định palette `hcmut-bach`.
- **Settings › Dự án & Template:** thêm "Palette mặc định cho dự án mới" (`projects.defaultPaletteId`, thêm vào `shared/settings.ts` + `DEFAULT_SETTINGS` + migrate `settingsVersion`).
- **Trạng thái:** thẻ dự án ở Home hiện chấm màu `primary` của palette đang áp.

### 2.8 Palette của tôi: tạo, nhập, xuất, trích màu từ logo

- **Editor:** 8 ô chọn màu cốt lõi (`primary, primaryDark, secondary, accent, bg, surface, ink, link`); các token còn lại (`onPrimary, alert, muted, border, codeBg, chart`) **tự suy ra** rồi cho sửa tay. Có mini-slide cập nhật theo thời gian thực và **lint tương phản** — vi phạm hiện cảnh báo vàng kèm gợi ý "làm đậm `link` thêm X%" (không chặn lưu).
- **Lưu:** `~/.slidev-studio/palettes/<id>.json` (schema có `schemaVersion: 1`). ID người dùng luôn có tiền tố `user:`.
- **Nhập/xuất:** file `.json` (nhập qua hộp thoại + kéo-thả). Nhập phải **validate schema chặt**: 6 hoặc 3 chữ số hex (chuẩn hoá qua `normalizeHex`), từ chối chuỗi lạ, tối đa 64KB, ID sạch `^[a-z0-9:_-]{1,64}$` để không thoát khỏi thư mục palettes.
- **Trích màu từ logo (tuỳ chọn, giá trị cao):** chọn ảnh logo → vẽ lên canvas 128px → lượng tử hoá (median-cut, bỏ pixel trong suốt/gần trắng/gần đen) → đề xuất `primary`/`secondary`/`accent`. Đây chính là cách mình đã kiểm `bk_logo.png` ở mục 2.1, nên bạn có thể tạo palette cho **bất kỳ trường/lab nào** trong 10 giây mà không cần biết mã hex.

### 2.9 (Tuỳ chọn) Đồng bộ màu giao diện app theo palette

Hàm `paletteToAppTheme(p)` sinh một `Theme` (kiểu ở `src/themes/types.ts`): `kind=p.mode`, `bg=p.bg`, `surface=p.surface`, `border=p.border`, `fg=p.ink`, `fgMuted=p.muted`, `accent=p.primary`, `chromeBg=p.primaryDark`, `chromeFg=p.onPrimary`, `monacoBase = mode==='dark' ? 'vs-dark' : 'vs'`. Hiện thêm nhóm "Theo trường" trong bộ chọn app theme (Settings › Giao diện).
**Tiền đề bắt buộc: sửa F1 và F2** (mục 4) — nếu không, theme mới sẽ bị nháy trắng khi mở cửa sổ và `buildScale` sinh `NaN` với mã hex 3 chữ số.

### 2.10 Kiểm thử & tiêu chí nghiệm thu M18

- Unit test: **mọi** palette trong `BUNDLED_PALETTES` phải qua lint (ink/bg ≥ 4.5, muted/bg ≥ 4.5, link/bg ≥ 4.5, alert/bg ≥ 4.5, heading ≥ 4.5, onPrimary/primary ≥ 3.0 với ghi chú); không token nào là hex sai; mọi `id` duy nhất.
- Unit test `paletteService`: idempotent; A→B; giữ nguyên nội dung ngoài khối; CRLF; 4 nhánh chọn file đích ở 2.5; `removePalette` sạch; chặn đường dẫn ngoài dự án.
- Thủ công: tạo dự án `hcmut-bach` → áp Stanford → thanh tiêu đề chuyển đỏ Cardinal **không restart server**; xuất PDF giữ đúng màu; áp `Oxford` rồi `Hoàn tác` trả về màu gốc.
- Kiểm bằng DevTools của webview: `getComputedStyle(document.documentElement).getPropertyValue('--hb-light')` trả về đúng `--sp-primary` của palette đang áp.
- Nghiệm thu: ≥ 5 palette áp được lên `hcmut-bach` và `academic-base`; nhãn nguồn hiển thị đúng; chế độ tối chỉ khả dụng với template hỗ trợ.

### 2.11 M18.6 — Theme mới `academic-base` (16:9, token-first)

Vì `hcmut-bach` là 4:3 kiểu Beamer, và 7 theme npm không kiểm soát được, cần **một theme first-party** để palette phát huy hết:

- Vị trí: `electron/templates/academic-base/` (kiểu "ejected theme": `slides.md` dùng `theme: ./theme`, giống cách `hcmut-bach` đang làm).
- Layout tối thiểu: `cover`, `section`, `default`, `two-cols`, `figure` (ảnh + chú thích + nguồn), `quote`, `references`, `end`; component `Block` (định lý/nhận xét/cảnh báo theo `--sp-*`), `Figure`, `ReferenceItem` (lấy từ `hcmut-bach`).
- Màu **chỉ** qua `--sp-*`; không có hex cứng trong layout/component. Có test tĩnh (regex quét `theme/**/*.{vue,css}` — cấm hex ngoài file `tokens.css` mặc định).
- Phông: Source Sans 3 + JetBrains Mono (đã có woff2 trong `hcmut-bach`, `provider: none` để chạy offline); tuỳ chọn thêm Source Serif 4 cho `scholar-ivory`/`oxford-navy`.
- Hỗ trợ `colorSchema: both` để palette tối hoạt động; đặt `aspectRatio: 16/9`, `canvasWidth: 980`.
- Mermaid theo palette: thêm `setup/mermaid.ts` (`defineMermaidSetup`) đọc `--sp-*` để sơ đồ đổi màu cùng slide.

---
## 3. M19 — Template Import & Template Library

### 3.1 Khái niệm

Có **hai loại template**:

| Loại | Là gì | Ví dụ |
|---|---|---|
| `project` | Một thư mục dự án Slidev hoàn chỉnh (có `slides.md`, có thể kèm theme cục bộ `theme/`, `components/`, `public/`…) | `hcmut-bach`, template lab của bạn, zip bạn bè gửi |
| `npm-theme` | "Template ảo": chỉ là **tên theme npm** + phiên bản đã ghim; app tự sinh `slides.md` mẫu từ template `default` | `slidev-theme-geist`, `slidev-theme-frankfurt` |

Ô "Theme tuỳ chỉnh (nâng cao)" hiện có ở Wizard sẽ được **gộp** vào loại `npm-theme` (cùng một hộp thoại import).

### 3.2 Nơi lưu & sổ đăng ký

- **Template có sẵn:** `electron/templates/*` (chỉ đọc khi đóng gói — nằm trong `extraResources`).
- **Template của người dùng:** `~/.slidev-studio/templates/<id>/` (**bản sao** thư mục, không symlink). Thư mục này nằm cạnh `projects.json`, đã nằm trong `assertInsideAllowedRoot(… 'read')` (thư mục cấu hình được phép đọc).
- **Sổ đăng ký** không lưu thành file riêng để khỏi lệch: `TemplateRegistry.list()` **quét** cả hai thư mục và đọc `template.json`. Chỉ metadata phụ (`importedAt`, `source`, `contentHash`, `trusted`) lưu trong `~/.slidev-studio/templates.json`.
- Staging khi import: `~/.slidev-studio/tmp/import-<uuid>/` — dọn sạch khi thành công/huỷ/lỗi và khi app khởi động (xoá thư mục `tmp` cũ > 1 ngày).

### 3.3 Manifest `template.json`

```jsonc
{
  "schemaVersion": 1,
  "id": "lab-meeting",                 // ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$
  "name": "Lab Meeting (16:9)",
  "description": "Báo cáo tuần của lab",
  "version": "1.0.0",
  "author": "Tên bạn",
  "kind": "project",                   // "project" | "npm-theme"
  "theme": "./theme",                  // "./theme" hoặc tên npm
  "themeRange": "^1.2.0",              // chỉ cho npm-theme / theme npm
  "aspectRatio": "16/9",
  "entry": "slides.md",
  "placeholders": [                    // trường mở rộng cho Wizard bước 3
    { "key": "INSTITUTE", "label": "Đơn vị", "default": "" },
    { "key": "ADVISOR",   "label": "Giảng viên hướng dẫn", "default": "" }
  ],
  "textFiles": ["slides.md", "package.json", "README.md"],   // file được thay placeholder
  "exclude": ["README.md", "starter/**", "scripts/**"],      // không copy vào dự án mới
  "preview": "preview.png",
  "palette": { "mode": "vars-map" },   // "native" | "vars-map" | "none"
  "install": { "scripts": "ask" },     // "ignore" | "ask" (bundled đáng tin mới được "run")
  "tags": ["academic", "16:9"]
}
```

**Không có manifest?** Vẫn import được: app tự suy ra (tên = tên thư mục; tìm `slides.md` ở gốc hoặc trong **một** thư mục con duy nhất; đọc `theme:` bằng `readTheme()` đã có ở `themeResolver.ts`; đọc `package.json`), rồi **sinh manifest** trong màn hình review để bạn xác nhận. Hai file bắt buộc: một entry `.md` có frontmatter hợp lệ; nếu `theme:` là đường dẫn cục bộ thì thư mục đó phải tồn tại.

`hcmut-bach` cũng sẽ có `template.json` — bộ lọc riêng ở `scaffolder.ts:188` biến thành `exclude` trong manifest (xem F5).

### 3.4 Sáu cách đưa template vào

| # | Nguồn | Luồng | Lưu ý |
|---|---|---|---|
| 1 | **Thư mục** | Chọn thư mục → phân tích → review → nhập | Không bao giờ chạy `npm`/`slidev` trong khi phân tích |
| 2 | **File `.zip`** | Chọn/kéo-thả zip → giải nén vào staging → như trên | Bộ lọc zip-slip, symlink, bom nén (3.5) |
| 3 | **Git URL** | Dán URL → `git clone --depth 1` vào staging → xoá `.git` → như trên | Dùng lại `validateGitUrl` (`electron/utils/gitUrl.ts`); tắt submodule; timeout 120s; chặn `file://` |
| 4 | **Theme npm** | Gõ tên → `themePackageName()` chuẩn hoá → `npm view <pkg> version engines.slidev --json` → hiện phiên bản + tương thích với `defaultCliRange` (`isEngineCompatible()` đã có) → tạo template `npm-theme` với phiên bản **ghim** `^x.y.z` | Thay cho `'latest'` (F4). Hết mạng → cho lưu với cảnh báo "chưa kiểm tương thích" |
| 5 | **Kéo-thả** | Thả thư mục/zip lên **bất kỳ đâu** trong Wizard hoặc trang Thư viện | Overlay "Thả để nhập template" |
| 6 | **Lưu dự án hiện tại thành template** | Workspace → menu `…` → "Lưu thành template" | Xem 3.9 |

### 3.5 Kiểm tra an toàn — bắt buộc trước khi cho dùng

Template import là **mã của người khác chạy trên máy bạn** (Slidev nạp `vite.config.*`, `setup/*.ts`, component `.vue`, script `postinstall`). Vì vậy:

| Mã | Kiểm tra | Hành động |
|---|---|---|
| S1 | **Zip-slip:** mỗi entry phải resolve nằm trong staging (`path.relative` không bắt đầu bằng `..`, không tuyệt đối, không chứa `\0`) | Từ chối **cả file** (không bỏ qua từng entry) |
| S2 | **Symlink/hardlink** trong zip hoặc thư mục | Từ chối/bỏ qua và ghi vào báo cáo review |
| S3 | **Giới hạn kích thước:** zip ≤ 50 MB; giải nén ≤ 200 MB; ≤ 5 000 file; 1 file ≤ 50 MB; tỉ lệ nén > 100:1 coi là zip-bomb | Kiểm **trước khi** giải nén (đọc kích thước gốc trong central directory) |
| S4 | Bỏ `node_modules`, `.git`, `__MACOSX`, `.DS_Store`, `.slidev`, `dist`, `export` | Im lặng bỏ qua |
| S5 | **Script cài đặt:** quét `package.json` tìm `preinstall/install/postinstall/prepare` và `overrides` | Hiện nguyên văn trong màn review |
| S6 | **Mã chạy khi mở:** liệt kê `vite.config.*`, `uno.config.*`, `setup/**`, `index.html` có `<script>`, `.vue` có `<script>` | Hiện banner "Template này chứa mã sẽ chạy trên máy bạn" |
| S7 | ID/tên: regex như tên dự án; trùng ID → hỏi **Đổi tên / Ghi đè / Huỷ** (ghi đè phải xác nhận, bản cũ chuyển vào Thùng rác qua `shell.trashItem`) | Không bao giờ ghi đè im lặng |
| S8 | Đường dẫn `theme:` trong `slides.md` phải nằm **trong** template (không `../`) | Từ chối nếu thoát ra ngoài |
| S9 | Không thực thi bất cứ thứ gì lúc phân tích | Chỉ đọc file |

**Chính sách cài đặt cho template người dùng:** dự án tạo từ template import được đăng ký với `trusted: false` và `npm install` chạy với `--ignore-scripts`, **trừ khi** bạn tick "Tôi tin template này" ở màn review (lưu `trusted: true` kèm `contentHash` của `package.json` + thư mục script; đổi hash → hỏi lại). Sau khi cài, nếu template cần `postinstall` (như `patch-package` của `hcmut-bach`), hiện nút **"Chạy postinstall"** sau khi bạn đã xem nội dung. Template có sẵn (`hcmut-bach`…) đánh dấu `trustedBundled` để giữ hành vi hiện tại.

### 3.6 Nâng cấp hệ placeholder

Hiện `templateRender.ts:7` chỉ nhận `TITLE|AUTHOR|DATE`. Nâng lên:

- Built-in: `TITLE, AUTHOR, DATE, SLUG, INSTITUTE, ADVISOR`; cộng các khoá khai báo trong `manifest.placeholders`.
- **Chỉ thay các khoá đã khai báo** (dạng `{{KEY}}` viết hoa liền, không khoảng trắng). Điều này bảo vệ mustache của Vue (`{{ count }}`) trong slide không bị đụng.
- Giữ nguyên quy tắc hiện có: trong frontmatter → chuỗi JSON (`yamlString`), trong thân → `escapeVueText`. Thêm test cho khoá mới, ký tự `<`, `{{`, dấu nháy, tiếng Việt có dấu, xuống dòng CRLF.
- `{{SLUG}}` áp dụng cho **mọi** file trong `textFiles`, không chỉ `package.json`.
- Wizard bước 3 tự sinh ô nhập cho từng placeholder tuỳ chỉnh (giá trị mặc định lấy từ `Institution Profile` — M21 — nếu có).

### 3.7 UI

**a) Trang "Thư viện template"** (nút mới ở Home, và liên kết từ Wizard):

- Lưới thẻ: ảnh `preview.png` (nếu không có → ảnh sinh từ palette mặc định), tên, mô tả, chip `16:9`/`4:3`, `Có sẵn`/`Của tôi`, mức hỗ trợ palette, dấu 🔒 "cần tin cậy".
- Bộ lọc chip: `Tất cả · Học thuật · Sáng · Tối · 16:9 · 4:3 · Của tôi`; ô tìm kiếm.
- Thao tác trên template của tôi: **Dùng để tạo dự án**, Sửa thông tin, Nhân bản, Xuất `.zip`, Mở thư mục, Xoá (Thùng rác).

**b) Hộp thoại "Nhập template"** — 4 tab (Thư mục · Zip · Git · Theme npm) + vùng thả file. 3 bước:
1. **Chọn nguồn.**
2. **Phân tích** (thanh tiến trình, không chặn UI).
3. **Xem lại:** tên/ID (sửa được), theme, tỉ lệ khung, số file & dung lượng, danh sách placeholder, cảnh báo S5/S6 (nguyên văn script), checkbox "Tôi tin template này", nút **Nhập**.

**c) Wizard:**
- Bước 2 đổi từ lưới icon sang lưới **thẻ có ảnh preview**, thêm nút `Nhập template…` ở đầu; sau khi nhập xong tự chọn template mới.
- Thay hàm `getTemplateIcon(id)` (`NewProjectWizard.tsx` ~ dòng 97–115, `switch` theo ID cứng) bằng `manifest.icon`/`preview` — template người dùng hiện rơi vào biểu tượng mặc định.
- Ô "Theme tuỳ chỉnh (nâng cao)" chuyển thành nút "Thêm theme npm…" mở tab 4.

**d) Settings › Dự án & Template:** đường dẫn thư mục template, `Mở thư mục`, "Template mặc định", "Dọn cache staging".

### 3.8 Hợp đồng IPC mới

| Kênh | Đầu vào | Trả về | Ghi chú |
|---|---|---|---|
| `templates:list` | — | `TemplateInfo[]` (`source`, `manifest`, `trusted`, `previewDataUrl?`) | Thay `scaffold:listTemplates` (giữ alias 1 phiên bản) |
| `templates:pickSource` | `'folder' \| 'zip'` | đường dẫn hoặc `null` | Mở `dialog` ở main, renderer không tự truyền path tuỳ ý |
| `templates:inspect` | `{ kind, source }` | `InspectReport` (manifest gợi ý, cảnh báo, script, mã chạy, kích thước) | Chỉ đọc; trả `stagingId` |
| `templates:commit` | `{ stagingId, manifestEdits, trust, onConflict }` | `TemplateInfo` | Di chuyển staging → thư mục template (atomic `rename`) |
| `templates:cancel` | `stagingId` | — | Xoá staging |
| `templates:update` | `{ id, patch }` | `TemplateInfo` | Chỉ sửa metadata |
| `templates:remove` | `id` | `boolean` | `trashItem` |
| `templates:exportZip` | `id` | đường dẫn zip | |
| `templates:saveFromProject` | `{ projectId, id, name, description, makePlaceholders }` | `TemplateInfo` | 3.9 |
| `templates:onProgress` | (sự kiện) | `{ stagingId, phase, percent, message }` | |

Mọi handler **validate kiểu và độ dài** đầu vào (theo mẫu `projects:updateProject` đang làm) và dùng `assertInsideAllowedRoot`. `scaffold:create` nhận `templateId` được phân giải qua `TemplateRegistry` thay vì mảng cứng.

### 3.9 "Lưu dự án hiện tại thành template"

1. Nguồn: dự án đã đăng ký (`projectId`), qua `assertRegisteredProjectRoot`.
2. Copy trừ `node_modules, .git, dist, export, .slidev, .output, .temp, *.log, .DS_Store` (dùng lại `IGNORED_NAMES` trong `fs.ipc.ts`, đưa vào `shared` để dùng chung).
3. Tuỳ chọn **"Thay tiêu đề/tác giả/ngày bằng placeholder"**: chỉ đổi giá trị của khoá `title`, `author`, `date` **trong frontmatter** bằng `yaml.parseDocument` (giữ comment) thành `'{{TITLE}}'`… ; hiện **bản xem trước thay đổi** (diff 3 dòng) trước khi lưu. Không đụng thân slide.
4. Sinh `template.json` (đề xuất `id` từ tên dự án), chụp `preview.png` bằng `webview.capturePage()` (thu nhỏ 640px) nếu server đang chạy.
5. Nếu dự án đang áp palette (M18) → ghi `palette.mode` phù hợp.

### 3.10 Kiểm thử & nghiệm thu M19

- Unit test có **zip độc hại dựng sẵn trong test**: entry `../evil`, entry tuyệt đối, symlink, zip-bomb (giả lập kích thước gốc lớn), tên có `\0` → đều bị từ chối và **không có file nào rơi ra ngoài staging**.
- Test `renderTemplate` với khoá mới; test không đụng `{{ count }}`.
- Test `TemplateRegistry`: gộp bundled + user; ID trùng; manifest hỏng không làm sập danh sách (bỏ qua và báo lỗi từng template).
- Test `createProject` bằng thư mục tạm với `autoInstallDeps=false` (F9): tạo từ template bundled, từ template user, kiểm `slides.md`, `package.json`, `trusted`.
- Thủ công: kéo zip lab của bạn vào Wizard → thấy màn review → nhập → tạo dự án → cài `--ignore-scripts` → mở workspace → preview chạy.
- Nghiệm thu: import được cả 4 loại nguồn; template lạ mặc định **không** chạy script; xoá template không xoá dự án đã tạo từ nó.

---

## 4. Các sửa đổi nền tảng cần làm (phát hiện khi đọc code)

| ID | Mức | Nhóm | Vị trí | Mô tả & ảnh hưởng |
|---|---|---|---|---|
| **F8** | **High** | Security | `scaffolder.ts:269–290` (install), `:294` (`addProjectFromFolder(projectPath, true)`); `processManager.ts:157,191` | `createProject` chạy `npm install` **kèm script** rồi đăng ký `trusted=true`. Hiện chỉ template có sẵn nên chấp nhận được; **ngay khi có import (M19) thì thành thực thi mã tuỳ ý**. Ngoài ra grep chỉ thấy cổng trust ở bước **cài**, chưa thấy ở bước **start** dev server (`vite.config.*`/`setup/*` vẫn chạy). Phải sửa **trước** khi mở M19 cho người dùng. |
| F4 | Medium | Logic | `scaffolder.ts:225` | Theme tuỳ chỉnh ghi phiên bản `'latest'`: không tái lập được và có thể kéo về bản không tương thích Slidev CLI `^53`; hàm `isEngineCompatible` đã có nhưng không được dùng lúc tạo. |
| F3 | Medium | Maintainability | `scaffolder.ts:15–19`, `:216–218`; `themeResolver.ts:28` | Danh sách theme `@slidev/theme-*` (`['default','seriph','apple-basic','bricks','shibainu']`) và luật đặc biệt cho `frankfurt/penguin/dracula` bị **lặp ở 3 nơi**. Thêm template mới dễ lệch nhau (ví dụ resolver và scaffolder ra tên gói khác nhau). |
| F1 | Medium | Maintainability | `electron/services/themeColors.ts` ↔ `src/themes/registry.ts` | Màu nền cửa sổ theo app theme được **khai báo lần hai** trong `themeColors.ts`. Thêm theme mới mà quên file này → rơi về `#020617` (tối) → **nháy nền tối khi mở app ở theme sáng**. Cần một nguồn dữ liệu chung trong `shared/`. |
| F5 | Medium | Maintainability | `scaffolder.ts:161` (guard), `:188` (lọc riêng `hcmut-bach`) | Danh sách cứng + `if (templateId === 'hcmut-bach')` chặn mọi template ngoài. Chuyển sang manifest (`exclude`). |
| F6 | Medium | Packaging | `electron-builder.yml` (`extraResources`), `scaffolder.getTemplatesDir` | Template đóng gói nằm trong Resources (chỉ đọc). Template người dùng phải ở `~/.slidev-studio/templates`. |
| F9 | Medium | Testing | `tests/scaffolder.test.ts` | Chỉ test `renderTemplate`; `createProject` (copy, sửa `package.json`, sửa frontmatter, đăng ký) **chưa có test** → refactor M19 rất dễ hồi quy. |
| F2 | Low | Logic | `src/themes/buildScale.ts:5–8` | `rgb()` chỉ đọc mã 6 chữ số; `#abc`, `rgb()` hay chuỗi lỗi → `NaN` được ghi vào CSS variable và cache `localStorage` (`applyTheme.ts`). Bắt buộc sửa trước khi nhập palette/theme từ người dùng. |
| F7 | Low | Logic | `scaffolder.ts:204`, `templateRender.ts:7` | `{{SLUG}}` chỉ thay trong `package.json`; placeholder cố định 3 khoá (xem 3.6). |
| F10 | Low | UX | `NewProjectWizard.tsx` (ô theme tuỳ chỉnh) | Chỉ kiểm bằng regex, không kiểm gói có tồn tại/tương thích → lỗi chỉ lộ ở bước `npm install` sau khi đã tạo thư mục. |
| F11 | Low | UX | `NewProjectWizard.tsx` `getTemplateIcon` | `switch` theo ID cứng; template mới luôn rơi về biểu tượng mặc định, không có ảnh preview. |

---

## 5. Gợi ý bổ sung để hoàn thiện (ngoài 2 yêu cầu)

Sắp theo giá trị/công sức. Mỗi mục đều bám vào thứ đã có trong code để giảm việc.

### M20 — Đổi theme & palette cho dự án **đã tạo** · Ưu tiên cao · Cỡ M

- **Vấn đề:** hiện chọn nhầm theme lúc tạo là phải tạo lại dự án.
- **Thiết kế:** panel "Theme & Màu" trong workspace (gộp với `PalettePicker`): hiện theme hiện tại (`readTheme` + `themePackageName` + `checkThemeInstalled`), danh sách theme khả dụng (bundled + template import + npm), nút **Đổi theme**.
- **Thao tác đổi theme:** (1) **sao lưu** `slides.md` → `.studio-backup/slides.md.<timestamp>`; (2) sửa khoá `theme:` bằng `yaml.parseDocument` (giữ comment/định dạng); (3) thêm/xoá dependency trong `package.json`, ghim phiên bản (không `latest`); (4) chạy cài qua `installQueue` (đã có); (5) restart server. Cảnh báo nếu theme mới không hỗ trợ layout đang dùng (đọc `layout:` từng slide bằng `parseSlideIndex`, đối chiếu tên file trong `theme/layouts`).
- **Dự án nhiều entry** (`entryFiles`, như `slides-academic.md`, `slides-scholarly.md`): hỏi áp cho 1 file hay tất cả.

### M21 — Hồ sơ đơn vị (Institution Profile) · Ưu tiên cao · Cỡ S

- Trong Settings › Dự án & Template thêm: Tên trường/viện, Khoa/Lab, Giảng viên hướng dẫn, Logo (chọn ảnh → lưu vào `~/.slidev-studio/profile/`), dòng footer mặc định. Mở rộng `projects.defaultAuthor` sẵn có thành `projects.profile`.
- Khi tạo dự án: điền sẵn `{{INSTITUTE}}`, `{{ADVISOR}}`, copy logo vào `public/logo.*` và ghi `logo:` vào frontmatter (theme `hcmut-bach` đã đọc `cfg.logo`, `cfg.institute`, `cfg.advisor` trong `layouts/cover.vue`).
- Kết hợp M18: chọn palette "Stanford" thì gợi ý luôn preset hồ sơ tương ứng (tên trường) — chỉ **gợi ý**, không tự ghi.

### M22 — Thư viện snippet học thuật · Ưu tiên cao · Cỡ M

- Menu **Chèn** trong `EditorPane` + gõ `/` để mở: hai cột, hình có chú thích + nguồn, bảng kết quả, công thức KaTeX (khối & inline), định lý/bổ đề/nhận xét (`<Block>`), pseudocode/thuật toán, code có highlight dòng (`{2,4-6}`), slide tài liệu tham khảo, agenda, "Cảm ơn/Q&A".
- Snippet lưu ở `electron/snippets/academic.json` (bundled) + `~/.slidev-studio/snippets/*.json` (của tôi). Chèn đúng vị trí con trỏ, ngăn cách slide bằng `---` **đúng ngữ cảnh** (dùng `parseSlideIndex` để biết đang ở trong khối code/frontmatter hay không — tránh chèn `---` vào giữa code fence, `markdownGuard.ts` đã có logic cân bằng).
- Monaco completion cho khoá frontmatter (`layout`, `class`, `transition`, `clicks`…) và **tên layout của theme hiện hành** (quét `theme/layouts/*.vue` hoặc gói theme trong `node_modules`).

### M23 — Kiểm tra trước khi xuất (Preflight) · Ưu tiên trung bình-cao · Cỡ M

- Nút "Kiểm tra" trong `ExportDialog` (và tự chạy nhẹ khi bấm Xuất): (a) **slide tràn** — port ý tưởng từ `plan/hcmut-bach-legacy/scripts/check-overflow.mjs` và lớp `.has-overflow` mà `HbFrame.vue` đã đánh dấu; (b) ảnh tương đối không tồn tại; (c) URL ngoài (rủi ro khi in/offline); (d) `{{PLACEHOLDER}}` chưa thay; (e) frontmatter YAML lỗi; (f) tương phản của màu tự đặt (dùng `shared/contrast.ts` của M18).
- Kết quả là danh sách bấm được → nhảy tới slide/dòng (đã có cơ chế `EditorPaneHandle.reveal` từ Phase 7). Có nút **Xuất bất chấp**.

### M24 — Sao lưu trước khi sửa + Mốc phiên bản · Ưu tiên trung bình · Cỡ S→M

- **Tối thiểu (làm cùng M18/M20):** mọi thao tác **Studio tự sửa file của bạn** (áp palette, đổi theme, thay placeholder khi lưu template) đều tạo bản sao `.studio-backup/<file>.<timestamp>` (giữ 20 bản gần nhất). Thêm `.studio-backup/` vào `.gitignore` của dự án mới.
- **Mở rộng sau:** "Lưu mốc" (dùng `simple-git` — đã có trong dependencies): commit vào nhánh ẩn; danh sách mốc, xem diff, khôi phục. Tự lưu mốc trước khi đổi theme/palette.

### M25 — Dàn trang: Outline + thumbnail + kéo thả sắp xếp slide · Ưu tiên trung bình · Cỡ L

- Panel Outline dùng `parseSlideIndex` (`src/lib/slideIndex.ts:43`): danh sách slide (số, tiêu đề `#`, layout), nhấp để nhảy cả editor lẫn preview.
- **Kéo thả đổi thứ tự** viết lại các khối giữa các dòng `---` trong **một** thao tác chỉnh sửa Monaco (để Ctrl+Z hoàn tác được cả cụm), chặn khi `checkSlideMarkdown` báo mất cân bằng (frontmatter/code fence chưa đóng). Rủi ro trung bình-cao vì đụng nội dung người dùng → làm **sau** các mục trên, có bản sao lưu M24.

### M26 — Tài liệu tham khảo từ `.bib` · Để sau · Cỡ L

- Nhập `references.bib` → component `<Cite k="key"/>` và slide `<References/>` tự sinh danh sách (chuẩn APA/IEEE chọn được). Chỉ làm nếu bạn thật sự cần trích dẫn nhiều.

### Bảng ưu tiên & độ lớn

| Mã | Nội dung | Ưu tiên | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| P0 | F1+F2+F3 (nền tảng theme) | Bắt buộc | S | — |
| P1–P2 | M18 dữ liệu + service | Cao | M | P0 |
| P3 | `academic-base` + ánh xạ hcmut + quét biến theme npm | Cao | L | P2 |
| P4 | PalettePicker + Wizard + Settings | Cao | M | P2 |
| P5 | Editor palette, nhập/xuất, trích màu logo | Trung bình | M | P4 |
| P6 | F5+F6+F7+F9: TemplateRegistry + manifest + placeholder | Bắt buộc cho M19 | M | P0 |
| P7 | **F8** + pipeline import + bảo mật | Bắt buộc cho M19 | L | P6 |
| P8 | UI import + Thư viện + Lưu thành template | Cao | L | P7 |
| P9 | M20 đổi theme cho dự án có sẵn | Cao | M | P2, P6 |
| P10 | M21 Hồ sơ đơn vị | Cao | S | P6 |
| P11 | M22 Snippet | Cao | M | — |
| P12 | M23 Preflight + M24 sao lưu | Trung bình | M | P2 |

---
## 6. Lộ trình theo pha

| Pha | Nội dung | Kết quả nhìn thấy được | Điều kiện qua pha |
|---|---|---|---|
| **A — Nền tảng** | P0 (F1, F2, F3) | Chưa đổi giao diện; thêm theme app không còn nháy nền; mã hex lỗi không sinh `NaN` | `npm run typecheck && npm test` xanh; test cũ (`themeResolver`, `utilities`…) không đổi |
| **B — Palette** | P1 → P2 → P4 (→ P3, P5) | Nút Palette ở toolbar; áp ≥ 5 bảng màu lên `hcmut-bach` **không restart server**; nhãn nguồn | Mục 2.10 |
| **C — Template nền** | P6 → P7 | Chưa có UI mới; nhưng `createProject` chạy theo `TemplateRegistry`, cài `--ignore-scripts` cho template lạ, có cổng trust | Mục 3.10 (phần unit test) |
| **D — Import UI** | P8 | Thư viện template + hộp thoại Nhập + Lưu thành template | Mục 3.10 (nghiệm thu) |
| **E — Hoàn thiện** | P9 → P10 → P11 → P12 | Đổi theme cho dự án có sẵn, hồ sơ đơn vị, snippet, preflight + sao lưu | Checklist mục 8 |

**Thứ tự khuyến nghị nếu ít thời gian:** A → B(P1,P2,P4) → C → D. Sau đó chọn trong E theo nhu cầu (P9 và P10 đáng làm nhất).

### Quyết định cần bạn chốt (mình không tự quyết thay)

1. **Cổng trust khi *start* server:** chỉ áp cho dự án tạo từ template import (khuyến nghị, ít gây phiền), hay cho **mọi** dự án đang `trusted=false`? Lưu ý: thư mục bạn mở bằng "Mở thư mục có sẵn" hiện mặc định `trusted=false` (`projectStore.ts:403`), nên áp cho tất cả sẽ thêm một hộp thoại mỗi lần mở tới khi bấm "Nhớ". Prompt P7 đang viết theo phương án khuyến nghị.
2. **Hai palette ⚠️ (MIT, TUM):** giữ trong bản phát hành sau khi bạn đối chiếu brand guide, hay ẩn cho tới lúc đó? Mặc định trong P1: hiện với nhãn "chưa đối chiếu".
3. **Thư viện zip:** mình đề xuất `fflate` (thuần JS, không native, dễ đóng gói Electron); phương án khác `yauzl` + `yazl`. Chọn một, đừng thêm cả hai.
4. **HCMUT:** nếu bạn có bộ nhận diện chính thức của trường, cho mình mã hex để thay 2 giá trị đã đo từ logo.

---

## 7. Prompt cho AI sửa / bổ sung

**Cách dùng:** mở phiên AI mới → đính kèm zip dự án hiện tại → dán **một** prompt (theo thứ tự P0 → P12; các prompt có ghi "Phụ thuộc") → yêu cầu AI chạy `npm run typecheck && npm test` và báo kết quả thật → commit → sang prompt tiếp. Không dán nhiều prompt cùng lúc. Trước khi chạy P7, P9, P12 nên `git commit` (các prompt này sửa nhiều file/đụng dữ liệu người dùng).

Mỗi prompt đã tự chứa ngữ cảnh; đường dẫn và số dòng lấy từ bản zip `20260930_095714` — nếu code đã đổi, AI nên tìm theo tên hàm.

---

### Prompt P0 — Nền tảng theme: một nguồn dữ liệu, hex an toàn, catalog theme (F1, F2, F3)

*Không phụ thuộc. Nên làm đầu tiên.*

````text
Bạn là kỹ sư TypeScript/Electron. Dự án: Slidev Studio (Electron + React + TypeScript + Tailwind, electron-vite). Hãy thực hiện 3 thay đổi nhỏ, KHÔNG đổi hành vi người dùng đang thấy.

## Việc 1 — Gộp dữ liệu app theme về `shared/` (F1)
Hiện có hai nơi khai báo màu theme app:
- `src/themes/types.ts` (interface Theme) và `src/themes/registry.ts` (mảng `themes`, hàm `getTheme`).
- `electron/services/themeColors.ts` khai báo LẦN HAI bảng nền cửa sổ:
  const backgroundByTheme: Record<string,string> = {
    'studio-dark':'#020617','academic-overleaf':'#ffffff','github-light':'#ffffff',
    dracula:'#282a36', nord:'#2e3440','catppuccin-mocha':'#1e1e2e' }
  và `getSettingsBackgroundColor(settings, systemDark)` rơi về `backgroundByTheme['studio-dark']` khi id lạ.
Vấn đề: thêm theme mới mà quên file thứ hai thì cửa sổ nháy nền tối.
Yêu cầu:
1. Tạo `shared/themes.ts` chứa interface `Theme`, `ColorScale`, mảng `themes` (giữ NGUYÊN 6 theme và giá trị màu), `getTheme(id)`.
2. `src/themes/types.ts` và `src/themes/registry.ts` chỉ còn `export * from '../../shared/themes'` (giữ đường import cũ hoạt động).
3. `electron/services/themeColors.ts`: bỏ bảng hardcode; lấy `bg` từ `getTheme(effectiveId).bg`. Giữ nguyên chữ ký và logic chọn `effectiveTheme` (followSystem / themeIdLight / themeIdDark / themeId).
4. Đảm bảo `tsconfig.node.json` và `tsconfig.web.json` đều include thư mục `shared/` (settings đã được import từ shared nên có thể đã đúng — kiểm tra, đừng phá).

## Việc 2 — `normalizeHex` và sửa `buildScale` (F2)
`src/themes/buildScale.ts` dòng 5–8:
  function rgb(hex){ const value = hex.replace('#',''); return [0,2,4].map(i => parseInt(value.slice(i,i+2),16)) }
Chỉ đọc mã 6 chữ số; `#abc`, chuỗi rỗng hoặc lỗi cho ra NaN, và `applyTheme.ts` ghi NaN vào CSS variable + cache localStorage `studio-theme-cache`.
Yêu cầu:
1. Tạo `shared/color.ts`: `normalizeHex(input: string): string | null` (nhận `#abc`, `abc`, `#aabbcc`, `AABBCC`; trả về `#rrggbb` chữ thường; không nhận rgb()/tên màu/alpha → null), `hexToRgb`, `rgbToHex`, `mix(a,b,t)`.
2. `buildScale.ts` dùng các hàm trên; đầu vào hex không hợp lệ thì dùng màu dự phòng `#000000` và `console.warn` một lần (không throw, để UI không sập).
3. `applyTheme.ts`: trước khi ghi cache localStorage, bỏ qua (không ghi) nếu bất kỳ giá trị nào chứa `NaN`.
4. Thêm `tests/color.test.ts`: các ca `#abc`→`#aabbcc`, `AABBCC`→`#aabbcc`, `''`→null, `#12345`→null, `rgb(1,2,3)`→null, `mix` tại t=0/0.5/1, và `buildScale` với accent 3 chữ số không sinh NaN.

## Việc 3 — Một catalog theme duy nhất (F3)
Logic "tên theme → tên gói npm" đang lặp 3 nơi:
- `electron/services/scaffolder.ts` dòng 15–19: `getCustomThemePackage` (danh sách ['default','seriph','apple-basic','bricks','shibainu'] → `@slidev/theme-<x>`, còn lại `slidev-theme-<x>`, tên bắt đầu '@' hoặc 'slidev-theme-' giữ nguyên).
- `scaffolder.ts` dòng ~216–218: `templateInfo.theme === 'frankfurt' ? 'slidev-theme-frankfurt' : ['penguin','dracula'].includes(...) ? 'slidev-theme-<x>' : '@slidev/theme-<x>'`.
- `electron/utils/themeResolver.ts` dòng 28: cùng danh sách 5 theme chính thức trong `themePackageName`.
Yêu cầu:
1. Tạo `electron/services/themeCatalog.ts` export `OFFICIAL_SLIDEV_THEMES` (mảng 5 tên trên), `resolveThemePackage(theme: string): { kind:'none'|'path'|'package'; name?: string; path?: string }` (gộp đúng hành vi hiện có của `themePackageName`, gồm cả các regex validate và thông báo lỗi tiếng Việt hiện có).
2. `themeResolver.themePackageName` và `scaffolder.getCustomThemePackage` gọi hàm mới; đoạn 216–218 dùng `resolveThemePackage(templateInfo.theme)` thay vì chuỗi điều kiện. KẾT QUẢ với 9 template hiện có phải giống hệt trước (frankfurt → slidev-theme-frankfurt, penguin/dracula → slidev-theme-*, còn lại @slidev/theme-*).
3. Bổ sung `tests/themeCatalog.test.ts` (bảng đầu vào/đầu ra đủ 9 template + ca lỗi) và giữ `tests/themeResolver.test.ts` chạy xanh KHÔNG sửa test.

## Ràng buộc
- Không đổi `settingsVersion`, không đổi schema `projects.json`, không đổi tên kênh IPC.
- Không thêm dependency.
- Cuối cùng chạy `npm run typecheck && npm test` và dán kết quả thật; nếu có test cũ hỏng, giải thích vì sao thay vì sửa test cho khớp.
````

---

### Prompt P1 — Dữ liệu palette + thư viện tương phản + test

*Phụ thuộc: P0 (dùng `shared/color.ts`).*

````text
Bối cảnh: Slidev Studio (Electron + React + TS, vitest). Ta thêm "Academic Palette Pack": bảng màu cho SLIDE (không phải giao diện app). Bạn chỉ làm phần DỮ LIỆU + TOÁN + TEST, chưa làm UI/IPC.

## Tạo `shared/contrast.ts`
- `relativeLuminance(hex)`, `contrastRatio(a,b)` theo công thức WCAG 2.x (sRGB → tuyến tính: c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4).
- `lintPalette(tokens, mode): LintIssue[]` với `LintIssue = { rule: string; ratio: number; min: number; message: string }`. Quy tắc:
  ink/bg ≥ 4.5; muted/bg ≥ 4.5; link/bg ≥ 4.5; alert/bg ≥ 4.5; primaryDark/bg ≥ 4.5; ink/surface ≥ 4.5; onPrimary/primary ≥ 3.0 (thanh tiêu đề chữ lớn, ghi chú rõ trong message).
- Dùng `normalizeHex` từ `shared/color.ts` (đã có ở P0); token không hợp lệ → issue `rule: 'invalid-hex'`.

## Tạo `shared/palettes.ts`
Kiểu:
  export interface PaletteTokens { primary; primaryDark; onPrimary; secondary; accent; alert; bg; surface; ink; muted; border; link; codeBg: string; chart: [string,string,string,string,string] }
  export interface SlidePalette { id; name; group:'university'|'original'|'user'; mode:'light'|'dark'; origin?: string; verified:'official'|'project'|'memory'|'original'; tokens: PaletteTokens; fonts?: {sans?;serif?;mono?} }
Ghi chú ngữ nghĩa để đưa vào comment: `primaryDark` = màu heading/footer (ở palette tối là sắc NHẠT để đọc được trên nền tối); `accent` chỉ dùng cho nền/đường kẻ/icon/biểu đồ, KHÔNG dùng làm chữ nhỏ trên nền sáng (tương phản thấp); chữ nhấn dùng `alert`.

Dữ liệu `BUNDLED_PALETTES` (chép đúng, mỗi mã đã được tính tương phản):
1. id 'hcmut-bach', name 'HCMUT · Bách Khoa', light, origin 'Trường ĐH Bách Khoa – ĐHQG-HCM', verified 'project':
   primary #1488DB, primaryDark #032B91, onPrimary #FFFFFF, secondary #5DA9E9, accent #BF0000, alert #BF0000, bg #FFFFFF, surface #E9F0FA, ink #111111, muted #444444, border #C5D3E8, link #0B62A8, codeBg #F3F6FB, chart [#1488DB,#032B91,#BF0000,#F59E0B,#059669]
2. 'stanford-cardinal', 'Stanford · Cardinal', light, origin 'Stanford University', verified 'official':
   primary #8C1515, primaryDark #820000, onPrimary #FFFFFF, secondary #175E54, accent #E98300, alert #B1040E, bg #FFFFFF, surface #F4F4F4, ink #2E2D29, muted #53565A, border #D5D5D4, link #006CB8, codeBg #F4F4F4, chart [#8C1515,#175E54,#E98300,#53565A,#006CB8], fonts sans 'Source Sans 3', serif 'Source Serif 4'
3. 'oxford-navy', 'Oxford · Navy & Mauve', light, origin 'University of Oxford', verified 'official':
   primary #002147, primaryDark #00152E, onPrimary #FFFFFF, secondary #776885, accent #E08D79, alert #A8402B, bg #FFFFFF, surface #F3F1EE, ink #1B1F27, muted #4A4F5A, border #C7C2BC, link #2A5EA8, codeBg #F3F1EE, chart [#002147,#776885,#E08D79,#C4A29E,#2A5EA8]
4. 'mit-cardinal', 'MIT · Cardinal & Silver', light, origin 'MIT', verified 'memory':
   primary #A31F34, primaryDark #750014, onPrimary #FFFFFF, secondary #8B959E, accent #D9822B, alert #B45309, bg #FFFFFF, surface #F2F2F2, ink #1A1A1A, muted #4B4F54, border #D0D3D6, link #A31F34, codeBg #F5F5F5, chart [#A31F34,#8B959E,#2F6DB5,#D9822B,#2E7D32]
5. 'tum-blue', 'TUM · Blue & Ivory', light, origin 'Technical University of Munich', verified 'memory':
   primary #0065BD, primaryDark #005293, onPrimary #FFFFFF, secondary #98C6EA, accent #E37222, alert #B5541A, bg #FFFFFF, surface #F3F2EE, ink #1B1B1B, muted #4A4A4A, border #DAD7CB, link #0065BD, codeBg #F3F2EE, chart [#0065BD,#E37222,#A2AD00,#98C6EA,#005293]
6. 'scholar-ivory', 'Scholar Ivory', light, group 'original', verified 'original':
   primary #7A1F2B, primaryDark #5A1720, onPrimary #FBF8F1, secondary #B08D57, accent #B08D57, alert #B23A2E, bg #FBF8F1, surface #F1EADB, ink #23201B, muted #5B554B, border #D9CFB8, link #7A1F2B, codeBg #F1EADB, chart [#7A1F2B,#B08D57,#3E6B5A,#5B554B,#2F5D8A], fonts serif 'Source Serif 4'
7. 'ocean-research', 'Ocean Research', light, original:
   primary #0F5C7A, primaryDark #0B4359, onPrimary #FFFFFF, secondary #2A9D8F, accent #E76F51, alert #C2410C, bg #FFFFFF, surface #EAF4F6, ink #14262B, muted #41575D, border #BFD9DE, link #0F5C7A, codeBg #EEF6F8, chart [#0F5C7A,#2A9D8F,#E76F51,#E9C46A,#264653]
8. 'midnight-lab', 'Midnight Lab', DARK, original:
   primary #1E3A8A, primaryDark #93C5FD, onPrimary #FFFFFF, secondary #34D399, accent #FBBF24, alert #FCA5A5, bg #0F172A, surface #1E293B, ink #E2E8F0, muted #A9B6C8, border #334155, link #7DB8FF, codeBg #111C33, chart [#60A5FA,#34D399,#FBBF24,#F472B6,#A78BFA]
Export thêm `getPalette(id)`, `paletteToCssVars(tokens): Record<string,string>` (khóa `--sp-primary`, `--sp-primary-dark`, `--sp-on-primary`, `--sp-secondary`, `--sp-accent`, `--sp-alert`, `--sp-bg`, `--sp-surface`, `--sp-ink`, `--sp-muted`, `--sp-border`, `--sp-link`, `--sp-code-bg`, `--sp-chart-1`…`--sp-chart-5`), và `paletteToAppTheme(p): Theme` (ánh xạ: kind=p.mode, bg=p.bg, surface=p.surface, border=p.border, fg=p.ink, fgMuted=p.muted, accent=p.primary, chromeBg=p.primaryDark, chromeFg=p.onPrimary, monacoBase = mode==='dark' ? 'vs-dark' : 'vs'; kiểu Theme từ `shared/themes.ts`).

## Test `tests/palettes.test.ts`
- Mọi palette trong BUNDLED_PALETTES: `lintPalette` trả về mảng rỗng.
- id duy nhất, khớp regex ^[a-z0-9:_-]{1,64}$, mọi hex hợp lệ, `chart.length === 5`.
- Palette `mode:'dark'` có `bg` tối hơn `ink` (luminance).
- `paletteToCssVars` có đủ 18 khóa; `paletteToAppTheme` cho ra Theme hợp lệ (mọi trường hex qua normalizeHex).
- Test rằng một palette cố tình sai (ink #999999 trên bg #FFFFFF) bị lint bắt.

## Ràng buộc
- Không đụng UI/IPC/settings ở bước này. Không thêm dependency.
- Chạy `npm run typecheck && npm test`, dán kết quả thật.
````

---

### Prompt P2 — `paletteService`: áp / gỡ / đọc palette trong dự án + IPC

*Phụ thuộc: P1.*

````text
Bối cảnh: Slidev Studio. Có sẵn `shared/palettes.ts` (BUNDLED_PALETTES, paletteToCssVars), `electron/utils/atomicWrite.ts` (atomicWriteFile), `electron/utils/pathGuard.ts` (assertRegisteredProjectRoot), thư viện `yaml` v2. Slidev tự nạp `./style.css` hoặc `./styles/index.{css,js,ts}` ở gốc dự án; CSS toàn cục ở đó CŨNG áp cho giao diện Presenter nên chỉ đặt biến ở :root và bọc selector khác trong `.slidev-layout`.

## Yêu cầu: `electron/services/paletteService.ts`
API:
  applyPalette(projectPath: string, paletteId: string, opts?: { templateKind?: 'hcmut-bach'|'academic-base'|'default'|'other' }): Promise<{ file: string; templateKind: string }>
  removePalette(projectPath: string): Promise<boolean>
  getAppliedPalette(projectPath: string): Promise<{ id: string; file: string } | null>
  renderPaletteCss(palette: SlidePalette, kind): string

Chọn FILE ĐÍCH theo đúng thứ tự:
 a) có `styles/index.css` → dùng nó;
 b) có `styles/index.ts` hoặc `.js` → ghi `styles/palette.generated.css` và chèn một dòng `import './palette.generated.css'` nằm TRONG khối đánh dấu ở file index đó;
 c) có `style.css` → dùng nó;
 d) không có gì → tạo `style.css`.
Nếu tồn tại cả `style.css` và `styles/index.*`, ưu tiên `styles/index.*` và trả kèm `warning` trong kết quả.

Khối đánh dấu (CSS):
  /* >>> slidev-studio:palette id=<id> v=1 — do not edit inside this block >>> */
  :root:root { --sp-…: …; }
  <lớp tương thích theo templateKind>
  /* <<< slidev-studio:palette <<< */
(Với file .ts dùng `// >>> … <<<` cho dòng import.) Dùng `:root:root` để thắng khai báo :root của theme bất kể thứ tự nạp.

Lớp tương thích:
- 'hcmut-bach': `:root:root{ --hb-light:var(--sp-primary); --hb-dark:var(--sp-primary-dark); --hb-ink:var(--sp-ink); --hb-tint:var(--sp-surface); --hb-alert:var(--sp-alert); --slidev-theme-primary:var(--sp-primary); --hb-bg:var(--sp-bg); --hb-border:var(--sp-border); }`
- 'academic-base': không cần lớp thêm (theme đọc --sp-* trực tiếp).
- 'default': `:root:root{ --slidev-theme-primary:var(--sp-primary); }` + `.slidev-layout a{ color:var(--sp-link); }` + `.slidev-layout h1,.slidev-layout h2,.slidev-layout h3{ color:var(--sp-primary-dark); }`; thêm `themeConfig.primary: '<primary>'` vào frontmatter của entry bằng `yaml.parseDocument` (GIỮ comment; TUYỆT ĐỐI không regex frontmatter). Nếu frontmatter lỗi YAML thì bỏ qua bước này và trả warning.
- 'other': chỉ `--slidev-theme-primary`.
Ghi bằng `atomicWriteFile`; giữ nguyên kiểu xuống dòng (CRLF/LF) của file gốc; nếu áp lần đầu vào file đã có nội dung, thêm 1 dòng trống trước khối.
Trước khi ghi đè file có sẵn: tạo bản sao lưu `.studio-backup/<tên file>.<yyyymmdd-hhmmss>` (giữ 20 bản gần nhất; thư mục `.studio-backup` được thêm vào `.gitignore` của dự án nếu file này tồn tại và chưa có dòng đó).
Tính chất bắt buộc: idempotent (áp 2 lần = 1 lần); áp A rồi B chỉ còn B; nội dung NGOÀI khối không đổi 1 byte; `removePalette` xoá đúng khối + dòng import; nếu file do Studio tạo và rỗng sau khi gỡ thì xoá file.
Nhận diện templateKind (khi không truyền): đọc `theme:` trong frontmatter entry bằng `readTheme` (electron/utils/themeResolver.ts): './theme' + có `theme/layouts/cover.vue` chứa 'HbFrame' → 'hcmut-bach'; './theme' + `theme/package.json` name 'slidev-theme-academic-base' → 'academic-base'; 'default'/'@slidev/theme-default' → 'default'; còn lại 'other'.

## IPC: `electron/ipc/palette.ipc.ts` (đăng ký trong main.ts cùng các registerXxxIpc khác) + preload + `src/ipc-client.ts` + `src/env.d.ts`
Kênh: `palette:list` (bundled + user, xem P5), `palette:apply(projectPath, paletteId)`, `palette:remove(projectPath)`, `palette:getApplied(projectPath)`.
- Mọi handler: validate kiểu (string, độ dài ≤ 4096 cho path, paletteId khớp ^[a-z0-9:_-]{1,64}$), gọi `assertRegisteredProjectRoot(projectPath)` TRƯỚC khi đụng file.
- Không cho renderer truyền CSS thô; CSS luôn do main sinh từ palette.

## Test `tests/paletteService.test.ts` (thư mục tạm bằng fs-extra/os.tmpdir)
Các ca: 4 nhánh chọn file đích; idempotent; A→B; bảo toàn nội dung ngoài khối (so sánh chuỗi trước/sau phần ngoài khối); CRLF; file đích rỗng; `removePalette`; frontmatter có comment được giữ khi thêm `themeConfig.primary`; frontmatter YAML hỏng → không throw, có warning; bản sao lưu được tạo và cắt còn 20; palette id không tồn tại → lỗi rõ ràng.
(Không import 'electron' trong service để test được bằng vitest; nếu cần pathGuard thì chỉ dùng ở lớp IPC.)

## Ràng buộc
- Không restart server, không đụng processManager.
- Không đổi hành vi các IPC hiện có. Chạy `npm run typecheck && npm test` và dán kết quả thật.
````

---

### Prompt P3 — Theme `academic-base` (16:9, token-first) + ánh xạ `hcmut-bach` + quét biến của theme npm

*Phụ thuộc: P2. Đây là prompt lớn nhất của nhóm palette; có thể tách thành P3a (hcmut + quét) và P3b (academic-base).*

````text
Bối cảnh: Slidev Studio bundle template trong `electron/templates/<id>/`. Template `hcmut-bach` là "ejected theme" (slides.md dùng `theme: ./theme`) 4:3 kiểu Beamer, biến màu `--hb-light/--hb-dark/--hb-ink/--hb-tint/--hb-alert` khai báo trong `theme/styles/index.css` và một số màu cứng trong `theme/components/HbFrame.vue`. Palette áp bằng khối CSS do paletteService sinh (P2): khai báo `--sp-*` và, với hcmut-bach, ánh xạ thêm `--hb-bg`, `--hb-border`.

## Phần A — Vá `hcmut-bach` để nhận `--hb-bg` / `--hb-border`
1. `theme/styles/index.css`, khối `:root` (khoảng dòng 38–46): thêm mặc định `--hb-bg:#fff; --hb-border:#222;` (giữ giá trị hiện tại làm mặc định để KHÔNG đổi giao diện khi chưa áp palette).
2. `theme/components/HbFrame.vue` dòng ~196 (`background:#fff;`), và trong `index.css`: `.hb table{ background:#fff }` cùng `.hb th,.hb td{ border:1px solid #222 }` → dùng `var(--hb-bg)` và `var(--hb-border)`.
3. `grep -nE '#[0-9a-fA-F]{3,8}' theme/**/*.{css,vue}` và liệt kê các màu cứng còn lại; CHỈ thay những màu mang nghĩa "nền khung / viền bảng"; giữ nguyên màu overflow đỏ `#dc2626` và các trắng dùng cho chữ trên thanh xanh. Giải thích từng chỗ bạn KHÔNG đổi.
4. Palette tối KHÔNG hỗ trợ cho hcmut-bach: thêm `template.json` (xem P6) hoặc, nếu chưa có, hằng `PALETTE_SUPPORT` ghi rõ 'hcmut-bach: light-only'.

## Phần B — Tạo template mới `electron/templates/academic-base/`
Cấu trúc giống hcmut-bach: `package.json` (dependencies @slidev/cli ^53.0.0, vue ^3.5.0; KHÔNG patch-package), `slides.md` (frontmatter dùng `{{TITLE}}`, `{{AUTHOR}}`, `{{DATE}}`, `theme: ./theme`, aspectRatio 16/9, canvasWidth 980, `fonts.provider: none`), `.gitignore`, `theme/`:
- `theme/package.json`: name `slidev-theme-academic-base`, `engines.slidev >=52.0.0`, `slidev.colorSchema: "both"`, defaults aspectRatio 16/9.
- `theme/styles/tokens.css`: `:root{ --sp-primary:#0F5C7A; … }` = palette 'ocean-research' làm MẶC ĐỊNH (chép đúng token từ shared/palettes.ts, comment "được ghi đè bởi khối palette của Studio").
- `theme/styles/index.css`: chỉ dùng `var(--sp-*)`; KHÔNG hex ngoài `tokens.css`. Bọc mọi selector (trừ :root) trong `.slidev-layout` để không rò sang Presenter.
- `theme/layouts/`: cover, section, default, two-cols, figure (ảnh + chú thích + nguồn), quote, references, end. Chiều rộng nội dung, thanh tiêu đề (`--sp-primary` nền, `--sp-on-primary` chữ), footer (`--sp-primary-dark`), khối `surface`, bảng dùng `--sp-border`, code dùng `--sp-code-bg`.
- `theme/components/`: Block (props: type 'theorem'|'lemma'|'remark'|'warning'), Figure, ReferenceItem (tham khảo từ hcmut-bach nhưng viết lại theo token).
- `theme/setup/mermaid.ts` (defineMermaidSetup): đọc giá trị `--sp-*` từ `getComputedStyle(document.documentElement)` lúc chạy để đặt themeVariables (primaryColor, primaryTextColor, lineColor, background…).
- Phông: dùng Source Sans 3 + JetBrains Mono đã có woff2 trong hcmut-bach (copy sang `theme/assets/fonts/` cùng file OFL).
- Đăng ký template: thêm vào mảng template hiện hành trong `electron/services/scaffolder.ts` (id 'academic-base', name 'Academic Base (16:9)', description ngắn, theme './theme'); thêm `case 'academic-base'` trong `getTemplateIcon` ở `src/pages/NewProjectWizard.tsx`.
- Test tĩnh `tests/academicBaseTokens.test.ts`: quét `electron/templates/academic-base/theme/**/*.{vue,css}` — mọi mã hex chỉ được xuất hiện trong `styles/tokens.css`.

## Phần C — Script quét biến CSS của theme npm (để lập bảng hỗ trợ THẬT)
Tạo `scripts/scan-theme-vars.mjs` (chạy tay trên máy có mạng): với từng template bundled dùng theme npm (default, frankfurt, seriph, bricks, apple-basic, shibainu, penguin, dracula) → tạo thư mục tạm, `npm install --ignore-scripts`, tìm gói theme trong node_modules, quét `*.css`/`*.vue` lấy tên custom property (`--[a-z0-9-]+`) và các mã hex xuất hiện nhiều nhất; ghi báo cáo `docs/theme-vars-report.md` (theme → biến màu chính → gợi ý ánh xạ sang --sp-*). Script KHÔNG chạy trong test tự động. Sau khi có báo cáo, cập nhật bảng "lớp tương thích" trong paletteService (nhánh 'other') theo dữ liệu thật thay vì đoán.

## Ràng buộc
- Không đổi giao diện hcmut-bach khi CHƯA áp palette (kiểm bằng cách so sánh ảnh chụp hoặc diff CSS tính toán trước/sau).
- Chạy `npm run typecheck && npm test`; nếu có thể, tạo thử dự án từ academic-base rồi `npx slidev build` và báo kết quả thật.
````

---

### Prompt P4 — UI: `PalettePicker`, xem thử trực tiếp trong webview, tích hợp Wizard & Settings

*Phụ thuộc: P2 (P3 tuỳ chọn để có template hỗ trợ đầy đủ).*

````text
Bối cảnh: Slidev Studio (React + Tailwind, phong cách slate hiện tại). Đã có IPC `palette:list|apply|remove|getApplied` (P2) và `shared/palettes.ts` (P1). Workspace: `src/pages/ProjectWorkspace.tsx` có nút "Xuất Slide" quanh dòng 598–606; `src/components/PreviewPane.tsx` chứa `<webview ref={webviewRef} …>` (dòng ~222) và một imperative handle có `goto(slideNo)` (dòng ~73). `NewProjectWizard.tsx` có bước 2 chọn template. `shared/settings.ts` có nhóm `projects`.

## 1. `src/components/PalettePicker.tsx`
- Nút icon Palette đặt CẠNH nút "Xuất Slide"; mở popover 420px (đóng khi click ngoài/Esc; có focus trap và aria-label).
- Đầu popover: tên theme slide hiện tại (dùng IPC hiện có hoặc `readTheme` qua main) + badge mức hỗ trợ: 'Đầy đủ' (hcmut-bach light, academic-base), 'Một phần' (default), 'Thử nghiệm' (khác). Với template 'Thử nghiệm', ẩn/disable palette `mode:'dark'`.
- Lưới thẻ 2 cột; mỗi thẻ có MINI-SLIDE vẽ bằng SVG từ token (thanh tiêu đề primary + chữ onPrimary, dòng heading primaryDark, 3 gạch ink, khối surface, footer, 5 chấm chart). Dưới thẻ: tên, nhãn Sáng/Tối, nhãn nguồn (✓ Official / ⚠ chưa đối chiếu / Original), dấu ✓ nếu là palette đang áp (từ `palette:getApplied`).
- XEM THỬ TRỰC TIẾP: khi chọn (click) một thẻ và server đang chạy → gọi handle mới của PreviewPane `insertCss(css): Promise<string>` (bọc `webview.insertCSS`, lưu key) và `removeCss(key)`; CSS xem thử là khối `:root:root{--sp-*…}` + lớp tương thích của đúng templateKind (export hàm dùng chung từ paletteService qua IPC `palette:previewCss(paletteId, projectPath)` — main sinh CSS, renderer chỉ chuyển tiếp). Bấm 'Áp dụng' → `palette:apply` rồi `removeCss(key)`; bấm 'Huỷ'/đóng popover/đổi thẻ → `removeCss` khóa cũ. Chỉ gọi webview khi `domReadyRef.current` đã true (đã có mẫu này ở PreviewPane — xem cách `getURL` được bảo vệ).
- Chân popover: 'Hoàn tác về mặc định' (`palette:remove`), 'Tạo palette của tôi…' và 'Nhập palette…' (chỉ hiện nút, xử lý ở P5).
- Mục mở rộng 'Báo cáo tương phản' cho palette đang chọn: bảng ratio từ `lintPalette`/`contrastRatio`, dòng vi phạm tô đỏ.
- Toàn bộ chữ tiếng Việt; dùng cùng class Tailwind như các popover hiện có (ví dụ ô sửa port ở ProjectWorkspace).

## 2. Wizard (`src/pages/NewProjectWizard.tsx`)
- Bước 2: dưới lưới template thêm hàng 'Bảng màu' (hiện khi template thuộc nhóm hỗ trợ: hcmut-bach, academic-base, default). State `paletteId` (mặc định: hcmut-bach→'hcmut-bach', academic-base→'ocean-research', default→'' = không áp).
- `api.scaffold.create({... paletteId })`; ở main (`scaffold.ipc.ts` + `Scaffolder.createProject`) nhận `paletteId?` (validate regex), gọi `paletteService.applyPalette` SAU khi copy template và TRƯỚC khi đăng ký dự án; lỗi áp palette chỉ ghi log cảnh báo, không làm hỏng việc tạo dự án.

## 3. Settings
- Thêm `projects.defaultPaletteId: string` (mặc định '') vào `shared/settings.ts` (interface + DEFAULT_SETTINGS), tăng tương thích: giữ `settingsVersion: 2`, và đảm bảo `deepMerge`/import settings (`electron/utils/settingsImportValidation.ts`) chấp nhận khóa mới và bỏ qua giá trị không thuộc BUNDLED_PALETTES/không phải chuỗi rỗng.
- `SettingsPage.tsx` nhóm 'Dự án & Template': select 'Palette mặc định cho dự án mới'; thêm từ khóa tìm kiếm ('palette màu bảng màu') vào `searchTerms.projects`.
- Wizard đọc `settings.projects.defaultPaletteId` làm giá trị khởi tạo.

## 4. Home
- `ProjectCard.tsx`: chấm tròn 10px màu `primary` của palette đang áp (gọi `palette:getApplied` theo lô, cache theo path; không chặn render).

## Ràng buộc
- Không đụng logic processManager/logs. Không làm nháy/reload webview khi mở popover.
- Popover phải dùng được bằng bàn phím.
- Chạy `npm run typecheck && npm test`; mô tả rõ cách bạn đã tự kiểm thử thủ công (áp Stanford lên dự án hcmut-bach khi server đang chạy, xác nhận thanh tiêu đề đổi màu KHÔNG restart).
````

---

### Prompt P5 — Palette của tôi: editor, nhập/xuất `.json`, trích màu từ logo

*Phụ thuộc: P4.*

````text
Bối cảnh: Slidev Studio. Đã có `PalettePicker` (P4), `shared/palettes.ts`, `shared/contrast.ts`, `shared/color.ts`. Thêm khả năng tạo palette riêng.

## Lưu trữ (main)
- Thư mục `~/.slidev-studio/palettes/` (dùng `projectStore.getConfigDir()`), mỗi file `<id>.json` = `{ schemaVersion: 1, palette: SlidePalette }`; id luôn có tiền tố `user:` và khớp ^user:[a-z0-9_-]{1,56}$ (tên file thay ':' bằng '__' để hợp lệ trên Windows).
- IPC mới: `palette:saveUser(palette)`, `palette:deleteUser(id)`, `palette:importFile()` (mở dialog ở main, đọc .json ≤ 64KB), `palette:exportFile(id)` (save dialog). `palette:list` trả bundled + user.
- VALIDATE chặt khi lưu/nhập: schemaVersion === 1; chuỗi tên ≤ 60 ký tự (loại ký tự điều khiển); mọi token qua `normalizeHex` (lưu dạng chuẩn hoá) — sai một token → từ chối cả file với thông báo chỉ đúng token; `mode` ∈ {light,dark}; `verified` luôn ép về 'original' cho palette người dùng (không cho tự nhận 'official'); bỏ trường lạ; chặn đường dẫn (id không được chứa '/', '\\', '..'). Không dùng eval/require trên nội dung file.

## `src/components/PaletteEditor.tsx` (modal)
- 8 ô chọn màu cốt lõi: primary, primaryDark, secondary, accent, bg, surface, ink, link (input type=color + ô hex nhập tay, chuẩn hoá khi blur).
- Các token còn lại tự suy ra bằng hàm `deriveTokens(core, mode)` trong `shared/palettes.ts`: onPrimary = trắng hoặc đen tuỳ tương phản cao hơn với primary; alert = accent được làm đậm tới khi alert/bg ≥ 4.5; muted = mix(ink,bg,0.35) rồi chỉnh tới ≥ 4.5; border = mix(surface,ink,0.15); codeBg = surface; chart = [primary, secondary, accent, muted, link]. Cho sửa tay từng token suy ra (nút 'Đặt lại token này').
- Xem trước: mini-slide lớn (cùng component SVG với thẻ ở PalettePicker) cập nhật realtime.
- Lint tương phản realtime: vi phạm hiện cảnh báo vàng kèm gợi ý cụ thể ('link cần đậm hơn ~X% để đạt 4.5:1') — KHÔNG chặn lưu.
- Nút 'Lưu', 'Lưu & áp dụng cho dự án này', 'Nhân bản từ palette có sẵn' (chọn một palette làm điểm xuất phát), 'Xuất .json', 'Xoá'.

## Trích màu từ logo (chạy ở renderer, không gửi ảnh đi đâu)
- Nút 'Lấy màu từ logo…': chọn ảnh png/jpg/svg/webp (dialog qua main trả về data URL ≤ 5MB, kiểm MIME bằng magic bytes, không tin đuôi file) → vẽ lên canvas tối đa 128×128 → bỏ pixel alpha<200, gần trắng (mọi kênh>235), gần đen (mọi kênh<25) → lượng tử hoá median-cut lấy 5 cụm → sắp theo số pixel → đề xuất primary = cụm lớn nhất; primaryDark = cụm tối nhất cùng tông (hoặc làm tối primary 35%); secondary = cụm lớn thứ hai khác tông; accent = cụm còn lại có độ bão hoà cao nhất. Hiện 5 swatch cho người dùng bấm gán vào token nào tuỳ ý.
- Tách thuật toán thành hàm thuần `extractPalette(pixels: Uint8ClampedArray): string[]` trong `src/lib/colorExtract.ts` + test vitest với ảnh nhân tạo (ví dụ mảng pixel chỉ có 2 màu #1088D8 và #002890 → trả về đúng hai màu gần đó).

## Nhập/xuất
- 'Nhập palette…' ở PalettePicker (và kéo-thả file .json lên popover): gọi `palette:importFile`, hiện màn xem trước (mini-slide + kết quả lint) trước khi lưu; trùng id → hỏi 'Ghi đè / Nhân bản / Huỷ'.

## Test
`tests/paletteUser.test.ts`: validate chấp nhận file đúng; từ chối hex sai, `verified:'official'` bị ép về 'original', id chứa '..', file > 64KB, schemaVersion sai; `deriveTokens` luôn cho lint sạch với 20 bộ (core) ngẫu nhiên cố định seed.

## Ràng buộc
- Không thêm dependency (tự viết median-cut ~60 dòng). Chạy `npm run typecheck && npm test` và dán kết quả thật.
````

---
### Prompt P6 — `TemplateRegistry` + manifest + placeholder mở rộng + test `createProject` (F5, F6, F7, F9)

*Phụ thuộc: P0. Chưa thêm UI, chưa import.*

````text
Bối cảnh: Slidev Studio (Electron main viết bằng TypeScript). File `electron/services/scaffolder.ts` hiện:
- dòng 30: `export const BUNDLED_TEMPLATES: TemplateInfo[] = [ ...9 template cứng... ]` (interface TemplateInfo = { id, name, description, theme, themeRange? }).
- dòng 161: `if (!BUNDLED_TEMPLATES.some((template) => template.id === templateId)) { throw new Error('Mẫu dự án không hợp lệ') }`.
- dòng 188 trong bộ lọc `fs.copy`: `if (templateId === 'hcmut-bach' && /^(?:starter|scripts)(?:\/|$)|^(?:example\.md|README\.md)$|^theme\/(?:README|CHANGELOG)\.md$/i.test(relative)) return false`.
- dòng ~204: `pkgContent.replace(/\{\{SLUG\}\}/g, slug)` chỉ trong package.json.
- `getTemplatesDir()` (dòng 96) tìm template ở process.resourcesPath/templates → electron/templates.
`electron/services/templateRender.ts` dòng 7: `const PLACEHOLDERS = /\{\{(TITLE|AUTHOR|DATE)\}\}/g` và `renderTemplate(content, values: TemplateValues)`; frontmatter dùng `yamlString` (JSON.stringify), thân dùng `escapeVueText`.
`tests/scaffolder.test.ts` chỉ test `renderTemplate`.

## Mục tiêu
Thay mảng cứng bằng registry đọc manifest, để P7 thêm được template người dùng — nhưng với 9 template hiện có, dự án tạo ra phải GIỐNG HỆT trước (so sánh cây thư mục + nội dung slides.md/package.json trong test).

## 1. `electron/services/templateRegistry.ts`
- Kiểu `TemplateManifest` (schemaVersion 1): id, name, description, version?, author?, kind:'project'|'npm-theme', theme, themeRange?, aspectRatio?, entry (mặc định 'slides.md'), placeholders?: {key,label,default?}[], textFiles? (mặc định ['slides.md','package.json']), exclude?: string[], preview?, palette?: {mode:'native'|'vars-map'|'none'}, install?: {scripts:'ignore'|'ask'}, tags?: string[], icon?: string.
- `parseManifest(raw: unknown): { ok:true; manifest } | { ok:false; errors: string[] }`: validate chặt (id ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$; name ≤ 80 ký tự; placeholders key ^[A-Z][A-Z0-9_]{0,31}$ và không trùng khoá built-in TITLE/AUTHOR/DATE/SLUG; exclude ≤ 50 mục, mỗi mục ≤ 200 ký tự, không tuyệt đối, không chứa '..'; bỏ trường lạ).
- `class TemplateRegistry { constructor({ bundledDir, userDir }) ; list(): TemplateInfo[]; get(id); }` — quét cả hai thư mục, đọc `<dir>/<id>/template.json`; manifest hỏng KHÔNG làm sập danh sách (bỏ qua + trả kèm mảng `problems`). ID của template có sẵn được giữ chỗ: user không được trùng. `TemplateInfo` = manifest + { source:'bundled'|'user', dir, trustedBundled:boolean }.
- Tạo file `template.json` cho 9 template có sẵn trong `electron/templates/<id>/` từ dữ liệu của BUNDLED_TEMPLATES (giữ đúng name/description/theme/themeRange). Riêng hcmut-bach: `exclude: ["starter/**","scripts/**","example.md","README.md","theme/README.md","theme/CHANGELOG.md"]`, `palette.mode: 'vars-map'`, `install.scripts:'ask'`, `trustedBundled` được suy ra từ source==='bundled'.
- `matchesExclude(relPath, patterns)`: tự viết (KHÔNG thêm dependency) hỗ trợ `dir/**`, `*.ext`, đường dẫn chính xác, không phân biệt hoa/thường, chuẩn hoá '\\'→'/'. Có test.

## 2. `Scaffolder` nhận phụ thuộc để test được
- `new Scaffolder({ registry, store, install, now })` (mặc định lấy singleton hiện có). Xoá guard dòng 161, thay bằng `registry.get(templateId) ?? throw`. Xoá nhánh `templateId === 'hcmut-bach'` dòng 188, dùng `matchesExclude(relative, manifest.exclude ?? [])`.
- Giữ export `BUNDLED_TEMPLATES` như một getter tương thích (danh sách bundled từ registry) để code cũ/test cũ không vỡ; `scaffold:listTemplates` trả danh sách mới (thêm các trường mới, giữ các trường cũ).
- Thay `getTemplatesDir` bằng cấu hình `bundledDir` + `userDir = path.join(projectStore.getConfigDir(), 'templates')` (tạo nếu chưa có). Giữ nguyên các fallback tìm bundledDir hiện có.

## 3. Placeholder mở rộng (F7)
- `renderTemplate(content, values: Record<string,string>, keys?: string[])`: khoá hợp lệ = built-in {TITLE, AUTHOR, DATE, SLUG, INSTITUTE, ADVISOR} ∪ `keys`. CHỈ thay dạng `{{KEY}}` (viết hoa liền, không khoảng trắng) và CHỈ với khoá đã khai báo; mọi `{{...}}` khác (ví dụ Vue `{{ count }}`) giữ nguyên. Giữ quy tắc: frontmatter → JSON string; thân → escapeVueText. Giữ chữ ký cũ `renderTemplate(content, {title,author,date})` hoạt động (map sang TITLE/AUTHOR/DATE).
- Áp cho mọi file trong `manifest.textFiles` (mặc định slides.md + package.json), kể cả `{{SLUG}}` (hiện chỉ package.json). Giá trị thiếu → dùng `default` của placeholder, nếu vẫn thiếu thì chuỗi rỗng.
- `scaffold:create` nhận thêm `values?: Record<string,string>` (validate: khoá khớp regex, mỗi giá trị ≤ 200 ký tự, loại ký tự điều khiển, đúng như `cleanDisplayText` đang làm).

## 4. Test (F9) — `tests/scaffolder.test.ts` mở rộng + `tests/templateRegistry.test.ts`
Dùng thư mục tạm; store/install giả (không npm install thật, `autoInstallDeps=false`):
- Tạo dự án từ mỗi trong 9 template có sẵn: có slides.md, package.json đúng `@slidev/cli`, không có file bị `exclude`, tên dự án đã thay `{{SLUG}}`, frontmatter parse được bằng `yaml`.
- Tiêu đề có `"`, `:`, `#`, `<`, `{{`, tiếng Việt có dấu, CRLF → frontmatter vẫn là YAML hợp lệ; thân không sinh mustache.
- Placeholder tuỳ chỉnh INSTITUTE; `{{ count }}` trong slide không đổi.
- Registry: gộp bundled + user; user trùng id bundled bị từ chối; manifest hỏng bị bỏ qua có `problems`.
- `matchesExclude` bảng ca.

## Ràng buộc
- Không đổi tên kênh IPC hiện có; `scaffold:listTemplates` vẫn hoạt động cho renderer cũ.
- Không thêm dependency. Chạy `npm run typecheck && npm test`, dán kết quả thật; nếu output dự án của template nào khác trước thì nêu rõ và sửa.
````

---

### Prompt P7 — Pipeline import an toàn + sửa lỗ hổng cài đặt/khởi chạy (F8, F4, F10)

*Phụ thuộc: P6. **Commit trước khi chạy.** Đây là prompt nhạy cảm về bảo mật — đọc kỹ kết quả AI trả về.*

````text
Bối cảnh: Slidev Studio. Sau P6 đã có `TemplateRegistry`, manifest `template.json`, thư mục template người dùng `~/.slidev-studio/templates/`. Bây giờ thêm pipeline NHẬP template (thư mục, zip, git, npm) và sửa lỗ hổng thực thi mã.

## Lỗ hổng cần sửa TRƯỚC (F8)
- `electron/services/scaffolder.ts` ~dòng 269–290: `createProject` chạy `<pm> install` (installArgs = ['install', --registry?]) KHÔNG có `--ignore-scripts`; ~dòng 294: `projectStore.addProjectFromFolder(projectPath, true)` đăng ký dự án `trusted=true`.
- `electron/services/processManager.ts` dòng ~157: `requestInstallTrust`: `if (!project || project.trusted !== false) return Promise.resolve({ approved: true, ignoreScripts: false })`; ~dòng 191 chỉ áp cổng ở bước cài. Grep cho thấy KHÔNG có cổng trust ở bước start dev server (Slidev nạp vite.config.*, setup/*, component .vue của dự án).
- `projectStore.ts:76` migrate: dự án cũ thiếu trường `trusted` được coi là `true` — GIỮ nguyên hành vi này.
Yêu cầu:
1. Thêm `origin?: 'bundled-template'|'user-template'|'opened-folder'|'git-clone'` vào `ProjectItem` (projectStore.ts, dòng ~20). Dự án cũ thiếu origin → không đổi hành vi.
2. `createProject`: nếu template `source==='user'` thì (a) chạy install với `--ignore-scripts` trừ khi người dùng đã xác nhận tin cậy template (`values.trust === true` truyền từ màn review VÀ `contentHash` khớp bản đã lưu), (b) đăng ký dự án với `trusted:false`, `origin:'user-template'` (nếu đã tin cậy thì `trusted:true`). Template `bundled` giữ hành vi cũ (`trusted:true`, chạy script như trước để hcmut-bach chạy được patch-package).
3. `processManager.start`: đọc kỹ hàm start hiện tại trước khi sửa. Nếu `project.trusted === false && project.origin === 'user-template'` → phát `process:needs-trust` (kênh đã có, dùng lại cơ chế `requestInstallTrust`/`confirmTrust`) với thông điệp 'chạy mã của dự án (vite.config, setup, component)'; chọn 'cancel' → không spawn; 'once' → chạy lần này; 'remember' → `trusted:true`. KHÔNG áp cổng này cho dự án 'opened-folder' (đó là quyết định sản phẩm chờ chủ dự án chốt — thêm hằng `GATE_START_ORIGINS = ['user-template']` dễ mở rộng).
4. IPC `scaffold:runPostinstall(projectId)`: chỉ cho dự án đã `trusted:true`; chạy `<pm> run postinstall` nếu script tồn tại, stream log qua kênh scaffold:log; dùng `installQueue`.

## Pipeline import — thư mục `electron/services/templateImport/`
Thư viện zip: dùng `fflate` (thêm vào dependencies; nếu bạn thấy lý do mạnh để chọn `yauzl` thì nói rõ, đừng thêm cả hai). Kiểm phiên bản/typings đã cài trước khi dùng API `unzipSync`/`filter` (cần `originalSize` để chặn zip-bomb TRƯỚC khi giải nén).
- `staging.ts`: tạo `<configDir>/tmp/import-<uuid>/`, dọn khi xong/lỗi/huỷ; khi app khởi động xoá thư mục tmp cũ > 24h.
- `zipReader.ts` `extractZipSafe(zipPath, destDir)`:
  * S1 zip-slip: mỗi entry name chuẩn hoá ('\\'→'/'), từ chối nếu tuyệt đối, chứa '\0', có đoạn '..', hoặc `path.relative(destDir, path.resolve(destDir, name))` bắt đầu bằng '..' → TỪ CHỐI CẢ FILE.
  * S2 symlink/hardlink (theo external attributes) → từ chối cả file (ghi lý do).
  * S3 giới hạn: zip ≤ 50MB; tổng giải nén ≤ 200MB; ≤ 5000 mục; mỗi file ≤ 50MB; tỉ lệ nén (originalSize/size) > 100 ở bất kỳ mục nào → từ chối. Kiểm bằng metadata TRƯỚC khi inflate.
  * S4 bỏ im lặng: node_modules, .git, __MACOSX, .DS_Store, .slidev, dist, export.
  * Nếu chỉ có ĐÚNG MỘT thư mục gốc chứa mọi thứ → làm phẳng (bỏ thư mục gốc).
- `folderReader.ts`: copy thư mục vào staging với cùng bộ lọc S2/S3/S4 (bỏ symlink, đếm kích thước).
- `gitSource.ts`: dùng `validateGitUrl` (electron/utils/gitUrl.ts); chỉ https/ssh, CHẶN `file://` và đường dẫn cục bộ; `git clone --depth 1 --no-tags --recurse-submodules=no <url> <staging>` qua execa với timeout 120s và env sạch (buildEnv); sau đó xoá `.git`.
- `npmSource.ts`: `themePackageName()` chuẩn hoá tên (dùng resolveThemePackage của P0); chạy `npm view <pkg> version engines.slidev --json` (timeout 30s, registry từ settings.server.registry); dùng `isEngineCompatible(engine, settings.projects.defaultCliRange)`; kết quả: manifest kind:'npm-theme' với `themeRange: ^<version>` GHIM (F4: thay 'latest' ở scaffolder.ts:225 cho cả đường tạo dự án với theme tuỳ chỉnh). Lỗi mạng → trả cảnh báo 'chưa kiểm tương thích' nhưng vẫn cho lưu với `themeRange` do người dùng nhập.
- `inspector.ts` `inspectStaging(stagingDir): InspectReport` — CHỈ ĐỌC, không chạy gì: tìm entry (slides.md ở gốc hoặc trong đúng một thư mục con; nếu nhiều ứng viên → trả danh sách để UI chọn); đọc frontmatter bằng `readTheme`; nếu theme là đường dẫn cục bộ thì bắt buộc nằm TRONG staging (S8) và thư mục tồn tại; đọc package.json → liệt kê scripts preinstall/install/postinstall/prepare + overrides (S5); liệt kê file mã chạy: vite.config.*, uno.config.*, setup/**, index.html có <script>, *.vue có <script> (S6); đếm file/dung lượng; sinh manifest gợi ý nếu không có template.json (tên = tên thư mục, kind:'project'); tính `contentHash` (sha256 của package.json + danh sách file mã chạy + nội dung script).
- `index.ts`: `importFromSource({kind, source}) → InspectReport & {stagingId}`; `commit({stagingId, manifestEdits, trust, onConflict:'rename'|'overwrite'|'cancel'})`: validate manifest bằng `parseManifest` (P6), kiểm id (S7), nếu trùng và 'overwrite' thì chuyển bản cũ vào Thùng rác qua `shell.trashItem`, rồi di chuyển staging → `<userDir>/<id>` bằng `fs.move` (atomic khi cùng ổ đĩa; nếu khác ổ thì copy + xoá và nói rõ), ghi `templates.json` (importedAt, source, contentHash, trusted).

## IPC (đăng ký trong main.ts như các registerXxxIpc khác) + preload + src/ipc-client.ts + src/env.d.ts
`templates:list`, `templates:pickSource('folder'|'zip')` (mở dialog Ở MAIN), `templates:inspect({kind, source})`, `templates:commit`, `templates:cancel`, `templates:update`, `templates:remove` (trashItem), `templates:exportZip`, sự kiện `templates:progress`. Mọi handler validate kiểu/độ dài (theo mẫu `projects:updateProject`), `stagingId` phải là uuid do main cấp, không nhận đường dẫn đích từ renderer.

## Test `tests/templateImport.test.ts` (dựng zip TRONG test bằng fflate `zipSync`)
- Từ chối: entry '../evil.txt'; '/etc/passwd'; 'a/../../b'; tên có '\0'; symlink (nếu fflate không dựng được thuộc tính symlink thì tự ghép byte central-directory cho ca này và nói rõ); zip-bomb giả lập (originalSize lớn/size nhỏ); > 5000 mục. Với mọi ca: KHÔNG có file nào xuất hiện ngoài staging (kiểm bằng cách quét thư mục cha).
- Chấp nhận: zip hợp lệ có một thư mục gốc (được làm phẳng); zip không manifest (sinh manifest gợi ý).
- Inspector: phát hiện postinstall + patch-package; phát hiện vite.config.ts; `theme: ../x` bị từ chối; hash đổi khi script đổi.
- createProject với template user: install nhận `--ignore-scripts`, dự án `trusted:false`, `origin:'user-template'`; với `trust:true` và hash khớp thì không có `--ignore-scripts`.
- Cổng start: dự án user-template `trusted:false` không spawn khi chọn 'cancel'.

## Ràng buộc
- Không thực thi bất cứ thứ gì trong staging (không npm, không node, không slidev).
- Không đổi hành vi với 9 template có sẵn và dự án cũ.
- Chạy `npm run typecheck && npm test`, dán kết quả thật; nêu rõ nếu phải chọn phương án khác so với mô tả.
````

---

### Prompt P8 — UI: Thư viện template, hộp thoại Nhập, kéo-thả, Lưu thành template

*Phụ thuộc: P7.*

````text
Bối cảnh: Slidev Studio (React + Tailwind, điều hướng trong `src/App.tsx`: Home / Wizard / Workspace / Settings). Đã có IPC `templates:*` (P7) và `TemplateRegistry` (P6). Hiện `NewProjectWizard.tsx` (bước 2) hiển thị lưới thẻ icon từ `getTemplateIcon(id)` (switch theo id, dòng ~97–115) và một ô "Theme tuỳ chỉnh (nâng cao)" (state `customTheme`, khi có thì ép `templateId:'default'` ở `handleCreate`).

## 1. Trang "Thư viện template" — `src/pages/TemplateLibrary.tsx`
- Thêm view mới trong App.tsx; nút vào từ Home (cạnh nút tạo dự án) và liên kết từ Wizard.
- Lưới thẻ: ảnh preview (nếu template có `preview.png` → đọc qua IPC trả data URL ≤ 300KB; nếu không có → khối gradient từ palette mặc định của template), tên, mô tả, chip tỉ lệ (16:9/4:3), chip 'Có sẵn'/'Của tôi', mức hỗ trợ palette (Đầy đủ/Một phần/Thử nghiệm/Không), biểu tượng khoá nếu cần tin cậy.
- Lọc chip: Tất cả · Học thuật · Sáng · Tối · 16:9 · 4:3 · Của tôi; ô tìm kiếm theo tên/mô tả/tag.
- Thao tác trên 'Của tôi': Dùng để tạo dự án (chuyển sang Wizard với template đã chọn), Sửa thông tin (tên/mô tả/tag), Nhân bản, Xuất .zip, Mở thư mục, Xoá (hỏi xác nhận, nói rõ 'không xoá dự án đã tạo từ template này').

## 2. Hộp thoại "Nhập template" — `src/components/ImportTemplateDialog.tsx`
- 4 tab: Thư mục · Zip · Git · Theme npm; tất cả có vùng thả file. Bước 1 chọn nguồn (Thư mục/Zip mở dialog qua `templates:pickSource` — renderer KHÔNG tự đọc đường dẫn; Git/npm là ô nhập). Bước 2 phân tích: thanh tiến trình từ `templates:progress`, có nút Huỷ (`templates:cancel`). Bước 3 xem lại: ID/tên (sửa được, kiểm regex ngay), theme, tỉ lệ, số file/dung lượng, danh sách placeholder (thêm/xoá), CẢNH BÁO S5/S6 hiển thị NGUYÊN VĂN script và danh sách file mã chạy (khối có thể cuộn, chữ mono), checkbox 'Tôi tin template này' (mặc định TẮT, có giải thích 1 câu), xử lý trùng ID (Đổi tên / Ghi đè / Huỷ), nút 'Nhập'.
- Nếu InspectReport có nhiều ứng viên entry → radio chọn entry.
- Sau khi nhập: đóng hộp thoại, làm mới danh sách, và (nếu mở từ Wizard) tự chọn template mới.

## 3. Wizard
- Bước 2: lưới thẻ có ảnh preview (dùng cùng component thẻ với Thư viện); thêm nút 'Nhập template…' ở đầu; thay `getTemplateIcon` bằng `manifest.icon`/preview (giữ icon cũ làm dự phòng cho template có sẵn để không đổi giao diện).
- Thay ô 'Theme tuỳ chỉnh (nâng cao)' bằng nút 'Thêm theme npm…' (mở tab 4). Xoá logic ép `templateId:'default'` — template kind 'npm-theme' đã tự lo `slides.md` mẫu.
- Bước 3: sinh thêm ô nhập cho từng `manifest.placeholders` (label từ manifest, default từ manifest); giá trị gửi qua `values`.
- Kéo-thả: bắt `dragover/drop` trên toàn Wizard và Thư viện; overlay 'Thả để nhập template'. Đường dẫn file lấy bằng `webUtils.getPathForFile(file)` phơi qua preload (`api.system.getPathForFile`) — kiểm phiên bản Electron đang dùng (^31) có hỗ trợ; main vẫn phải kiểm loại (thư mục hoặc .zip) và giới hạn kích thước như P7.

## 4. 'Lưu thành template' — trong workspace
- Menu '…' trong toolbar (hoặc mục trong menu dự án) → hộp thoại: ID, tên, mô tả, checkbox 'Thay tiêu đề/tác giả/ngày bằng placeholder'. Khi tick: hiện BẢN XEM TRƯỚC thay đổi (các khoá `title`,`author`,`date` trong frontmatter sẽ đổi thành '{{TITLE}}','{{AUTHOR}}','{{DATE}}') trước khi lưu.
- Main: `templates:saveFromProject` (P7 đã khai báo kênh; nếu chưa có handler thì làm ở đây): copy trừ `node_modules,.git,dist,export,.slidev,.output,.temp,.studio-backup,*.log,.DS_Store` (đưa `IGNORED_NAMES` của fs.ipc.ts vào `shared/` để dùng chung); thay placeholder bằng `yaml.parseDocument` (giữ comment) chứ KHÔNG regex; sinh `template.json`; nếu server đang chạy thì chụp `preview.png` từ webview bằng `capturePage()` rồi thu nhỏ 640px.

## 5. Settings › Dự án & Template
- Hiện đường dẫn thư mục template người dùng, nút 'Mở thư mục', chọn 'Template mặc định', nút 'Dọn cache staging'.

## Ràng buộc
- Bàn phím dùng được (Tab/Enter/Esc), aria-label cho các nút icon; không chặn UI khi phân tích.
- Chữ giao diện tiếng Việt; giữ phong cách slate hiện tại.
- Chạy `npm run typecheck && npm test`; mô tả cách tự kiểm thử thủ công (nhập zip hợp lệ, zip độc hại bị từ chối với thông báo dễ hiểu, kéo-thả thư mục, lưu dự án thành template rồi tạo lại dự án từ nó).
````

---

### Prompt P9 — Đổi theme & palette cho dự án đã tạo (M20)

*Phụ thuộc: P2, P6.*

````text
Bối cảnh: Slidev Studio. Hiện theme slide chỉ chọn lúc tạo dự án; workspace không có chỗ đổi. Đã có: `electron/utils/themeResolver.ts` (`readTheme(entryText)`, `themePackageName`/`resolveThemePackage`, `checkThemeInstalled(projectPath, resolved)`, `isEngineCompatible`), `electron/services/installQueue.ts`, `processManager.restart`, `src/lib/slideIndex.ts` (`parseSlideIndex(markdown, entryFile)` → danh sách slide), TemplateRegistry (P6), paletteService (P2), `yaml` v2.

## Yêu cầu
1. Panel 'Theme & Màu' trong workspace (mở rộng PalettePicker của P4 thành 2 tab: 'Màu' và 'Theme'). Tab 'Theme' hiện: theme hiện tại (tên + gói + phiên bản đã cài + tương thích với CLI đã cài), danh sách theme khả dụng (template có sẵn + template người dùng + theme npm đã lưu), nút 'Đổi theme'.
2. IPC `theme:getInfo(projectPath, entryFile)` và `theme:switch({ projectPath, entryFile | 'all', targetTemplateId })` (validate; `assertRegisteredProjectRoot`).
3. Quy trình `switch`, theo đúng thứ tự và dừng an toàn nếu bước nào lỗi:
   a) SAO LƯU entry `.md` (và package.json) vào `.studio-backup/<file>.<yyyymmdd-hhmmss>` (dùng cùng tiện ích sao lưu của P2; giữ 20 bản gần nhất).
   b) Sửa khoá `theme:` trong frontmatter bằng `yaml.parseDocument` (giữ comment và thứ tự khoá); KHÔNG regex. Nếu frontmatter lỗi YAML → dừng, báo dòng lỗi, không sửa gì.
   c) Cập nhật `package.json`: bỏ dependency theme cũ nếu KHÔNG còn entry nào khác dùng, thêm theme mới với phiên bản GHIM theo manifest (`themeRange`), tuyệt đối không dùng 'latest'.
   d) Nếu theme mới là 'project' kind có thư mục `theme/` cục bộ: copy `theme/` (+ các thư mục components/layouts/setup/public mà manifest yêu cầu) vào dự án; nếu đã tồn tại `theme/` khác → hỏi ('Thay thế (đã sao lưu)' / 'Huỷ').
   e) Chạy cài dependency qua `installQueue` với chính sách trust của P7 (template người dùng → --ignore-scripts trừ khi đã tin cậy).
   f) Nếu server đang chạy → `processManager.restart`.
   g) Sau cùng áp lại palette đang dùng NẾU template mới hỗ trợ (`getAppliedPalette` → `applyPalette` với templateKind mới); nếu không hỗ trợ → gỡ khối palette và báo rõ.
4. Cảnh báo tương thích layout TRƯỚC khi đổi: đọc `layout:` của từng slide bằng `parseSlideIndex` (và frontmatter từng slide), so với tên file trong `theme/layouts` của theme đích (hoặc danh sách layout khai báo trong manifest); hiện danh sách slide sẽ rơi về layout mặc định. Cho phép tiếp tục.
5. Dự án nhiều entry (`project.entryFiles`): mặc định áp cho entry đang mở; tuỳ chọn 'Tất cả entry'.

## Test `tests/themeSwitch.test.ts` (thư mục tạm, install giả)
- Đổi theme giữ nguyên comment/khoá khác trong frontmatter; tạo bản sao lưu; đổi lại được (vòng A→B→A cho ra frontmatter tương đương); frontmatter hỏng → không sửa file; dependency cũ bị bỏ khi không còn dùng; palette được áp lại hoặc gỡ đúng theo hỗ trợ.

## Ràng buộc
- Không đụng nội dung thân slide. Không xoá thư mục `theme/` cũ mà không sao lưu. Chạy `npm run typecheck && npm test` và dán kết quả thật.
````

---

### Prompt P10 — Hồ sơ đơn vị (Institution Profile) (M21)

*Phụ thuộc: P6.*

````text
Bối cảnh: Slidev Studio. `shared/settings.ts` có `projects.defaultAuthor`. Layout cover của hcmut-bach đọc `configs.logo`, `configs.institute`, `configs.advisor` (theme/layouts/cover.vue). Sau P6 template có manifest và placeholder mở rộng (INSTITUTE, ADVISOR).

## Yêu cầu
1. `shared/settings.ts`: thêm `projects.profile: { institute: string; faculty: string; advisor: string; footerText: string; logoFile: string }` (mặc định chuỗi rỗng). Giữ `settingsVersion: 2`, cập nhật `DEFAULT_SETTINGS`, validate khi import (`settingsImportValidation.ts`): mỗi chuỗi ≤ 200 ký tự, loại ký tự điều khiển; `logoFile` chỉ là TÊN file (không có '/', '\\', '..').
2. Logo: nút 'Chọn logo…' → dialog ở main → kiểm magic bytes (png/jpg/webp/svg), ≤ 2MB, với SVG loại bỏ `<script>`/thuộc tính `on*`/`javascript:` bằng bộ lọc allowlist (hoặc từ chối nếu không chắc) → copy vào `<configDir>/profile/logo.<ext>`; `logoFile` lưu tên.
3. Settings › Dự án & Template: nhóm 'Hồ sơ đơn vị' với các ô trên + xem trước logo + nút 'Xoá logo'. Thêm từ khóa tìm kiếm.
4. Khi tạo dự án (`Scaffolder.createProject`): nếu template khai báo placeholder INSTITUTE/ADVISOR mà người dùng không nhập ở Wizard → điền từ profile. Nếu profile có logo và template hỗ trợ (`manifest.logo === true` hoặc frontmatter có khoá `logo`) → copy vào `<project>/public/logo.<ext>` và ghi `logo: /logo.<ext>` vào frontmatter bằng `yaml.parseDocument`. Template hcmut-bach: thêm `logo: true` vào manifest (layout đã tự dùng ảnh bundled khi không có `cfg.logo`).
5. Wizard bước 3: ô Đơn vị/Giảng viên hiện sẵn giá trị từ profile (sửa được, không ghi ngược lại profile).
6. Gợi ý (KHÔNG tự ghi): khi người dùng chọn palette 'stanford-cardinal', 'oxford-navy', 'mit-cardinal', 'tum-blue', 'hcmut-bach' và ô Đơn vị đang trống, hiện gợi ý một dòng 'Điền tên trường?' bấm vào mới điền.

## Test
`tests/profile.test.ts`: validate settings (logoFile chứa '..' bị từ chối), điền placeholder từ profile, copy logo chỉ khi hợp lệ, SVG có `<script>` bị từ chối/làm sạch.

## Ràng buộc
- Không lưu dữ liệu cá nhân ngoài settings hiện có; không gửi logo đi đâu. Chạy `npm run typecheck && npm test`, dán kết quả thật.
````

---

### Prompt P11 — Thư viện snippet học thuật + gợi ý frontmatter/layout (M22)

*Phụ thuộc: không (nên sau P3 để có layout `figure`, `references` của academic-base).*

````text
Bối cảnh: Slidev Studio. `src/components/EditorPane.tsx` (Monaco, có ref/handle, guard autosave), `src/lib/markdownGuard.ts` (`checkSlideMarkdown` kiểm cân bằng frontmatter/code fence), `src/lib/slideIndex.ts` (`parseSlideIndex`). Muốn chèn nhanh các khối học thuật.

## Yêu cầu
1. Dữ liệu: `electron/snippets/academic.json` (đóng gói qua extraResources giống templates — cập nhật electron-builder.yml) + `<configDir>/snippets/*.json` của người dùng. Schema: `{ id, title, category, description, body, cursor? }` với `body` là văn bản Markdown/Slidev có `$0`/`${1:mặc định}`. Bộ mặc định (mỗi cái kèm ví dụ ngắn): hai cột (`layout: two-cols` + `::right::`), hình + chú thích + nguồn, bảng kết quả, công thức KaTeX (khối `$$…$$` và inline), định lý/bổ đề/nhận xét/cảnh báo (`<Block type="theorem">`), pseudocode/thuật toán (khối code), code có highlight dòng (```ts {2,4-6}), slide tài liệu tham khảo, agenda, 'Cảm ơn/Q&A', slide chỉ có ảnh toàn khung, slide trích dẫn.
2. Chèn: menu 'Chèn' trên thanh của EditorPane + gõ '/' ở đầu dòng mở danh sách gợi ý Monaco (CompletionItemProvider, `insertTextRules: InsertAsSnippet`). Khi chèn 'slide mới' phải tự thêm dòng phân cách `---` ĐÚNG NGỮ CẢNH: dùng `parseSlideIndex` và logic của `markdownGuard` để biết con trỏ có đang ở trong code fence/frontmatter không; nếu có → từ chối chèn `---` và báo lý do; nếu con trỏ ở giữa một slide → chèn sau slide hiện tại.
3. Toàn bộ chèn là MỘT thao tác chỉnh sửa Monaco (`pushUndoStop` trước/sau + `executeEdits`) để Ctrl+Z hoàn tác cả khối.
4. Completion cho frontmatter: khoá phổ biến (`layout`, `class`, `transition`, `clicks`, `background`, `hide`, `title`…) và GIÁ TRỊ `layout:` lấy từ tên file trong thư mục layouts của theme hiện hành (quét `theme/layouts/*.vue` nếu theme cục bộ, hoặc `node_modules/<gói theme>/layouts/*.vue`); IPC read-only mới `theme:listLayouts(projectPath)` qua `assertInsideAllowedRoot(…,'read')`, cache theo mtime.
5. Snippet người dùng: 'Lưu đoạn đang chọn thành snippet' (hỏi tiêu đề/danh mục), lưu file json (validate id ^[a-z0-9_-]{1,64}$, tiêu đề ≤ 80, body ≤ 20KB).

## Test
`tests/snippets.test.ts`: parse/validate schema; hàm `insertSlideAt(markdown, offset)` (thuần, đặt ở `src/lib/`) — không chèn `---` trong code fence hoặc frontmatter, chèn đúng chỗ ở giữa slide, xử lý CRLF.

## Ràng buộc
- Không đổi hành vi autosave/guard hiện có. Không thêm dependency. Chạy `npm run typecheck && npm test`, dán kết quả thật.
````

---

### Prompt P12 — Preflight trước khi xuất + sao lưu tự động (M23 + M24 mức tối thiểu)

*Phụ thuộc: P2 (tiện ích sao lưu), tốt nhất sau P9.*

````text
Bối cảnh: Slidev Studio. `src/components/ExportDialog.tsx` (xuất PDF/PNG/PPTX/MD/build), `electron/ipc/export.ipc.ts`. Theme hcmut-bach có sẵn cơ chế đánh dấu slide tràn (`.hb.has-overflow` trong `theme/components/HbFrame.vue`), và tài liệu tham khảo `plan/hcmut-bach-legacy/scripts/check-overflow.mjs`. `src/lib/slideIndex.ts` cho ánh xạ slide↔dòng; Phase 7 đã có `EditorPaneHandle.reveal`.

## Phần A — Sao lưu dùng chung (nếu P2 chưa tách thành tiện ích thì tách ở đây)
`electron/utils/backup.ts`: `backupFile(projectPath, absFile): Promise<string|null>` → `.studio-backup/<tên>.<yyyymmdd-hhmmss>`, giữ 20 bản gần nhất theo từng tên; đảm bảo `.studio-backup/` nằm trong `.gitignore` của dự án nếu file .gitignore tồn tại. Dùng ở: áp/gỡ palette, đổi theme, thay placeholder khi lưu template. Có test.

## Phần B — Preflight
1. `electron/services/preflight.ts` `runPreflight(projectPath, entryFile): Promise<PreflightIssue[]>` với `PreflightIssue = { severity:'error'|'warn'|'info'; code; message; file; line?; slideNo? }`. Kiểm (đều là đọc file, KHÔNG chạy Slidev):
   - `frontmatter-yaml`: frontmatter (đầu file và từng slide) parse lỗi bằng `yaml`;
   - `placeholder-left`: còn chuỗi `{{[A-Z][A-Z0-9_]{0,31}}}` chưa thay (ngoài khối code);
   - `image-missing`: `![](path)`/`<img src>`/`background:` tham chiếu đường dẫn tương đối hoặc `/public` không tồn tại;
   - `external-url`: ảnh/script/font từ URL ngoài (rủi ro khi in/offline) — mức warn;
   - `theme-missing`: theme chưa cài (dùng `checkThemeInstalled`);
   - `contrast-custom`: nếu `style.css`/`styles/index.*` có khối palette người dùng và palette vi phạm lint (dùng `lintPalette`) — mức warn;
   - `overflow` (chỉ khi server đang chạy): renderer hỏi webview qua bridge hiện có (`webview-preload.ts`/`shared/preview-bridge.ts`) danh sách slide có `.has-overflow` hoặc `scrollHeight > clientHeight` của vùng nội dung; nếu bridge chưa có thông điệp này, thêm thông điệp `studio:overflow-scan` (đọc kỹ webview-preload.ts trước khi sửa, giữ nguyên các thông điệp cũ).
2. `ExportDialog.tsx`: nút 'Kiểm tra trước khi xuất' và tự chạy nhẹ khi bấm Xuất; hiện danh sách theo mức độ, bấm một dòng → nhảy tới slide/dòng (reveal + goto). Có 'Xuất bất chấp'. Mặc định KHÔNG chặn khi chỉ có warn/info; có `error` thì đổi nút thành 'Xuất bất chấp lỗi'.
3. Settings › Xuất file: công tắc 'Kiểm tra trước khi xuất' (mặc định bật).

## Test
`tests/preflight.test.ts` (thư mục tạm): từng mã lỗi có ca dương/âm; ảnh trong khối code không bị tính; CRLF; slide nhiều frontmatter.

## Ràng buộc
- Không làm chậm mở hộp thoại xuất quá 300ms với dự án 100 slide (đọc file song song, dừng ở 500 vấn đề).
- Chạy `npm run typecheck && npm test`, dán kết quả thật.
````

---

## 8. Checklist kiểm thử (chạy sau mỗi pha)

**Sau pha A (nền tảng)**
- [ ] `npm run typecheck && npm test` xanh, không sửa test cũ.
- [ ] Đổi app theme sang từng theme (6 cái) → cửa sổ không nháy nền sai khi khởi động lại.
- [ ] Nhập theme có mã `#abc` → giao diện đúng, không có `NaN` trong DevTools (`getComputedStyle(document.documentElement)`).

**Sau pha B (palette)**
- [ ] Tạo dự án `hcmut-bach` → áp lần lượt Stanford, Oxford, Scholar Ivory, Ocean → thanh tiêu đề/heading/liên kết đổi màu, **không restart server**.
- [ ] Xem thử (chưa bấm Áp dụng) rồi Huỷ → file dự án không đổi (so bằng `git diff` hoặc mtime).
- [ ] Áp palette 2 lần liên tiếp → file giống hệt lần một.
- [ ] Nội dung CSS của bạn nằm ngoài khối đánh dấu còn nguyên sau khi áp/gỡ.
- [ ] Xuất PDF giữ đúng màu palette; mở PDF kiểm chữ `link`, `alert` đọc rõ.
- [ ] Palette `midnight-lab` bị vô hiệu với template chỉ hỗ trợ sáng (hcmut-bach) và dùng được với `academic-base`.
- [ ] Presenter (`?mode=presenter`) không bị rò style (không đổi giao diện ngoài `.slidev-layout`).
- [ ] Nhãn ⚠️ hiển thị đúng cho MIT/TUM; Stanford/Oxford ✅.

**Sau pha C–D (template)**
- [ ] Zip độc hại (`../evil`, symlink, bom nén) bị từ chối, không có file nào ngoài staging.
- [ ] Nhập thư mục/zip/git/npm đều ra màn review; template có `postinstall` hiển thị nguyên văn script.
- [ ] Tạo dự án từ template lạ: cài dependency với `--ignore-scripts`; dự án `trusted:false`; bấm Start có hộp thoại xác nhận; chọn Huỷ → server không chạy.
- [ ] Tick "Tôi tin template này" → cài có script; đổi `package.json` của template → hỏi lại.
- [ ] 9 template có sẵn tạo ra dự án **giống hệt** trước khi refactor (so cây thư mục + `slides.md`).
- [ ] "Lưu thành template" rồi tạo lại dự án từ nó → tiêu đề/tác giả/ngày được điền đúng, slide không đổi.
- [ ] Xoá template không ảnh hưởng dự án đã tạo.

**Sau pha E**
- [ ] Đổi theme A→B→A: frontmatter giữ comment, có bản sao lưu, palette được áp lại hoặc gỡ đúng.
- [ ] Hồ sơ đơn vị điền sẵn Wizard; logo SVG chứa `<script>` bị từ chối/làm sạch.
- [ ] Chèn snippet không phá code fence; Ctrl+Z hoàn tác cả khối.
- [ ] Preflight bắt được: `{{TITLE}}` còn sót, ảnh thiếu, slide tràn; nhảy đúng slide.

---

## 9. Điểm mạnh — nên giữ nguyên

- **Ranh giới bảo mật ở main process đã có nền tốt:** `pathGuard` (`assertInsideAllowedRoot`/`assertRegisteredProjectRoot`), `atomicWrite`, kiểm tên dự án, chặn xoá qua symlink, validate đầu vào ở `projects:updateProject`. Plan này **tái dùng** đúng các khối đó thay vì viết đường bảo vệ mới.
- **`themeResolver` + `slideIndex` + `markdownGuard` là "viên gạch" chất lượng:** đã tách hàm thuần, có test; M20/M22/M25 dựng lên trên chúng được.
- **Schema settings có phiên bản + deep-merge + validate import** → thêm khoá mới (`defaultPaletteId`, `profile`) rẻ và an toàn.
- **`renderTemplate` xử lý đúng việc thoát YAML/Vue** (frontmatter → JSON string, thân → `escapeVueText`) — điều nhiều app scaffold làm sai; mở rộng khoá chứ không viết lại.
- **Theme `hcmut-bach` đã token hoá bằng biến CSS và bundle phông offline** (`fonts.provider: none`) — nền lý tưởng cho lớp palette.

---

## 10. Giới hạn của bản plan này

- **Không chạy được** `npm install`, `typecheck`, `lint`, `vitest` (sandbox không có mạng, zip không kèm `node_modules`). Mọi phát hiện F1–F11 dựa trên **đọc code**; các số dòng lấy từ bản `20260930_095714` và có thể lệch nếu bạn đã sửa thêm.
- **Chưa đọc kỹ:** `webview-preload.ts`, `EditorPane.tsx`, `ExportDialog.tsx`, phần lớn `processManager.ts`/`projectStore.ts`. Các prompt P7/P12 vì vậy yêu cầu AI **đọc trước khi sửa** các hàm này, và mình đã ghi rõ chỗ chưa xác minh (ví dụ luồng start server với trust).
- **Mã màu:** chỉ Stanford và Oxford được đối chiếu với trang chính thức (một vài mã phụ đã đánh dấu ⚠️); HCMUT là giá trị từ code của bạn + pixel logo (không tìm thấy mã hex chính thức); **MIT và TUM chưa đối chiếu** — đừng phát hành khi chưa kiểm. Các token `link`, `alert`, `muted`, `chart` là màu **suy ra** để đủ tương phản, không phải màu thương hiệu của trường.
- **Palette trên 7 theme npm** chưa kiểm được (không tải được gói) → plan chỉ cam kết "Thử nghiệm" cho chúng và đưa script `scan-theme-vars.mjs` để lập bảng thật.
- **Độ lớn (S/M/L)** là ước lượng tương đối, không phải số ngày; bản thân AI sửa cũng có thể cần vài vòng cho các prompt P3, P7, P8.
- **Không kiểm thử giao diện thật:** các mô tả UI dựa trên cấu trúc component đọc được; cần bạn duyệt bằng mắt sau mỗi pha.
