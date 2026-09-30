# Kế hoạch: Desktop App cộng tác làm slide bằng Slidev + Git

> Mục tiêu: nhiều người cùng làm một bài thuyết trình, **mỗi người phụ trách một phần (section)**, không cần real-time, không cần server riêng. Git là nơi lưu trữ và đồng bộ; Slidev là engine render; Desktop App là lớp giao diện che giấu Git cho người không rành kỹ thuật.

---

## 1. Tóm tắt ý tưởng

| Thành phần | Vai trò |
| --- | --- |
| **Slidev** | Viết slide bằng Markdown, preview, export. Dùng tính năng `src:` để ghép nhiều file con vào một file tổng. |
| **Git + GitHub** | Lưu lịch sử, phân nhánh theo người, review qua Pull Request. Chi phí server = 0. |
| **Desktop App** | Chọn vai trò → tự checkout nhánh → sửa file con + preview → bấm "Gửi bài" (commit/push/PR). |

**Vì sao chọn hướng này thay vì real-time (Yjs/CRDT):** chia việc theo đầu mục nên gần như không đụng file của nhau; không cần WebSocket server; có sẵn lịch sử và blame; độ khó code thấp hơn nhiều. Đánh đổi: không thấy con trỏ/bài của nhau tức thì (phải pull).

---

## 2. Phạm vi

### Trong phạm vi (MVP)
- 1 repo / 1 bài thuyết trình, chia N section, mỗi section 1 file `.md`.
- Chọn vai trò → làm việc trên đúng file của mình.
- Preview riêng phần mình và preview bản tổng hợp.
- Commit / push / tạo PR bằng 1 nút.
- Kéo bài mới của mọi người về (pull/sync) bằng 1 nút.
- Export bản tổng (PDF/PPTX/SPA) từ nhánh `main`.

### Ngoài phạm vi (làm sau)
- Chỉnh sửa đồng thời real-time trên cùng một file.
- Comment/review inline trong app (dùng GitHub PR trước).
- Nhiều bài thuyết trình trong một workspace.
- Hệ thống phân quyền riêng (dựa vào quyền GitHub).

---

## 3. Kiến trúc tổng thể

```text
┌──────────────────────── Desktop App ────────────────────────┐
│  UI (React)                                                 │
│   ├─ Chọn dự án / vai trò                                   │
│   ├─ Editor (Monaco) ─────┐                                 │
│   ├─ Preview (webview) ◄──┼── Slidev dev server (child proc)│
│   └─ Nút: Sync · Gửi bài · Export                           │
│                                                             │
│  Main process (Node)                                        │
│   ├─ GitService      (isomorphic-git hoặc system git)       │
│   ├─ SlidevService   (spawn/kill dev server, quản lý port)  │
│   ├─ GitHubService   (OAuth, tạo PR, đọc trạng thái PR)     │
│   ├─ ProjectService  (đọc manifest, map vai trò → file)     │
│   └─ Store           (cấu hình người dùng, token an toàn)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / SSH
                        ┌──────▼──────┐
                        │   GitHub    │  main · feature/<user>-<section>
                        └─────────────┘
```

### Lựa chọn công nghệ đề xuất
| Hạng mục | Đề xuất | Lý do / phương án thay thế |
| --- | --- | --- |
| Shell app | **Electron** | Có sẵn Node để chạy Slidev. Tauri nhẹ hơn nhưng phải đóng gói Node như sidecar → phức tạp hơn cho MVP. |
| UI | React + TypeScript + Vite | Quen thuộc, nhiều thư viện. |
| Editor | Monaco Editor | Highlight Markdown/YAML tốt. |
| Git | `isomorphic-git` (không phụ thuộc cài đặt) **hoặc** gọi binary `git` | isomorphic-git dễ đóng gói nhưng chậm/thiếu vài tính năng; binary `git` đầy đủ nhưng bắt người dùng cài git. Chốt ở Phase 0. |
| Xác thực GitHub | OAuth Device Flow | Không cần backend riêng; tránh bắt người dùng tạo PAT thủ công. |
| Lưu token | `keytar` / Electron `safeStorage` | Không lưu plain text. |
| Preview | Slidev dev server chạy tiến trình con, hiển thị bằng `<webview>`/iframe | Tận dụng HMR của Slidev. |

---

## 4. Cấu trúc repo & quy ước

