# Rà soát hệ thống Slidev Studio — 29/10/2026

Rà soát tại commit `2835d28`, app 1.0.2, Windows x64. Đọc main/preload/IPC, lưu tài liệu, quản lý tiến trình, Git/GitHub, preview, export, cấu hình build và kiểm thử. Các phép thử ghi/xóa dữ liệu chỉ dùng dự án và profile tạm; không sửa mã chức năng hay dữ liệu dự án thật.

Kết luận: nền tảng đã có nhiều tối ưu hữu ích, nhưng nên sửa các đường gây mất dữ liệu trước khi tối ưu thêm giao diện. Điểm tài nguyên đáng chú ý nhất là số server Slidev chạy nền, không chỉ số webview.

## Kiểm chứng trong lần rà soát này

| Hạng mục | Kết quả |
| --- | --- |
| `npm run typecheck` | Đạt cả main/preload và renderer |
| `npm run lint` | Đạt |
| `npm test` | 117/117 test, 24 file, đạt |
| `npm run build` | Đạt; renderer build khoảng 64 giây trong lượt này |
| `npx playwright test` | Lượt đầy đủ: 7 đạt, 1 timeout ở luồng chọn section cộng tác |
| Chạy lại ca cộng tác | Bản gốc `npx playwright test tests/e2e/collaboration.spec.ts` đạt; bản chẩn đoán có thêm ghi lại UI cũng đạt |
| `npm run test:export` | PDF đạt và đúng 3 trang được chọn; PPTX và static web đều tạo output không rỗng |
| Thử bổ sung bằng Electron/Monaco/Slidev thật | Tái hiện hỏng PNG, export bỏ sót nháp, build xóa dữ liệu đầu ra cũ, sai đường dẫn trả về và lỗi mở đầu ra ngoài dự án |
| Thử trực tiếp lớp TypeScript | Tái hiện ghi đè thay đổi ngoài app, sai ID ghi nhớ trust, sai index code fence và guard nhận nhầm văn bản hợp lệ |
| Dependency audit | 25 package bị cảnh báo: 5 critical, 13 high, 7 moderate |

Ca E2E timeout tại `tests/e2e/collaboration.spec.ts:114`: nút “Lưu nháp” chưa hết disabled sau 15 giây. Lượt đó có tác vụ chẩn đoán Electron chạy đồng thời. Hai lượt chạy riêng sau đó đạt; chưa đủ bằng chứng kết luận lỗi sản phẩm tất định. Không nên báo lượt đầy đủ này là 8/8 hoặc bỏ qua yếu tố tải máy.

Kết quả chi tiết được lưu trong `reports/system-audit-evidence-2026-10-29.json`. Các script tái hiện tạm nằm tại `.cache/system-audit-*.mjs`; raw audit tại `.cache/system-audit/`. Không xây/cài lại installer hoặc kiểm thử macOS/Linux trong lần này. Số liệu p95 trong `reports/validation.md` là phép đo cũ trên 1.0.1, không phải benchmark mới của lần rà soát.

## Những lỗi đã xác nhận

### 1. P1 — Build web có thể xóa dữ liệu nguồn khi chọn nhầm thư mục đầu ra

Vị trí: `electron/ipc/export.ipc.ts:78`, `:113` và `:121`.

App cho phép chọn thư mục đã tồn tại trong project làm đầu ra rồi truyền trực tiếp cho Slidev/Vite. Tạo `assets/audit-source-data.txt` trong project tạm, export build với `outputDir = <project>/assets`: build thành công, `assets/index.html` được tạo, nhưng file nguồn có sẵn bị xóa. Vite dọn nội dung đầu ra trước khi ghi build.

Nên dùng thư mục đầu ra chuyên dụng cho từng job/entry; kiểm tra đường dẫn thật sau khi giải quyết symlink. Từ chối thư mục gốc dự án, thư mục nguồn/asset và thư mục có dữ liệu không do Studio tạo. Khi cần thay build cũ, chỉ thay một thư mục đầu ra mà Studio đã nhận diện và quản lý. Thêm regression test giữ nguyên một file sentinel khi người dùng chọn `assets`, `public`, thư mục section hoặc thư mục nguồn khác.