```text
my-presentation/
├── package.json
├── slides.md                  # File tổng (entry) — ghép các section bằng src
├── slidev-collab.json         # Manifest: section ↔ người phụ trách
├── setup/                     # Cấu hình dùng chung (theme, layout, style)
│   ├── main.ts
│   └── style.css
├── sections/
│   ├── 01-intro.md
│   ├── 02-analysis.md
│   └── 03-demo.md
├── previews/                  # Wrapper để preview độc lập từng section
│   ├── 01-intro.md
│   ├── 02-analysis.md
│   └── 03-demo.md
├── public/                    # Ảnh/asset dùng chung
└── sections-assets/           # Ảnh riêng từng section (tránh trùng tên)
    ├── 01-intro/
    ├── 02-analysis/
    └── 03-demo/
```

### File tổng `slides.md`
```markdown
---
theme: default
title: Báo Cáo Tổng Hợp
---

# Báo Cáo Dự Án
Mở đầu

---
src: ./sections/01-intro.md
---

---
src: ./sections/02-analysis.md
---

---
src: ./sections/03-demo.md
---

# Q&A
```

### Wrapper preview độc lập `previews/01-intro.md`
```markdown
---
theme: default
title: Preview - 01 intro
---

---
src: ../sections/01-intro.md
---
```

### Manifest `slidev-collab.json`
```json
{
  "title": "Báo Cáo Tổng Hợp",
  "sections": [
    { "id": "01-intro",    "file": "sections/01-intro.md",    "owner": "github-user-a" },
    { "id": "02-analysis", "file": "sections/02-analysis.md", "owner": "github-user-b" },
    { "id": "03-demo",     "file": "sections/03-demo.md",     "owner": "github-user-c" }
  ],
  "mainBranch": "main",
  "branchPattern": "feature/{owner}-{sectionId}"
}
```

### Quy ước bắt buộc
1. Mỗi người **chỉ sửa file section của mình** (+ thư mục asset tương ứng).
2. `slides.md`, `setup/`, `slidev-collab.json` chỉ do **người điều phối (owner repo)** sửa.
3. Tên ảnh/asset đặt trong thư mục riêng theo section để không trùng.
4. Không đặt cấu hình theme/global trong file section (xem mục 5.2).

---

## 5. Điểm kỹ thuật cần lưu ý ở Slidev

### 5.1. `src:` hoạt động thế nào
- Frontmatter `src: ./path.md` nhúng toàn bộ slide của file con vào vị trí đó trong file tổng.
- Các slide con vẫn được viết bằng cú pháp Slidev bình thường (`---` ngăn slide, `layout:`, v.v.).

### 5.2. ⚠️ Cấu hình theme/global chỉ lấy từ file entry
Bản phân tích gốc gợi ý mỗi file con tự khai báo `theme:` rồi sẽ được áp dụng khi ghép. **Nên kiểm tra lại**: theo hiểu biết của mình, khi file được nhúng qua `src`, phần đầu file con được coi là frontmatter của slide, còn cấu hình toàn cục (theme, title, fonts, …) lấy từ file entry. Vì vậy:

- **Đừng** dựa vào `theme:` trong file section.
- Đặt theme/cấu hình chung ở entry (`slides.md`) và `setup/`.
- Để preview độc lập từng section, dùng **wrapper trong `previews/`** (mục 4) — wrapper có headmatter đầy đủ và nhúng section bằng `src`. Đây là cách an toàn hơn so với chạy `slidev sections/part-a.md` trực tiếp.
- Ở Phase 0 nên viết một prototype nhỏ để xác nhận hành vi này trên đúng phiên bản Slidev đang dùng.

### 5.3. Các lệnh dùng trong app
| Việc | Lệnh |
| --- | --- |
| Preview 1 section | `npx slidev previews/<id>.md --port <p>` |
| Preview bản tổng | `npx slidev slides.md --port <p>` |
| Export PDF/PPTX | `npx slidev export slides.md` (cần Playwright/Chromium) |
| Build web tĩnh | `npx slidev build slides.md` |

### 5.4. Đóng gói Slidev trong app
- Slidev cần Node. Với Electron: dùng Node đi kèm (`ELECTRON_RUN_AS_NODE`) hoặc bundle Node riêng.
- `node_modules` của Slidev nặng → cân nhắc cài lần đầu khi mở dự án (có progress bar) thay vì nhét hết vào installer.
- Export cần trình duyệt headless → tải Chromium ở lần export đầu tiên.

---

## 6. Git workflow

### 6.1. Nhánh
```text
main                          ← bản tổng, chỉ merge qua PR
 ├─ feature/user-a-01-intro
 ├─ feature/user-b-02-analysis
 └─ feature/user-c-03-demo
```

### 6.2. Luồng của một thành viên
1. Mở app → đăng nhập GitHub → clone repo (lần đầu).
2. Chọn "Tôi phụ trách: 02-analysis" → app tạo/checkout `feature/user-b-02-analysis` từ `main` mới nhất.
3. Sửa file trong editor, xem preview.
4. Bấm **Lưu nháp** → commit cục bộ (tự sinh message, ví dụ `wip(02-analysis): 2026-10-01 14:30`).
5. Bấm **Gửi bài** → push nhánh + tạo (hoặc cập nhật) PR vào `main`.
6. Bấm **Đồng bộ** → fetch, hiển thị section nào của người khác đã được merge, rebase/merge `main` vào nhánh của mình.

### 6.3. Luồng của người điều phối
1. Tạo repo từ template, điền manifest, mời thành viên.
2. Review PR (GitHub hoặc trong app), merge vào `main`.
3. Khi cần thêm/bớt/đổi thứ tự section: sửa `slides.md` + manifest trên nhánh riêng, **thông báo cả nhóm đồng bộ lại**.
4. Export bản cuối từ `main`.

### 6.4. Chính sách xung đột
| Tình huống | Xử lý |
| --- | --- |
| Hai người sửa hai file khác nhau | Không xung đột — merge tự động. |
| Người khác lỡ sửa file không phải của mình | App **cảnh báo trước khi commit** (so sánh danh sách file thay đổi với manifest); PR bị chặn bởi CI (mục 9). |
| Xung đột do sửa `slides.md` | Chỉ người điều phối được sửa; giữ `slides.md` ổn định. |
| Xung đột asset trùng tên | Quy ước thư mục asset theo section. |
| Người dùng gặp conflict | App hiện thông báo dễ hiểu + nút "Giữ bản của tôi / Lấy bản mới / Mở editor so sánh". |

### 6.5. Bảo vệ nhánh
- Bật branch protection cho `main`: bắt buộc PR, tối thiểu 1 review (hoặc chỉ điều phối được merge).
- `CODEOWNERS` gán từng `sections/*.md` cho đúng người → GitHub tự yêu cầu review đúng chủ.

---

## 7. Thiết kế Desktop App

### 7.1. Màn hình chính
```text
┌──────────────────────────────────────────────────────────────┐
│ [Dự án: Báo Cáo Tổng Hợp ▾]  Vai trò: 02-analysis ▾   ● Đã đồng bộ │
├───────────────┬─────────────────────────┬────────────────────┤
│ Sections      │ Editor (Markdown)       │ Preview            │
│ ✔ 01-intro    │                         │  (Slidev webview)  │
│ ▶ 02-analysis │                         │  [Section | Tổng]  │
│ ○ 03-demo     │                         │                    │
├───────────────┴─────────────────────────┴────────────────────┤
│ [Lưu nháp]  [Đồng bộ]  [Gửi bài]  [Export ▾]     Trạng thái PR: Đang chờ review │
└──────────────────────────────────────────────────────────────┘
```

### 7.2. Module & trách nhiệm
| Module | Chức năng chính |
| --- | --- |
| `ProjectService` | Đọc manifest, xác định file được phép sửa theo vai trò, kiểm tra cấu trúc repo hợp lệ. |
| `GitService` | clone, fetch, checkout/tạo nhánh, status, commit, push, pull/rebase, phát hiện conflict, danh sách file đã đổi. |
| `GitHubService` | OAuth Device Flow, tạo/cập nhật PR, đọc trạng thái PR (open/merged/changes requested), danh sách thành viên. |
| `SlidevService` | Cài dependency lần đầu, spawn dev server (section/tổng), chọn cổng trống, dừng tiến trình khi đóng app/đổi vai trò, đọc log lỗi để hiển thị. |
| `ExportService` | Chạy export/build, báo tiến trình, mở thư mục kết quả. |
| `SettingsStore` | Lưu cấu hình, token (mã hóa), repo gần đây. |