### 2. P1 — File nhị phân được mở và lưu như UTF-8

Vị trí: `src/components/FileTree.tsx:61`, `electron/ipc/fs.ipc.ts:65`, `src/components/EditorPane.tsx:41`.

Cây file chuyển mọi file sang editor, IPC đọc bằng UTF-8 và đường lưu ghi chuỗi UTF-8 mà không phân loại nhị phân. Thử bằng bản sao `build/icon.png` trong project tạm, mở trong Monaco, nhập thêm rồi Ctrl+S: file từ 41.016 byte thành 60.617 byte; PNG header `89504e470d0a1a0a` thành `efbfbd504e470a1a`. Đây là hỏng dữ liệu, không chỉ hiển thị sai.

Nên có image preview riêng; PDF/ZIP/font/video và các file nhị phân khác phải được mở bằng trình xem thích hợp hoặc thông báo không hỗ trợ sửa. Kiểm tra loại file và kích thước ở main process, không chỉ khóa UI. Với file văn bản cần bảo toàn encoding/EOL hoặc thông báo rõ khi chuyển đổi.

### 3. P1 — Lưu nháp có thể ghi đè bản mới từ editor khác

Vị trí: `src/state/documentStore.ts:65`, `:136` và `:154`.

Store có mtime/size để tải lại file sạch, nhưng bỏ qua reload khi có nháp và không kiểm tra phiên bản trên đĩa trước khi ghi. Tái hiện trực tiếp trên lớp thật: tải `original`, sửa thành `local unsaved draft`, bên ngoài đổi thành `external update`, gọi load rồi save. Kết quả trên đĩa là nháp cục bộ, không có lỗi xung đột.

Nên đưa phiên bản kỳ vọng của file qua IPC; kiểm tra trong hàng đợi ghi tại main process trước khi atomic replace. Nếu file đã thay đổi, giữ cả hai bản và cho chọn tải bản ngoài, so sánh/hợp nhất hoặc chủ động ghi đè. Watcher hữu ích để báo sớm nhưng không thay thế kiểm tra khi ghi.

### 4. P1 — Export báo thành công nhưng bỏ sót nội dung đang sửa

Vị trí: `src/components/ExportDialog.tsx:156`, `:187`, `:202`; nơi gọi dialog trong `src/pages/ProjectWorkspace.tsx`.

Luồng export thông thường không flush hoặc hỏi xử lý nháp. Qua UI thật: tắt autosave, nhập marker `AUDIT_UNSAVED_EXPORT_20261029`, chọn Static Web và xuất. App báo thành công; marker vẫn có trong editor nhưng không có trên đĩa hoặc trong JavaScript bundle xuất ra.

Nên xử lý nháp trước khi export. Khi autosave tắt, cho người dùng quyết định lưu rồi xuất hoặc xuất bản đã lưu. Khi lưu lỗi/guard chặn phải báo rõ, không lặng lẽ xuất dữ liệu cũ. Cộng tác xuất nhánh main là một quy tắc riêng, nên tiếp tục ghi rõ nguồn nội dung xuất trong UI.

### 5. P2 — Guard Markdown chặn autosave của slide hợp lệ

Vị trí: `src/lib/markdownGuard.ts:47`.

Ví dụ sau trả về `Frontmatter chưa được đóng bằng ---` ở dòng 3 mặc dù frontmatter đã đóng:

```markdown
---
theme: default
---
# Title

Note: this is ordinary slide content.
```

Heuristic đang coi dòng có `key:` trong thân slide cuối là frontmatter đang mở. Nên phân tích trạng thái header/frontmatter/body rõ ràng; thêm test cho văn bản `Note:`, URL, danh sách có dấu hai chấm và YAML nhiều dòng.

### 6. P2 — “Đồng ý & nhớ” không ghi nhớ quyền tin cậy

Vị trí: `electron/services/processManager.ts:171` và `:193`.

Request ID được tạo theo `projectId:timestamp:nonce`, nhưng `const [, projectId] = requestId.split(':')` lấy timestamp. Probe gọi phương thức thật ghi nhận `updateProject('1793278800000', { trusted: true })` thay vì ID dự án. Nên giữ projectId trong bản ghi pending request, không suy ra lại bằng tách chuỗi; test cả once/remember/cancel và dự án khởi động đồng thời.