### 7.3. Các trạng thái người dùng cần thấy rõ
- Sạch / Có thay đổi chưa commit / Có commit chưa push / Đã gửi PR / PR đã merge.
- Có bản mới trên `main` chưa kéo về.
- Preview đang chạy / lỗi cú pháp Slidev (hiển thị message, không chỉ log).

### 7.4. Nguyên tắc UX
- Không dùng thuật ngữ Git trên giao diện chính ("Gửi bài", "Đồng bộ", "Lưu nháp").
- Có chế độ "Nâng cao" hiển thị lệnh Git thực tế cho người rành.
- Mọi thao tác phá hủy (reset, bỏ thay đổi) đều xác nhận.

---

## 8. Lộ trình theo phase

> Ước lượng thời gian là tạm tính cho 1 dev làm chính; điều chỉnh theo thực tế.

### Phase 0 — Xác nhận kỹ thuật (≈ 2–3 ngày)
- [ ] Dựng repo mẫu với 3 section + `src`.
- [ ] Xác nhận hành vi headmatter/theme khi nhúng (mục 5.2) trên phiên bản Slidev đang dùng.
- [ ] Thử wrapper `previews/*.md`.
- [ ] So sánh `isomorphic-git` vs binary `git` (clone, checkout, push qua HTTPS + token) → **chốt lựa chọn**.
- [ ] Thử spawn Slidev từ một script Node và nhúng vào webview.
- **Kết quả:** tài liệu quyết định kỹ thuật + repo template chạy được bằng CLI.

### Phase 1 — Workflow Git thủ công + template (≈ 3–4 ngày)
- [ ] Hoàn thiện repo template, `CODEOWNERS`, branch protection, PR template.
- [ ] Viết CI kiểm tra (mục 9).
- [ ] Viết hướng dẫn cho nhóm (chạy bằng CLI) để thử quy trình trước khi có app.
- **Kết quả:** nhóm 3–4 người làm thử một bài thật, thu phản hồi về quy ước.

### Phase 2 — Khung Desktop App (≈ 5–7 ngày)
- [ ] Khởi tạo Electron + React + TS, cấu trúc main/renderer, IPC an toàn (contextIsolation).
- [ ] Màn hình chọn/clone dự án, đọc manifest.
- [ ] Editor Monaco đọc/ghi file section.
- [ ] `SlidevService`: cài dependency, spawn/kill server, hiển thị preview section.
- **Kết quả:** mở dự án, sửa file, thấy preview cập nhật (HMR).

### Phase 3 — Tích hợp Git & GitHub (≈ 6–8 ngày)
- [ ] Đăng nhập GitHub (Device Flow), lưu token an toàn.
- [ ] Chọn vai trò → tạo/checkout nhánh.
- [ ] Lưu nháp (commit), Đồng bộ (fetch + merge/rebase `main`), Gửi bài (push + PR).
- [ ] Kiểm tra file thay đổi so với quyền của vai trò.
- [ ] Xử lý lỗi mạng, xác thực hết hạn, conflict cơ bản.
- **Kết quả:** một thành viên không biết Git hoàn thành trọn vòng lặp sửa → gửi → thấy PR.

### Phase 4 — Preview tổng, Export, hoàn thiện (≈ 4–6 ngày)
- [ ] Chuyển đổi preview Section ↔ Tổng.
- [ ] Hiển thị trạng thái PR và section của người khác.
- [ ] Export PDF/PPTX/SPA từ `main`.
- [ ] Thông báo lỗi thân thiện, log chẩn đoán, nút "Gửi báo lỗi".
- **Kết quả:** bản beta cho nhóm dùng thật.

### Phase 5 — Đóng gói & phát hành (≈ 3–4 ngày)
- [ ] Đóng gói installer (Windows/macOS/Linux), tự cập nhật.
- [ ] Ký ứng dụng (macOS notarization, Windows code signing nếu cần).
- [ ] Tài liệu người dùng + video hướng dẫn ngắn.

### Phase 6 — Mở rộng (tùy chọn)
- Cảnh báo "đang có người sửa section X" (qua trạng thái nhánh/PR).
- Review/comment ngay trong app.
- Hỗ trợ nhiều dự án; template theme.
- Tùy chọn real-time cho một file (Yjs) nếu thực sự cần.

---

## 9. CI/CD

### Kiểm tra trên mỗi PR (GitHub Actions)
1. **Chặn sửa sai file:** so sánh file thay đổi với manifest/CODEOWNERS; fail nếu người gửi đụng file ngoài phạm vi.
2. **Build thử:** `slidev build slides.md` để phát hiện lỗi cú pháp/import.
3. **Lint Markdown** cơ bản (tùy chọn).