### 7. P2 — Có thể export ra ngoài dự án nhưng không mở được kết quả

Vị trí: `electron/ipc/export.ipc.ts:78`, `electron/ipc/fs.ipc.ts:89`.

Export chấp nhận thư mục tuyệt đối bên ngoài project, nhưng `fs:showInFolder` chỉ cho đường dẫn thuộc project/config. File đầu ra tạm bên ngoài project bị từ chối bằng lỗi “Đường dẫn nằm ngoài các dự án đã đăng ký”. `handleOpenOutput` cũng chưa bắt lỗi promise để thông báo trong dialog.

Nên có API mở kết quả export dựa trên output đã được job xác thực; giữ giới hạn của API đọc/ghi file hiện tại. Không mở rộng quyền đọc/ghi toàn filesystem để sửa lỗi này.

### 8. P2 — Build không có options trả sai thư mục đầu ra

Vị trí: `electron/ipc/export.ipc.ts:113–121`.

Gọi `window.api.export.run(root, 'slides.md', 'build')`: CLI tạo `dist/index.html`, nhưng kết quả trả về là `<project>/export`, không có index.html. UI hiện thường gửi outputDir nên không phải mọi lần export đều gặp. API công khai vẫn có default options và cho phép lời gọi này.

Nên luôn truyền output directory đã resolve cho CLI, rồi xác nhận artifact tồn tại trước khi báo thành công. Thêm test cho options thiếu, rỗng, batch và thư mục tùy chọn.

### 9. P2 — Index nguồn sai với code fence dài hơn ba ký tự

Vị trí: `src/lib/slideIndex.ts:9–15`.

Khi gặp fence mở, parser chỉ lưu ký tự marker; làm mất chiều dài fence. Với fence mở bốn backtick, một dòng ba backtick bên trong làm parser hiểu nhầm là kết thúc. Probe có hai slide cho thấy slide thứ hai bị đặt ở dòng 6 thay vì dòng 10. Điều này làm source jump/đồng bộ con trỏ sai vị trí.

`markdownGuard.ts` đã lưu chiều dài fence đúng hơn. Nên dùng chung tokenizer giữa guard và slide index, bổ sung test fence lồng dài/ngắn, tilde và separator nằm trong code.

## Rủi ro qua đọc mã cần xử lý tiếp

### P1 — Dependency và ranh giới bảo mật Electron

Phiên bản thực tế cài trong workspace: Electron 31.7.7, Vite 5.4.21, Vitest 2.1.9, Monaco 0.55.1, simple-git 3.36.0. `npm audit` trả 25 package cảnh báo; đây là package trong đồ thị phụ thuộc, không phải 25 lỗ hổng độc lập đã chứng minh khai thác được trên app.

`npm audit --omit=dev` trả 5 package cảnh báo, nhưng nhãn dev/production không phản ánh đủ mã đóng gói: Electron và Monaco được khai báo devDependencies vẫn có vai trò trong app phân phối. Cần đánh giá đường chạy và bộ cài thực tế.

Không tìm thấy import của `simple-git`, `@electron-toolkit/preload`, `@electron-toolkit/utils` trong mã app. Có thể bỏ các dependency không dùng, đặc biệt simple-git và cây phụ thuộc đang có cảnh báo critical. `uuid` chỉ cần cho ID ngẫu nhiên có thể thay bằng `crypto.randomUUID()`.

Main window hiện `sandbox: false` (`electron/main.ts:142`); chưa thấy CSP trong index/headers, kiểm tra senderFrame chung cho các IPC, permission policy cho preview hoặc khóa điều hướng main window. Một số handler đã kiểm tra path/format tốt, và webview đã tắt Node, bật context isolation/webSecurity; nên giữ các điểm này khi tăng cường bảo mật. Đây là khoảng trống phòng vệ qua đọc mã, chưa phải kết luận đã khai thác được từ slide.

Nên nâng runtime/toolchain theo từng nhóm có test tương thích; bổ sung sandbox, CSP, sender/origin validation và quyền preview theo nhu cầu. Theo [hướng dẫn bảo mật Electron](https://www.electronjs.org/docs/latest/tutorial/security), các lớp phòng vệ này cần được dùng cùng nhau. [Chính sách Electron](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) chỉ hỗ trợ ba dòng stable mới nhất; cần chọn dòng còn hỗ trợ tại thời điểm nâng, không tự động dùng mọi major do audit đề nghị.

### P2 — Registry/settings chưa có lưu bền và thông báo lỗi đầy đủ

`ProjectStore.save()` tại `electron/services/projectStore.ts:107` ghi đè trực tiếp projects.json bằng writeJsonSync và chỉ console.error khi lỗi. App có thể trả thành công trong bộ nhớ dù lưu đĩa thất bại; ghi bị gián đoạn có thể làm hỏng registry. Atomic write hiện có cho tài liệu chưa được áp dụng ở đây. Nên atomic replace, giữ backup tốt gần nhất, xác thực schema và trả lỗi tới UI.

Nháp tài liệu chỉ nằm trong Map của renderer. Close coordinator bảo vệ đường đóng bình thường nhưng không phục hồi được nháp sau crash/mất điện. Nên có journal phục hồi riêng cho nháp, kể cả Markdown chưa hợp lệ, và so sánh bản trên đĩa trước khi restore.

### P2 — Dọn server mồ côi phụ thuộc vào WMIC

`electron/services/pidRegistry.ts:75–92` gọi `wmic` trên Windows. Trong môi trường kiểm tra, `Get-Command wmic` không tìm thấy executable. Nếu không đọc được command line, code vẫn bỏ PID khỏi registry dù chưa xác nhận tiến trình đã chết. Đây là đường suy ra từ mã và môi trường; chưa cố tình làm crash app để tái hiện end-to-end.

Nên dùng CIM hoặc API Windows phù hợp, có timeout, xác thực danh tính/start time/câu lệnh của process và chỉ xóa registry sau khi xác nhận kết quả. Không kill chỉ dựa vào một PID cũ có thể đã được tái sử dụng.

## Tối ưu tài nguyên nên ưu tiên

StartQueue giới hạn hai tác vụ khởi động đồng thời, không giới hạn số server đang chạy. Đã mở ba project fixture 30/100/300 slide: cả ba server chạy, webview chỉ có hai. Vì vậy giảm webview đơn thuần không kiểm soát phần RAM lớn ở Node/Slidev.

Một lượt lấy mẫu mới, project/profile sạch, offline, chờ server và preview hiển thị trước mỗi mẫu:

| Trạng thái | Server | Webview | Private memory Electron | Private memory tiến trình Slidev trực tiếp |
| --- | ---: | ---: | ---: | ---: |
| Home | 0 | 0 | 197 MiB | 0 MiB |
| Mở 30 slide | 1 | 1 | 460 MiB | 1.284 MiB |
| Thêm 100 slide | 2 | 2 | 542 MiB | 2.588 MiB |
| Thêm 300 slide | 3 | 2 | 594 MiB | 3.778 MiB |

Đây là các snapshot trong một phiên trên máy hiện tại, không phải median/p95 hay RAM ổn định sau GC. Phía Slidev lấy `PrivateMemorySize64` của PID trực tiếp; chưa gồm mọi tiến trình con sâu hơn. Không dùng working set cộng dồn. Cần benchmark lặp lại và lấy mẫu idle dài hơn trước khi đặt cam kết RAM.

Các thay đổi đáng thử, theo thứ tự:

1. **Chế độ tiết kiệm RAM:** giữ 1–2 server gần dùng, dừng server tab không hoạt động sau khoảng thời gian cấu hình; giữ nháp/model trong giới hạn an toàn và phục hồi vị trí preview khi chạy lại. Cho phép ghim tab cần chạy liên tục. Đo cả Electron và toàn cây process Node.
2. **Tách mở editor và chạy preview:** cho phép mở project để sửa ngay mà chưa khởi động Slidev; ưu tiên preview của tab hiện tại khi phục hồi nhiều tab.
3. **Quản lý export/install như job:** job ID, tiến độ, timeout toàn tác vụ, hủy được và cleanup cây process/browser. Timeout CLI hiện tại không thay thế timeout/cancel của job. Không để hai job cùng ghi một output directory.
4. **Giới hạn log export:** `ExportDialog.tsx:144` append mảng không giới hạn và render toàn bộ. Dùng ring buffer/batch/VirtualRows giống console; chỉ đăng ký/nhận log theo job đang liên quan. Log file chẩn đoán cũng nên có rotation.
5. **Đo chi phí Monaco trước khi thu gọn:** build hiện có chunk EditorPane khoảng 7,17 MB và TS worker khoảng 13,25 MB chưa nén. Worker đã khởi tạo theo ngôn ngữ, editor đã lazy load, nên không nên đánh đổi offline để giảm kích thước. Có thể đo riêng nhu cầu hỗ trợ TS/HTML/CSS và đóng góp tính năng editor thực sự dùng.
6. **Ngân sách hiệu năng thực:** đo từ thao tác editor tới DOM preview, không chỉ thời gian server mở cổng. Số liệu HMR cũ đã loại debounce 1.200 ms, nên chưa biểu thị toàn bộ thời gian người dùng chờ sau khi gõ.

## Kiến trúc và kiểm thử nên củng cố

- Giữ DocumentStore, atomic write, generation/AbortController, StartQueue/InstallQueue, log batching, model cache, lazy file tree và preview pool. Đây là những nền tảng phù hợp; chưa có bằng chứng cần viết lại app hay đổi framework.
- Tạo lớp đăng ký IPC chung: kiểm tra sender/main frame, schema đối số lúc runtime, kiểu request/response chia sẻ và mã lỗi thống nhất. `src/env.d.ts`, preload và ipc-client hiện lặp nhiều kiểu; `any` làm khó phát hiện khác biệt hợp đồng.
- Chặn sửa file/loading bằng state tài liệu; khóa thao tác Git, preview và export theo đúng phạm vi project/job. Khi tải thư mục/metadata bất đồng bộ, bỏ kết quả cũ nếu người dùng đã đổi project.
- Thêm các regression test cho chín lỗi đã xác nhận phía trên. Bộ hiện tại có nhiều test giá trị, nhưng chưa thấy test chuyên biệt cho ExportDialog, conflict khi file đổi ngoài app, binary editor và trust remember.
- Khởi động trace/screenshot của Electron context trực tiếp khi E2E lỗi. Trace của lượt timeout chỉ có test steps, chưa đủ DOM snapshot để xác định trạng thái UI.
- Thiết lập CI cho typecheck/lint/unit, Windows E2E, smoke bản đóng gói và export. `scripts/benchmark.mjs` hiện luôn `process.exit(0)` dù `summary.targets` false; nên làm job thất bại khi vượt ngân sách đã chốt.
- Báo cáo release nên gắn commit, runtime, fixture lockfile và thời điểm đo; kiểm tra test/artifact thành công trước khi phát hành. Một số câu trong `scripts/report-validation.mjs` được ghi cố định, như khẳng định target đều đạt và PPTX có ba slide XML, nên cần suy ra từ bằng chứng thay vì chỉ chèn mẫu văn bản.

## Thứ tự triển khai đề xuất

1. **Bảo vệ dữ liệu:** thư mục build, binary editor, conflict ghi ngoài app, nội dung nháp khi export.
2. **Độ tin cậy:** guard/index Markdown, nhớ trust, đường dẫn export, registry atomic và phục hồi nháp.
3. **Bảo mật:** bỏ dependency thừa, nâng Electron/toolchain theo nhóm, bổ sung sandbox/CSP/IPC/permission validation.
4. **RAM và vận hành:** pool server hoạt động, chế độ editor trước preview, job export có cancel, log giới hạn.
5. **Kiểm soát hồi quy:** CI, trace đủ dữ liệu, benchmark RAM toàn cây process và báo cáo release có nguồn gốc rõ.

Chưa sửa các mục trên trong lần rà soát này; thay đổi trong Git chỉ là báo cáo và bằng chứng kiểm tra.