### Sau khi merge vào `main`
- Build và deploy bản web tĩnh lên GitHub Pages (link chia sẻ nhanh).
- Tùy chọn: xuất PDF làm artifact của workflow.

---

## 10. Kiểm thử

| Loại | Nội dung |
| --- | --- |
| Unit | `ProjectService` (map vai trò → file), `GitService` (dùng repo tạm), parser manifest. |
| Integration | Chạy luồng: clone → checkout → sửa → commit → push (repo giả cục bộ/bare repo). |
| E2E | Playwright cho Electron: chọn vai trò, sửa file, thấy preview, gửi bài. |
| Thủ công | Mạng chậm/mất mạng, token hết hạn, conflict, repo lớn có nhiều ảnh, Windows đường dẫn có dấu/khoảng trắng. |
| Thử với người dùng | 1 buổi với thành viên không biết Git; đo số bước bị kẹt. |

---

## 11. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Hành vi `src` khác kỳ vọng (theme/headmatter) | Trung bình | Prototype ở Phase 0; dùng wrapper preview; cố định phiên bản Slidev trong `package.json`. |
| Slidev nặng / cài chậm lần đầu | Trung bình | Cài lần đầu có tiến trình; cache; cho phép dùng Node/Slidev đã có sẵn. |
| Người dùng không có Git / cấu hình SSH | Cao | Dùng OAuth + HTTPS; cân nhắc isomorphic-git; hướng dẫn cài đặt trong app. |
| Xung đột khi thay đổi cấu trúc `slides.md` | Thấp | Chỉ điều phối sửa; thông báo đồng bộ sau mỗi thay đổi cấu trúc. |
| Ảnh lớn làm repo phình | Trung bình | Giới hạn kích thước, nén ảnh khi thêm, cân nhắc Git LFS. |
| Rò rỉ token | Cao | Lưu bằng keychain/`safeStorage`; không ghi log token; scope OAuth tối thiểu. |
| Chạy tiến trình con bị treo/mồ côi | Trung bình | Quản lý vòng đời; kill khi thoát app; kiểm tra cổng trước khi spawn. |
| Export lỗi do thiếu Chromium | Thấp | Tải Chromium khi cần và báo rõ tiến trình. |

---

## 12. Câu hỏi cần chốt trước khi làm

1. Chỉ dùng **GitHub** hay hỗ trợ cả GitLab/Gitea?
2. Có cho phép người dùng **merge trực tiếp** (không cần review) hay bắt buộc PR?
3. Một section có thể có **nhiều người** cùng sửa không, hay 1 người / section?
4. Có cần thư viện **theme/layout riêng** của nhóm không (ảnh hưởng `setup/`)?
5. Hệ điều hành mục tiêu: chỉ Windows hay cả macOS/Linux?
6. Nhóm chấp nhận **cài Node/Git** hay app phải tự đóng gói toàn bộ?
7. Quy mô dự kiến: bao nhiêu người / bao nhiêu section / dung lượng ảnh?

---

## 13. Checklist MVP (Definition of Done)

- [ ] Clone repo và đọc manifest từ app.
- [ ] Chọn vai trò → tự vào đúng nhánh, chỉ mở đúng file section.
- [ ] Sửa trong app → preview section cập nhật.
- [ ] Xem được preview bản tổng.
- [ ] "Lưu nháp", "Đồng bộ", "Gửi bài" hoạt động; PR được tạo đúng nhánh/đích.
- [ ] Cảnh báo khi sửa file ngoài phạm vi; CI chặn ở PR.
- [ ] Export PDF từ `main`.
- [ ] Một người không biết Git hoàn thành trọn vòng lặp mà không cần hỗ trợ.

---

## 14. Phụ lục: so sánh nhanh với hướng real-time

| Tiêu chí | Git + Slidev `src` | Real-time (Yjs/CRDT) |
| --- | --- | --- |
| Độ khó | Thấp | Cao (socket, con trỏ, debounce) |
| Chi phí server | ~0 | Cần WebSocket/signaling |
| Lịch sử | Commit/blame có sẵn | Phải tự xây version DB |
| Tính tức thì | Cần push/pull | Thấy ngay |
| Phù hợp khi | Chia việc theo section | Nhiều người sửa chung một file |
