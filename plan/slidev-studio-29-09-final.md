# Báo cáo Audit & Kế hoạch sửa lỗi — Slidev Studio

*Ngày review: 29/09/2026 · Phạm vi: đọc kỹ toàn bộ `electron/` (main, services, ipc, preload, webview-preload) và các file renderer liên quan đến tab/process/preview/editor (`App.tsx`, `ProjectWorkspace.tsx`, `PreviewPane.tsx`, `ProcessConsole.tsx`, `EditorPane.tsx`, `HomeDashboard.tsx`, `SettingsContext.tsx`). Chỉ lướt qua: `NewProjectWizard`, `ExportDialog`, `SettingsPage`, `FileTree`, theme system, các template Slidev bundle sẵn.*

---

## 0. Đọc phần này trước — triệu chứng → nguyên nhân

Bạn nêu 5 nhóm lỗi. Bảng dưới nối từng triệu chứng với nguyên nhân tìm được và **mức độ chắc chắn** (để biết chỗ nào đã kiểm chứng, chỗ nào còn là suy luận).

| Triệu chứng | Nguyên nhân chính | Issue | Độ chắc chắn |
|---|---|---|---|
| **Khởi chạy** chậm, kẹt ở "Starting…" | Regex dò URL/port bị mã màu ANSI làm hỏng → mọi lần chạy đều chờ hết timeout 20 giây rồi *đoán* là đã running | #1 | ✅ **Đã tái hiện** bằng Slidev v53 thật |
| **Default port** lỗi / port nhảy lung tung | Không "giữ chỗ" port giữa các tab; chỉ kiểm `127.0.0.1`; `stop()` không chờ tiến trình chết nên port chưa nhả; server mồ côi giữ port | #2, #3, #4 | ✅ Slidev thoát ngay khi port bận (đã tái hiện). ⚠️ Phần race là suy luận từ code |
| **Duplicate tab (cùng port)** | Hai tab khởi động đồng thời cùng chọn port 3030; mở app 2 lần (không có single-instance lock); registry có thể chứa 2 entry cho 1 thư mục | #2, #5, #16 | ⚠️ Suy luận từ code |
| **Tắt 1 tab tắt hết** | Chưa xác định được nguyên nhân duy nhất. Ứng viên: `window-all-closed` giết toàn bộ server trên macOS; `stop()` kill PID cũ có thể đã bị tái sử dụng; trạng thái renderer bị mất khi rời Workspace | #6 | ❓ **Chưa tái hiện** — cần log chẩn đoán (Prompt 1) |
| **Đơ máy** | Server mồ côi tích tụ; log flood làm React render lại liên tục; `execa` giữ toàn bộ output trong RAM; nhiều `npm install` chạy song song; webview preload thao tác DOM mỗi mutation | #4, #7, #9, #10, #13 | ⚠️ Suy luận, cần đo thực tế sau khi sửa |

**Thứ tự nên làm:** Prompt 1 → 2 → 3 → 4 (nền tảng process/port, giải quyết ~80% triệu chứng), sau đó 5 → 9.

---

## 1. Tổng quan

- **Stack**: Electron 31 + electron-vite 2 + React 18 + TypeScript + Tailwind + Monaco; điều khiển Slidev CLI v53 qua `execa`. Main process ESM (`"type": "module"`).
- **Quy mô**: ~12k dòng (đã tính cả template Slidev). Phần logic của app khoảng 5k dòng; lớn nhất là `ProjectWorkspace.tsx` (762), `processManager.ts` (433), `projectStore.ts` (419), `HomeDashboard.tsx` (396).
- **Kiểm tra tự động đã chạy**:
  - `npm ci --ignore-scripts` ✅, `npm run typecheck` ✅ (0 lỗi), `electron-vite build` ✅ → **code biên dịch sạch; các lỗi bên dưới đều là lỗi logic/vòng đời, không phải lỗi type.**
  - `npm run lint` ❌ không chạy được: `eslint`/`prettier` không có trong `devDependencies`, không có file cấu hình (xem #19). Không có test nào trong repo.
  - **Không chạy được** GUI Electron (sandbox không có display) → các kết luận về UI/webview là từ đọc code.

### Bằng chứng thực nghiệm (chạy Slidev v53.0.0 thật, cách `processManager.ts` đang spawn)

| Thí nghiệm | Kết quả |
|---|---|
| **A.** `FORCE_COLOR=1`, port trống, xem dòng URL | Dòng in ra là `http://localhost:` + `\x1b[1m` + `3030` + `\x1b[22m/`. **Regex ở `processManager.ts:274` khớp 0 dòng.** |
| **B.** `--port 3030` khi 3030 đã bị chiếm | Slidev **không tự nhảy port**: thoát ngay, exit code 1, `Error: Port 3030 is already in use`. |
| **C.** Theme chưa cài, stdin dạng pipe | Slidev thoát sau ~1s với thông báo rõ ràng (`cannot prompt for installation`), **không treo** → giả thuyết "kẹt vì prompt stdin" đã được loại trừ. |

Hệ quả của A + B: mọi lần khởi chạy hiện nay đều đi qua nhánh "hết timeout thì đoán running" (#1); và nếu Studio chọn trùng port thì tiến trình thứ hai **chết ngay** thay vì tự chuyển port (#2).

---

## 2. Tóm tắt vấn đề

| Mức độ | Số lượng | Issue |
|---|---|---|
| Critical | 4 | #1, #2, #3, #4 |
| High | 7 | #5, #6, #7, #8, #9, #10, #11 |
| Medium | 6 | #12, #13, #14, #15, #16, #17 |
| Low | 5 | #18, #19, #20, #21, #22 |
| **Tổng** | **22** | |

---

## 3. Danh sách vấn đề (sắp theo mức độ giảm dần)

### #1 [Critical] Dò port/ready bằng regex bị ANSI phá hỏng → luôn chờ 20s rồi "đoán" running

- **Nhóm**: Logic bug
- **Vị trí**: `electron/services/processManager.ts` — dòng 108 (`FORCE_COLOR: '1'`), 274 (regex), 329–350 (fallback timeout)
- **Mô tả**: `getEnv()` ép `FORCE_COLOR=1` nên Slidev in mã ANSI, bao gồm cả *bên trong* URL (`localhost:\x1b[1m3030\x1b[22m`). Regex `…:(\d+)` không khớp, nên nhánh "server ready" không bao giờ chạy. Code rơi vào `setTimeout(startupTimeoutMs = 20000)` và **tự đặt `status = 'running'` với port đã cấp phát mà không kiểm tra server có thật sự lắng nghe không**.
  Ngoài ra: (a) regex quá rộng — bất kỳ dòng nào chứa `scheme://host:port` (kể cả dòng lỗi, `registry.npmjs.org:443`) đều ghi đè `instance.port/url` và bật lại `status='running'`, kể cả sau khi đã `stopped`/`error`; (b) `ProcessConsole` hiển thị nguyên mã ANSI vì không strip.
- **Ảnh hưởng**: Mỗi lần mở dự án/restart mất ≥ 20s; nếu Slidev chết sau đó hoặc còn đang compile, tab vẫn báo "Running" và preview trắng/lỗi kết nối. Port hiển thị trên tab có thể sai.

**Kế hoạch sửa:**
1. Bỏ `FORCE_COLOR` khỏi `getEnv()` (và `scaffolder.ts:235`, `export.ipc.ts:403,504`); thêm util `stripAnsi()` áp dụng trong `emitLog` như lớp phòng thủ.
2. Thay dò-bằng-regex bằng **readiness probe**: sau khi spawn, poll kết nối TCP/HTTP tới đúng port đã cấp phát (mỗi 250ms) cho tới khi thành công, tiến trình thoát, hoặc hết timeout.
3. Hết timeout → `error` + kill tiến trình; **không bao giờ** đặt `running` theo phỏng đoán.
4. Bỏ logic "URL đầu tiên trong log thắng"; URL = `http://localhost:<port đã probe thành công>`.

→ **Prompt 1** (bỏ FORCE_COLOR, stripAnsi) và **Prompt 3** (readiness probe).

---

### #2 [Critical] Cấp phát port không "giữ chỗ" + kiểm tra sai địa chỉ → trùng port, Slidev chết

- **Nhóm**: Logic bug / Race condition
- **Vị trí**: `electron/services/portFinder.ts:3-16` (`isPortAvailable`), `electron/services/processManager.ts:209-224`
- **Mô tả**:
  1. **Không reserve**: `findFreePort` chỉ hỏi "port có trống *ngay lúc này* không" rồi nhả ra. Hai `start()` đồng thời (mở 2 dự án nhanh, hoặc `restoreTabsOnLaunch`) cùng thấy 3030 trống → cùng nhận 3030. Tiến trình sau chết với `Port 3030 is already in use` (thí nghiệm B).
  2. **Chỉ kiểm `127.0.0.1`** (`server.listen(port, '127.0.0.1')`). Vite/Slidev bind `localhost` (có thể là `::1`) hoặc `0.0.0.0` (chế độ LAN). Một tiến trình giữ `::1:3030` khiến check báo "trống" nhưng Slidev lại thất bại.
  3. **Không xét port của các instance khác trong chính app** (kể cả instance đang `starting`/`installing` chưa bind).
  4. Port đã dừng bằng SIGKILL chưa chắc đã nhả khi `findFreePort` chạy lại (xem #3) → restart làm port "trôi" 3030 → 3031 → 3032.
- **Ảnh hưởng**: Chính là triệu chứng "default port lỗi" và "duplicate tab cùng port". `preferredPort` riêng của dự án càng dễ va chạm vì hai dự án có thể được đặt cùng cổng mà không cảnh báo.

**Kế hoạch sửa:**
1. Tạo `PortAllocator` có `reserved: Map<port, projectId>`; `acquire()` chạy tuần tự qua mutex (promise chain) và loại các port đang được giữ.
2. Kiểm availability trên cả `127.0.0.1`, `::1`, `0.0.0.0` (coi `EAFNOSUPPORT` là "không áp dụng").
3. Giữ chỗ tới khi tiến trình thật sự thoát (`release` trong exit handler/`stop`).
4. Nếu Slidev thoát vì `Port N is already in use` và không `strictPort` → giải phóng, xin port kế tiếp, spawn lại (tối đa 3 lần).
5. Khi 2 dự án cấu hình cùng `preferredPort` → cảnh báo trong UI thay vì im lặng.

→ **Prompt 2**.

---

### #3 [Critical] Vòng đời tiến trình sai: `stop()` không hủy install, SIGKILL không chờ thoát, PID cũ không xóa, output muộn "hồi sinh" trạng thái

- **Nhóm**: Logic bug / Race condition
- **Vị trí**: `electron/services/processManager.ts` — `stop()` dòng 354–380; exit handler 306–327; `start()` 112–131; `restart()` 382–389; `startInternal` 166–206
- **Mô tả**:
  1. **Stop khi đang `installing`** (chưa có `childProcess`): chỉ đặt `status='stopped'` rồi return. `npm install` vẫn chạy, xong thì `startInternal` **vẫn spawn Slidev** → server mồ côi, không ai quản lý.
  2. **`treeKill(pid,'SIGKILL')` resolve khi *gửi* tín hiệu**, không phải khi tiến trình *đã thoát*. Port có thể chưa nhả khi start lại (→ #2), và không có cơ hội shutdown êm.
  3. **`instance.pid` không bị xóa khi tiến trình tự chết** (exit handler ở 306–327 không dọn). Lần `stop()` sau sẽ `treeKill` một PID cũ — nếu OS đã tái sử dụng PID đó thì **giết nhầm tiến trình khác** (kể cả server của tab khác).
  4. **`parseOutput` không kiểm tra generation**: dòng log đến muộn sau `stop` vẫn ghi đè `status = 'running'` (dòng 281).
  5. **`restart()` sau `stop()` có thể nhận lại promise cũ đã reject**: `pendingStarts` chỉ được dọn ở microtask sau `.then(clear, clear)` (dòng 126–129); `start()` gọi ngay sau `await stop()` có thể còn thấy entry cũ cùng `entryFile` và trả về promise cũ → Restart báo lỗi ngay.
  6. Nút Stop/đóng tab khi đang `starting`: exit handler `reject(new Error("Slidev đã thoát trước khi sẵn sàng…"))` → renderer hiện lỗi dù người dùng chủ động dừng.
- **Ảnh hưởng**: Server mồ côi giữ port và CPU; port trôi; Restart/Stop không tin cậy; nguy cơ kill nhầm tiến trình.

**Kế hoạch sửa:**
1. Mỗi instance có `generation` (số tăng dần) và `AbortController`; mọi handler so generation trước khi đổi state.
2. `stop()`: abort install (kill process tree của `npm install`) → `SIGTERM` tree → chờ sự kiện `exit` tối đa 3s → `SIGKILL` → chờ exit → xóa `pid/childProcess` → release port → `stopped`.
3. Exit handler luôn xóa `pid/childProcess`.
4. `restart/recompile` xóa `pendingStarts` tường minh trước khi start mới.
5. `start` bị hủy do người dùng → ném lỗi có mã riêng (`STOPPED_BY_USER`), renderer coi là `stopped`, không phải `error`.

→ **Prompt 3**.

---

### #4 [Critical] Server mồ côi: không có bộ dọn khi app crash/hot-reload/xóa dự án

- **Nhóm**: Logic bug / Resource leak
- **Vị trí**: `electron/main.ts:86-108`; `electron/services/processManager.ts:422-430` (`stopAll`); `src/pages/HomeDashboard.tsx:70-83` (`handleRemoveProject`); `electron/ipc/projects.ipc.ts:210` (`projects:remove`)
- **Mô tả**:
  - Việc dọn dẹp chỉ dựa vào `before-quit`. Khi app bị `kill -9`, crash, hoặc **`npm run dev` tự restart main process khi sửa code** (electron-vite hot restart), `before-quit` không chạy và `execa cleanup` cũng không kịp → Slidev/Vite/esbuild chạy mãi. Không có nơi nào lưu PID để lần mở sau dọn.
  - `projects:remove` xóa dự án khỏi registry nhưng **không dừng server** và **không đóng tab** đang mở → instance vẫn nằm trong `ProcessManager.instances`, giữ port.
  - Không có ràng buộc `keepServersOnQuit=true` với việc quản lý lại các server đó khi mở lại app.
- **Ảnh hưởng**: Tích tụ tiến trình Node/esbuild/watcher → ăn CPU/RAM ("đơ máy"); port 3030 luôn "bận" ở lần mở sau → lỗi port mặc định; người dùng phải `pkill` thủ công.

**Kế hoạch sửa:**
1. `pidRegistry`: ghi `~/.slidev-studio/running.json` (ghi atomic) mỗi khi spawn/exit.
2. Khi khởi động app (sau khi lấy được single-instance lock), quét registry: với entry mà `appPid` không còn sống → **xác minh lệnh của PID có chứa `slidev`** (`ps -p <pid> -o command=`) rồi mới kill tree; không xác minh thì bỏ qua.
3. `projects:remove` gọi `processManager.stop(id)` trước; renderer đóng tab tương ứng.
4. Bắt `SIGTERM/SIGINT/SIGHUP` ở main để dọn best-effort khi dev restart.

→ **Prompt 4**.

---

### #5 [High] Không có single-instance lock → mở 2 app cùng lúc

- **Nhóm**: Logic bug
- **Vị trí**: `electron/main.ts` (không có `app.requestSingleInstanceLock()`); `Rebuild Slidev Studio.command`, `scripts/install-mac-app.sh:23-28`
- **Mô tả**: Bản `npm run dev`, bản `/Applications/Slidev Studio.app` và double-click lần 2 đều tạo main process riêng, mỗi cái có `ProcessManager` riêng **không biết tiến trình của nhau**, cùng chọn port 3030, cùng ghi `~/.slidev-studio/projects.json` (last-write-wins làm mất dự án/cài đặt). Script cài đặt `rm -rf` app trong `/Applications` kể cả khi app đang chạy.
- **Ảnh hưởng**: "Duplicate tab cùng port", mất dữ liệu registry, server của instance này giữ port của instance kia.

**Kế hoạch sửa:** lấy lock ở đầu `main.ts`; nếu thất bại → `app.quit()`; `second-instance` → restore + focus cửa sổ cũ. Script cài: yêu cầu thoát app đang chạy (`osascript -e 'quit app "Slidev Studio"'`) trước khi thay thế.

→ **Prompt 1**.

---

### #6 [High] "Tắt 1 tab tắt hết" — chưa xác định nguyên nhân duy nhất

- **Nhóm**: Logic bug
- **Vị trí**: `electron/main.ts:99-108` (`window-all-closed`); `electron/services/processManager.ts:354-380`; `src/App.tsx:102-121`
- **Mô tả**: Đọc code **không thấy** đường đi nào khiến `stop(projectId)` của tab A giết server của tab B (mỗi instance có PID riêng; `tree-kill` chỉ giết cây con của PID đó). Có 3 ứng viên:
  1. **macOS**: `window-all-closed` luôn gọi `stopAll()` (dòng 100–104) *trước* khi kiểm tra `process.platform !== 'darwin'`. Đóng cửa sổ bằng nút đỏ/Cmd+W trên macOS → **mọi server bị giết** trong khi app vẫn sống; mở lại từ Dock chỉ thấy cửa sổ trống, không có tab.
  2. **PID bị tái sử dụng** (#3.3): `stop()` kill PID cũ đã thuộc tiến trình khác.
  3. **Trạng thái renderer lệch** (#8): `ProjectWorkspace` unmount khi ở Home/Settings nên không nhận `status-changed`; tab hiển thị sai (đã dừng nhưng báo running hoặc ngược lại), tạo cảm giác "tắt hết".
  Ngoài ra `handleCloseTab` (`App.tsx:102`) không có `try/catch`: nếu `process.stop` ném lỗi thì tab không đóng được và trạng thái lệch.
- **Ảnh hưởng**: Mất server đang chạy ngoài ý muốn.

**Kế hoạch sửa:** sửa (1) ngay ở Prompt 1; sửa (2) ở Prompt 3; sửa (3) ở Prompt 5; thêm **log chẩn đoán** (pid, ppid, pgid, port, lý do dừng + stack người gọi) ghi ra `~/.slidev-studio/logs/main.log` (Prompt 1). Nếu sau các bản sửa vẫn tái hiện, gửi lại file log để khoanh vùng tiếp.

→ **Prompt 1, 3, 5**.

---

### #7 [High] Log flood: mỗi dòng log = 1 IPC + 1 lần setState sao chép mảng 1500 phần tử + render lại toàn App

- **Nhóm**: Performance
- **Vị trí**: `electron/services/processManager.ts:56-74` (`emitLog` gửi từng dòng); `src/pages/ProjectWorkspace.tsx:174-194` (`logs: [...prev.logs, x].slice(-1500)`); `src/components/ProcessConsole.tsx:94-113` (render tối đa 1500 `<div>` với key là index), dòng 23 (`scrollTop = scrollHeight` mỗi lần logs đổi)
- **Mô tả**: `npm install` hoặc Vite in hàng nghìn dòng trong vài giây. Mỗi dòng: một IPC → `setOpenTabs` (map qua tất cả tab, sao chép mảng 1500) → `App` render lại → `ProjectWorkspace` (đang truyền `onUpdateTab` không ổn định) → Monaco/Preview nhận props mới. Console không windowing, ép layout thủ công mỗi dòng.
- **Ảnh hưởng**: UI đơ/giật khi cài dependency hoặc khi Vite báo lỗi liên tục; CPU renderer cao.

**Kế hoạch sửa:** gộp batch ở main (flush mỗi ~100ms, gửi mảng); lưu log ngoài React state (ring buffer + `useSyncExternalStore`); Console chỉ render ≤ 500 dòng cuối, key ổn định, chỉ auto-scroll khi đang ở đáy; khi Console đóng chỉ tăng bộ đếm.

→ **Prompt 5**.

---

### #8 [High] Vòng đời subscribe sự kiện process ở renderer sai

- **Nhóm**: Logic bug / Performance
- **Vị trí**: `src/pages/ProjectWorkspace.tsx:162-205`; `src/App.tsx:123-136` (`handleUpdateTab` tạo mới mỗi render)
- **Mô tả**:
  - Listener `onStatusChange/onLog/onCompileError` nằm **trong `ProjectWorkspace`**, component này chỉ mount khi `view === 'workspace'`. Khi người dùng sang Home/Settings/Wizard, mọi sự kiện (crash, stopped, ready, log) **bị bỏ mất**. Quay lại thì tab hiển thị trạng thái cũ.
  - Effect phụ thuộc `[onUpdateTab]` mà `handleUpdateTab` không được `useCallback` → mỗi lần `App` render (mỗi dòng log!) listener bị hủy và đăng ký lại.
  - `handleCloseTab` gọi `setView`/`setActiveTabId` **bên trong updater của `setOpenTabs`** (dòng 111–120) — side effect trong hàm thuần, chạy 2 lần dưới `React.StrictMode` (đang bật ở `main.tsx`).
- **Ảnh hưởng**: Trạng thái tab sai, đặc biệt sau khi crash; góp phần vào #6 và #7.

**Kế hoạch sửa:** chuyển subscription lên `App` (đăng ký một lần), lưu trong store riêng; đồng bộ lại bằng `process.getStatus` cho các tab đang mở khi mount; `useCallback` cho handler; tách side effect ra khỏi updater.

→ **Prompt 5**.

---

### #9 [High] `execa` giữ toàn bộ output trong RAM (và có thể kill tiến trình khi vượt 100MB)

- **Nhóm**: Performance / Resource leak
- **Vị trí**: `processManager.ts:181-185` (install), `252-257` (dev server); `scaffolder.ts:230`; `export.ipc.ts:401,502`
- **Mô tả**: `execa` v8 mặc định `buffer: true`, `maxBuffer: 100MB`. Dev server chạy lâu, log dài → bộ nhớ của main process tăng dần; theo tài liệu execa, khi vượt `maxBuffer` tiến trình con bị kill (dev server tự chết sau một buổi làm việc dài). Đồng thời `stdin` mặc định là `pipe` không ai đóng (thí nghiệm C cho thấy Slidev vẫn xử lý được, nên đây chỉ là dọn dẹp).
- **Ảnh hưởng**: RAM tăng dần → chậm máy; server chết bất ngờ. ⚠️ *Chưa tái hiện* (cần chạy vài giờ hoặc bơm log lớn).

**Kế hoạch sửa:** thêm `buffer: false, stdin: 'ignore'` cho mọi lần spawn dài hạn (dev server, install, export). Chỉ xử lý output qua stream.

→ **Prompt 1**.

---

### #10 [High] Cài dependency không giới hạn song song + nhận diện cài dở dang sai

- **Nhóm**: Performance / Logic bug
- **Vị trí**: `processManager.ts:165-206`, `230-233`; `scaffolder.ts:214-256`; `App.tsx:89-100`
- **Mô tả**:
  - Kiểm tra `fs.existsSync(projectPath/node_modules)` chỉ xét *thư mục tồn tại*. `npm install` bị ngắt giữa chừng để lại `node_modules` dở → **không bao giờ cài lại**, Slidev không khởi động được.
  - Không có hàng đợi: bật `restoreTabsOnLaunch` với N dự án chưa cài → N lần `npm install` cùng lúc (mạng/đĩa/CPU nghẽn).
  - Khi thiếu `node_modules/.bin/slidev`, code rơi sang `npx --yes @slidev/cli` → tải **phiên bản mới nhất** không khớp dự án (dòng 230–233, 400–405).
- **Ảnh hưởng**: Máy đơ khi mở nhiều dự án lần đầu; lỗi khởi chạy khó hiểu.

**Kế hoạch sửa:** điều kiện "đã cài" = tồn tại `node_modules/.bin/slidev` (hoặc `@slidev/cli/package.json`); hàng đợi cài đặt concurrency 1–2 dùng chung cho processManager/scaffolder/export; bỏ fallback `npx` không pin phiên bản (báo lỗi rõ ràng, gợi ý cài lại).

→ **Prompt 3 (điều kiện cài) và Prompt 4 (hàng đợi)**.

---

### #11 [High] EditorPane có thể mất dữ liệu / ghi nhầm file

- **Nhóm**: Logic bug (data loss)
- **Vị trí**: `src/components/EditorPane.tsx` — dòng 136–155 (effect nạp file), 181–186 (debounce), 188–198 (Cmd+S), 141 & 202 (`currentContentRef`)
- **Mô tả**:
  1. Cleanup của effect nạp file (dòng 151–154) **hủy timer autosave** khi `filePath` đổi hoặc component unmount. Sửa file → chuyển file/tab/Home trong vòng 600ms → **thay đổi chưa lưu bị bỏ**, không có thông báo (`isDirty` bị reset ở dòng 142–143 khi nạp file mới).
  2. `currentContentRef` không được reset khi đổi `filePath`. Trong lúc file mới đang nạp (`loading`), nhấn Cmd+S: handler toàn cục (dòng 190–194) ghi **nội dung file cũ vào file mới**.
  3. Lỗi ghi file chỉ `console.error` (dòng 175), UI vẫn hiện "Đã lưu"/idle.
- **Ảnh hưởng**: Mất chỉnh sửa hoặc ghi đè nhầm slide.

**Kế hoạch sửa:** flush đồng bộ nội dung dirty vào **đúng file cũ** trong cleanup/unmount; theo dõi file mà `currentContentRef` thuộc về và chỉ ghi khi khớp; hiện trạng thái lỗi lưu; ghi file atomic (tmp + rename) ở main.

→ **Prompt 6**.

---

### #12 [Medium] `webview.getURL()` gọi trước `dom-ready` + không có Error Boundary

- **Nhóm**: Logic bug
- **Vị trí**: `src/components/PreviewPane.tsx:56, 86`; toàn bộ renderer không có `ErrorBoundary`
- **Mô tả**: Theo tài liệu Electron, các method của `<webview>` (như `getURL`) ném lỗi nếu chưa attach/`dom-ready`. Effect ở dòng 81–96 gọi `getURL()` ngay khi webview vừa mount; `getCurrentSuffix` (dòng 56) cũng gọi không bọc. Exception trong effect/handler React không được bắt → **màn hình trắng** (không có ErrorBoundary). ⚠️ *Chưa xác nhận trên Electron 31 — cần thử bằng DevTools.*
- **Ảnh hưởng**: Trắng màn hình khi chuyển tab/restart.

→ **Prompt 7**.

---

### #13 [Medium] `webview-preload.ts` thao tác DOM nặng ở chế độ scroll

- **Nhóm**: Performance
- **Vị trí**: `electron/webview-preload.ts` — 297–299 (MutationObserver), 146 & 159 (`scrollIntoView`), 263–273 & 286–289 (`pointermove`), 153 (`location.href`), 328 (`setInterval`)
- **Mô tả**: Ở chế độ scroll, **mỗi mutation DOM** (HMR, animation) → `requestAnimationFrame(applyPageMode)` → tạo lại `IntersectionObserver`, set style cho mọi slide và **`scrollIntoView` về slide hiện tại** (giật trang, buộc layout). `pointermove` chạy `querySelectorAll('[data-studio-jump-hover]')` mỗi sự kiện. `gotoSlide` ở chế độ paged dùng `location.href = …` → **tải lại toàn bộ SPA** mỗi lần nhảy slide. `wheel` luôn `preventDefault` trong paged, chặn cả cuộn nội dung trong slide (khối code dài).
- **Ảnh hưởng**: Preview giật/đơ với deck lớn.

→ **Prompt 7**.

---

### #14 [Medium] Nhận diện "lỗi biên dịch" quá rộng

- **Nhóm**: Logic bug
- **Vị trí**: `processManager.ts:268`
- **Mô tả**: `/(\berror\b|…)/i` khớp mọi dòng chứa chữ "error" (`0 errors`, tên file `error.md`, cảnh báo npm). Banner "Lỗi biên dịch" hiện sai và chỉ tắt khi có dòng `ready`/`hmr update`.
- **Ảnh hưởng**: Người dùng thấy lỗi giả.

→ **Prompt 7**.

---

### #15 [Medium] Bề mặt tấn công IPC/renderer quá rộng

- **Nhóm**: Security
- **Vị trí**: `electron/ipc/fs.ipc.ts:49-67`; `electron/main.ts:52-55`; `electron/ipc/projects.ipc.ts:214`; `electron/services/scaffolder.ts:148,155`; `electron/ipc/export.ipc.ts:429`; `PreviewPane.tsx:188`
- **Mô tả**:
  - `fs:readFile/writeFile/listTree` nhận **đường dẫn bất kỳ** (không giới hạn trong các dự án đã đăng ký). Nếu renderer bị XSS (ví dụ từ nội dung markdown/theme), kẻ tấn công đọc/ghi mọi file của người dùng.
  - `setWindowOpenHandler` gọi `shell.openExternal(details.url)` với **mọi scheme** (`file:`, `smb:`, custom protocol).
  - `projects:updateProject` cho phép ghi đè `path`, `id`… bằng object tuỳ ý.
  - Scaffolder: `name` không được kiểm tra → `../../x` thoát khỏi `targetDir` (path traversal). Bộ lọc `!src.includes('.git')` loại cả `.github`, `.gitignore`, và bất kỳ đường dẫn nào có chuỗi `.git`.
  - `<webview allowpopups>` không cần thiết.
- **Ảnh hưởng**: Leo thang từ lỗi renderer thành đọc/ghi file tuỳ ý.

→ **Prompt 8**.

---

### #16 [Medium] Registry có thể chứa 2 entry cho cùng một thư mục; dedupe tab dựa vào state cũ

- **Nhóm**: Logic bug
- **Vị trí**: `electron/services/projectStore.ts:366`; `src/App.tsx:38-46`
- **Mô tả**: Dedupe bằng `path.resolve(p.path) === resolvedPath` không chuẩn hoá **chữ hoa/thường** (APFS/NTFS không phân biệt) và **symlink** → cùng thư mục có thể thành 2 project id → 2 tab, 2 server cùng chạy trong một thư mục (tranh `node_modules/.vite`, tranh port). `handleOpenProject` kiểm tra `openTabs` từ closure cũ, chỉ nhờ `openingProjectIds` ref che lỗi.
- **Ảnh hưởng**: Tab trùng lặp.

→ **Prompt 9**.

---

### #17 [Medium] Template `hcmut-bach` làm `npm install` rất nặng và cấu hình lẫn lộn

- **Nhóm**: Performance / Maintainability
- **Vị trí**: `electron/templates/hcmut-bach/package.json`; `electron/services/scaffolder.ts:172-183`
- **Mô tả**: Template khai báo `playwright-chromium` trong `devDependencies` (tải Chromium ~150MB khi install) trong khi `ExportDialog` đã có luồng `export:installDeps` cài theo nhu cầu. Scaffolder thêm `dependencies['@slidev/cli']='^53.0.0'` trong khi template đã có `devDependencies['@slidev/cli']='53.0.0'` → khai báo trùng, hai range khác nhau. Template còn là *package theme* (có `peerDependencies`) chứ không phải project Slidev thông thường.
- **Ảnh hưởng**: Tạo dự án/khởi chạy lần đầu chậm; khó dự đoán version.

→ **Prompt 9**.

---

### #18 [Low] Đường dẫn cứng của máy tác giả

- **Vị trí**: `src/pages/HomeDashboard.tsx:119-131` (`/Users/mac/Projects/MySlide/...`); `Rebuild Slidev Studio.command:2` (`cd "/Users/mac/Projects/Slidev"`)
- **Ảnh hưởng**: Nút "quét dự án mẫu" vô dụng trên máy khác; script rebuild hỏng khi di chuyển thư mục.

→ **Prompt 9**.

### #19 [Low] Script `lint`/`format` không chạy được, không có test

- **Vị trí**: `package.json:9-10`
- **Mô tả**: `eslint` và `prettier` không có trong `devDependencies`, không có config; `lint` còn dùng `--fix` (tự sửa file). Không có test nào cho các phần dễ hỏng nhất (port, process, settings merge).

→ **Prompt 9**.

### #20 [Low] `deepMerge` chia sẻ tham chiếu lồng nhau với `DEFAULT_SETTINGS`

- **Vị trí**: `electron/services/projectStore.ts:94-106, 119, 151-154`
- **Mô tả**: `deepMerge` chỉ shallow-copy các key không có trong patch, nên `settings.preview.sourceJump` có thể là *cùng object* với `DEFAULT_SETTINGS.preview.sourceJump`; `sanitizeSettings` sau đó gán trực tiếp lên nó → làm bẩn `DEFAULT_SETTINGS` (ảnh hưởng nút "Reset").

→ **Prompt 9**.

### #21 [Low] Đường dẫn preload webview cứng `.mjs`; PATH ưu tiên Homebrew

- **Vị trí**: `electron/ipc/settings.ipc.ts:66`; `processManager.ts:91-102`
- **Mô tả**: `main.ts` có fallback `.mjs`/`.js` cho preload chính nhưng preload webview thì không. `getEnv()` đặt `/opt/homebrew/bin` *trước* PATH hiện có nên có thể chọn Node của Homebrew thay vì Node người dùng chọn (nvm/volta/fnm).

→ **Prompt 9**.

### #22 [Low] `handleCloseTab` không bắt lỗi; `confirm()` chặn luồng

- **Vị trí**: `src/App.tsx:102-121`
- **Mô tả**: `await api.process.stop()` ném lỗi → tab không đóng. `window.confirm` đồng bộ chặn renderer.

→ **Prompt 5**.

---

## 4. Lộ trình sửa (theo pha)

| Pha | Nội dung | Prompt | Giải quyết | Ước lượng* |
|---|---|---|---|---|
| **P0 — Cầm máu** | Single-instance lock, bỏ `FORCE_COLOR` + stripAnsi, `buffer:false`, sửa `window-all-closed` trên macOS, log chẩn đoán | **1** | #1 (một nửa), #5, #6, #9 | 0.5 ngày |
| **P1 — Port & vòng đời** | PortAllocator; readiness probe; stop/start có generation, chờ exit, hủy install | **2 → 3** | #1, #2, #3, #10 (phần điều kiện cài) | 1.5–2 ngày |
| **P2 — Dọn tiến trình mồ côi** | pidRegistry + reaper, hàng đợi cài đặt, dừng server khi xóa dự án | **4** | #4, #10 | 1 ngày |
| **P3 — Renderer ổn định** | Store process ở App, batch log, Console windowed, `handleCloseTab` bền | **5** | #6, #7, #8, #22 | 1 ngày |
| **P4 — Dữ liệu & Preview** | EditorPane flush/ghi đúng file; webview getURL an toàn, ErrorBoundary, tối ưu preload | **6, 7** | #11, #12, #13, #14 | 1 ngày |
| **P5 — Hardening & dọn nợ** | Ràng buộc IPC, sanitize tên project, chuẩn hoá registry, template, lint/test | **8, 9** | #15–#21 | 1–1.5 ngày |

\* Ước lượng thô cho một người làm với AI hỗ trợ, chưa gồm thời gian thử tay.

**Phụ thuộc giữa các prompt:** 3 cần 1 và 2 · 4 cần 3 · 5 nên làm sau 3 (đổi payload sự kiện) · 6, 7, 8, 9 độc lập, làm bất kỳ lúc nào.

**Quy tắc chung cho mọi prompt** (dán kèm nếu AI hay "sáng tạo"): *không đổi tên kênh IPC hiện có (`process:start|stop|restart|recompile|getStatus`, sự kiện `process:status-changed|log|compile-error`), không đổi schema `AppSettings`/`ProjectItem`, không thêm dependency mới trừ khi prompt nói rõ; sau mỗi thay đổi chạy `npm run typecheck && npx electron-vite build`; giữ nguyên văn phong tiếng Việt của thông báo lỗi hiển thị cho người dùng.*

---

## 5. Prompt cho AI sửa lỗi

> Mỗi prompt tự thân, có thể dán thẳng vào một phiên AI mới có quyền đọc/sửa repo `Slidev/`. Làm lần lượt, review diff và chạy checklist ở mục 6 sau mỗi prompt trước khi sang prompt tiếp.

### Prompt 1 — Cầm máu: single-instance, ANSI, buffer, macOS window-all-closed, log chẩn đoán
*Giải quyết #1 (một phần), #5, #6 (ứng viên 1), #9 · Độc lập — làm đầu tiên.*

````text
Bối cảnh: Slidev Studio là app Electron 31 + electron-vite (main process ESM). Thư mục `electron/` là main process. Hãy sửa các điểm sau, KHÔNG đổi API IPC/preload/settings schema.

1) Single-instance lock — `electron/main.ts`
Hiện chưa có `app.requestSingleInstanceLock()`. Thêm ở đầu file, TRƯỚC khi `registerXxxIpc()` và `app.whenReady()`:
- `const gotLock = app.requestSingleInstanceLock(); if (!gotLock) { app.quit() }` và chỉ khởi tạo phần còn lại khi có lock (dùng `if (!gotLock) { app.quit() } else { ...bootstrap... }`; nhớ rằng `app.quit()` không dừng code chạy tiếp nên phải bọc).
- `app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() } })`.

2) macOS `window-all-closed` — `electron/main.ts` (hiện dòng ~99-108):
```ts
app.on('window-all-closed', async () => {
  try { await processManager.stopAll() } catch (err) { console.error(...) }
  if (process.platform !== 'darwin') { app.quit() }
})
```
Vấn đề: trên macOS đóng cửa sổ (nút đỏ / Cmd+W) giết MỌI dev server dù app vẫn sống. Sửa: handler này KHÔNG được gọi `stopAll()`. Chỉ `if (process.platform !== 'darwin') app.quit()`. Việc dừng server để `before-quit` lo (đã có). Với macOS, khi `activate` tạo lại cửa sổ, renderer khởi động mới — hãy đảm bảo `processManager.getStatus()` vẫn trả trạng thái đúng cho các server còn sống (không cần làm thêm nếu chưa có UI khôi phục tab).

3) Bỏ mã màu ANSI khỏi output
- Xoá `FORCE_COLOR: '1'` ở `electron/services/processManager.ts` (trong `getEnv()`, ~dòng 108), `electron/services/scaffolder.ts` (~dòng 235), `electron/ipc/export.ipc.ts` (~dòng 403 và ~504). Thay bằng `NO_COLOR: '1'`.
- Tạo `electron/utils/ansi.ts` export `stripAnsi(input: string): string` dùng regex chuẩn `/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g` (không thêm dependency).
- Áp dụng `stripAnsi` cho MỌI dòng trước khi `emitLog` (processManager, scaffolder, export). Lý do đã kiểm chứng: với FORCE_COLOR=1 Slidev in `http://localhost:\x1b[1m3030\x1b[22m/` nên regex dò port không khớp.

4) execa: không buffer, đóng stdin — mọi lần spawn dài hạn
Trong `processManager.ts` (install ~dòng 181 và dev server ~dòng 252), `scaffolder.ts` (~230), `export.ipc.ts` (~401, ~502): thêm `buffer: false, stdin: 'ignore'` vào options của `execa(...)`. Lý do: execa mặc định giữ toàn bộ stdout/stderr trong RAM với maxBuffer 100MB và có thể kill tiến trình khi vượt ngưỡng. Lưu ý: `export.ipc.ts` đang dùng `result.stderr/result.stdout` để soạn thông báo lỗi (~dòng 411) — khi `buffer:false` các trường này rỗng, hãy tự gom tối đa ~200 dòng cuối từ stream vào một mảng để dùng cho thông báo lỗi. Với `await proc` trong install, `result.exitCode` vẫn dùng được.

5) Log chẩn đoán cho lỗi "tắt 1 tab tắt hết"
Tạo `electron/utils/diag.ts` export `diag(event: string, data?: Record<string, unknown>)` ghi 1 dòng JSON `{t, event, ...data}` vào `~/.slidev-studio/logs/main.log` (tạo thư mục nếu chưa có; xoay vòng khi >2MB: đổi tên thành main.log.1). Gọi `diag` trong `ProcessManager`: khi spawn (`projectId, pid, port, entryFile, ppid: process.pid`), khi exit (`projectId, pid, code, signal`), khi `stop()` (`projectId, pid, reason` + `new Error().stack` để biết ai gọi), và trong `main.ts` ở `before-quit`, `window-all-closed`, `second-instance`.

Tiêu chí hoàn thành:
- Mở app lần 2 (dev hoặc bản cài) => không có cửa sổ mới, cửa sổ cũ được focus.
- macOS: đóng cửa sổ bằng nút đỏ => `pgrep -fl slidev` vẫn còn các server; Cmd+Q => không còn.
- Log console không còn chuỗi `\x1b[`/`[36m`.
- `npm run typecheck && npx electron-vite build` pass.
````

---

### Prompt 2 — PortAllocator: giữ chỗ, mutex, kiểm nhiều interface, retry
*Giải quyết #2 · Phụ thuộc: Prompt 1.*

````text
Bối cảnh: `electron/services/portFinder.ts` hiện là:
```ts
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}
export async function findFreePort(preferredPort, range, strict) { /* thử preferred rồi quét preferred+1..preferred+range */ }
```
và `processManager.ts` (~dòng 209-224) gọi `findFreePort(preferredPort, serverSettings.portScanRange, serverSettings.strictPort)` rồi spawn Slidev với `--port <port>`.

Lỗi đã tái hiện: (a) Slidev v53 KHÔNG tự nhảy port — khi port bận nó thoát ngay với `Error: Port 3030 is already in use` (exit code 1); (b) `findFreePort` không "giữ chỗ" nên 2 `start()` đồng thời nhận cùng port; (c) chỉ kiểm `127.0.0.1` trong khi Vite bind `localhost` (có thể `::1`) hoặc `0.0.0.0` (LAN mode).

Yêu cầu:
1. Tạo `electron/services/portAllocator.ts` export class `PortAllocator` và singleton `portAllocator`:
   - `private reserved = new Map<number, string>()` (port -> projectId).
   - `async acquire(projectId: string, preferred: number, range: number, strict: boolean, exclude: number[] = []): Promise<number>` chạy TUẦN TỰ qua mutex dạng promise-chain (các lời gọi đồng thời xếp hàng). Bỏ qua port đang `reserved` bởi projectId KHÁC (cùng projectId thì cho phép, vì đó là restart) và các port trong `exclude`. Với mỗi ứng viên gọi `isPortFree(port)`. Khi tìm được thì `reserved.set(port, projectId)` NGAY trong vùng mutex rồi mới return.
   - `strict === true`: chỉ thử `preferred`; nếu bận/đã reserved => throw Error giữ nguyên thông điệp tiếng Việt hiện có: `Cổng ${preferred} đang bị chiếm bởi tiến trình khác. Hãy đổi cổng trong Cài đặt hoặc cấu hình dự án.`. Không strict: quét `preferred+1..min(65535, preferred+range)` như cũ, hết dải thì throw thông điệp hiện có.
   - `release(projectId: string)`: xoá mọi port của projectId. `isReservedBy(port)` để debug.
   - `isPortFree(port)`: thử `listen` trên LẦN LƯỢT `'127.0.0.1'`, `'::1'`, `'0.0.0.0'`. `EADDRINUSE` hoặc `EACCES` => bận (false). `EAFNOSUPPORT`/`EADDRNOTAVAIL` => bỏ qua interface đó (không tính là bận). Luôn `server.close()` và chờ callback trước khi resolve.
2. Giữ `findFreePort` và `isPortAvailable` export trong `portFinder.ts` như wrapper mỏng gọi `isPortFree` (để không vỡ import khác), nhưng `processManager.ts` phải chuyển sang `portAllocator.acquire(...)`.
3. Trong `processManager.ts`: `acquire` trước khi spawn; `release(projectId)` trong exit handler, trong `stop()` sau khi tiến trình đã thoát, và khi `startInternal` ném lỗi trước khi spawn.
4. Retry khi Slidev thoát vì port bận: nếu tiến trình thoát trong khi chưa ready và log (đã `stripAnsi`) chứa `/Port \d+ is already in use/i` và `!strictPort` => `release`, gọi `acquire(..., exclude=[portVừaThất])`, spawn lại, tối đa 3 lần; mỗi lần ghi log `[Slidev Studio] Cổng X bận, thử cổng Y...`. Hết lượt thì báo lỗi như cũ.
5. Cảnh báo cấu hình trùng: trong `projects:updateProject` (hoặc lúc `start`), nếu hai dự án khác nhau có cùng `preferredPort`, ghi một dòng log cảnh báo tiếng Việt vào console của dự án (không chặn).
6. Không đổi chữ ký IPC. Không thêm dependency.

Tiêu chí: mở 3 dự án đồng thời (Promise.all các `process:start`) => nhận 3 port khác nhau; chiếm sẵn 3030 bằng `python3 -m http.server 3030` (và bằng listener `::1` nếu máy hỗ trợ) => dự án nhận 3031; `strictPort=true` + 3030 bận => lỗi rõ ràng, không spawn. Viết unit test (vitest nếu Prompt 9 đã làm, ngược lại script Node thuần trong `scripts/`) cho `acquire` song song.
````

---

### Prompt 3 — ProcessManager: readiness probe, generation, stop chờ exit, hủy install
*Giải quyết #1, #3, #6 (ứng viên 2), #10 (điều kiện cài) · Phụ thuộc: Prompt 1, 2.*

````text
Bối cảnh: `electron/services/processManager.ts` quản lý dev server Slidev bằng `execa` + `tree-kill`. Các lỗi đã xác định (số dòng theo bản hiện tại):

A. Ready-detection (dòng ~262-293, 329-350): dò URL bằng regex trên stdout và có fallback `setTimeout(startupTimeoutMs)` tự đặt `status='running'` mà không kiểm tra server thật. Regex còn cho phép BẤT KỲ dòng nào có `scheme://host:port` ghi đè `instance.port/url` và bật lại `running` kể cả sau `stopped`.
B. `stop()` (dòng ~354-380): nếu đang `installing` (chưa có childProcess) chỉ đổi status rồi return, `npm install` vẫn chạy và sau đó `startInternal` vẫn spawn Slidev (server mồ côi). `treeKill(pid,'SIGKILL')` resolve khi gửi tín hiệu chứ không chờ tiến trình thoát => port chưa nhả.
C. Exit handler (dòng ~306-327) không xoá `instance.pid`/`childProcess` => lần `stop()` sau có thể kill PID đã bị OS tái sử dụng.
D. `restart()`: `await this.stop(); return this.start(...)` — `pendingStarts` (dòng ~28, 118-130) có thể vẫn giữ promise cũ (đã reject) nên restart nhận lại lỗi cũ.
E. Điều kiện "đã cài" (dòng ~165-166) chỉ là `fs.existsSync(node_modules)`; và khi thiếu `node_modules/.bin/slidev` code fallback sang `npx --yes @slidev/cli` (dòng ~230-233, 400-405) tải bản mới nhất không khớp dự án.

Yêu cầu (giữ nguyên IPC contract và kiểu trả về `{ port, url, lanUrl? }`; dùng `portAllocator` từ Prompt 2 và `stripAnsi`/`diag` từ Prompt 1):

1. Thêm vào `ProcessInstance`: `generation: number`, `abort: AbortController`, `installChild?: ExecaChildProcess`. Mỗi lần `startInternal` tạo instance mới với `generation = ++this.genCounter`. TẤT CẢ handler (stdout/stderr/exit/error/timeout) phải bắt `const gen = instance.generation` và bỏ qua nếu `this.instances.get(projectId)?.generation !== gen` hoặc `instance.status === 'stopped'`.
2. Readiness probe thay cho regex+fallback: hàm `waitForReady({ port, child, timeoutMs, signal })` poll mỗi 250ms bằng `net.connect` tới `127.0.0.1:port` rồi (nếu lỗi) `::1:port`; thành công khi kết nối được. Kết thúc khi: connect OK => resolve; child đã thoát => reject với thông báo hiện có `Slidev đã thoát trước khi sẵn sàng (code: …)`; hết `serverSettings.startupTimeoutMs` (chỉ tính từ lúc spawn, KHÔNG tính thời gian install) => kill tree, `status='error'`, message `Slidev không phản hồi sau ${ms} ms.`; signal abort => reject `STOPPED_BY_USER`. Tuyệt đối không đặt `running` theo phỏng đoán. `url = http://localhost:${port}`; `lanUrl` như cũ khi `bindMode==='lan'`.
   Vẫn đọc stdout/stderr để ghi log (đã stripAnsi) và cho `emitCompileError`, nhưng KHÔNG dùng để suy ra port/url/status.
3. `stop(projectId)` viết lại: (a) `instance.abort.abort()`; nếu đang `installing` thì kill process tree của `installChild`; (b) nếu có `pid`: `treeKill(pid,'SIGTERM')`, chờ sự kiện `exit` của `childProcess` tối đa 3000ms (dùng Promise + `once('exit')`), quá hạn thì `treeKill(pid,'SIGKILL')` và chờ exit thêm tối đa 2000ms; (c) xoá `pid`, `childProcess`, `installChild`; (d) `portAllocator.release(projectId)`; (e) `status='stopped'`, `emitStatus`. Idempotent: gọi 2 lần không lỗi, gọi khi chưa start trả `true`. Trước khi kill phải xác minh `childProcess.exitCode === null && !childProcess.killed`, nếu tiến trình đã tự thoát thì KHÔNG gọi treeKill.
4. Exit handler: luôn xoá `pid/childProcess`, `release` port, và nếu thoát bất thường khi đang `running` thì `status='error'` kèm `error`. Thoát do người dùng dừng => `stopped`.
5. `start()/restart()/recompile()`: `restart` và `recompile` phải `await stop()`, sau đó `this.pendingStarts.delete(projectId)` tường minh rồi mới `start(...)`. `startInternal` nếu bị abort (do stop) phải ném `new Error('STOPPED_BY_USER')` (không đặt `error`), và KHÔNG được spawn Slidev sau khi `npm install` kết thúc nếu đã bị abort.
6. Điều kiện cài: thay `fs.existsSync(node_modules)` bằng kiểm tra `node_modules/.bin/slidev(.cmd)` HOẶC `node_modules/@slidev/cli/package.json` tồn tại. Nếu thiếu và `autoInstallDeps` bật => cài; nếu tắt => lỗi hiện có. Sau cài xong mà vẫn thiếu bin => lỗi tiếng Việt: `Cài đặt xong nhưng không tìm thấy Slidev CLI (@slidev/cli). Kiểm tra package.json của dự án.` BỎ fallback `npx --yes @slidev/cli` / `dlx` / `bunx` trong `packageManagerRunner` (xoá hàm nếu không còn nơi dùng; `export.ipc.ts` có bản riêng — để nguyên ở prompt này).
7. Renderer (`src/App.tsx` `handleOpenProject` catch, `ProjectWorkspace.tsx` `startDevServer/restartDevServer/recompileDevServer` catch): nếu `err.message` chứa `STOPPED_BY_USER` thì đặt `status: 'stopped'` và KHÔNG hiển thị lỗi.
8. Giữ `getStatus` trả `ProcessInstance` nhưng loại `childProcess`, `installChild`, `abort` khỏi object gửi qua IPC (không serialize được) — trả một bản sao chỉ gồm các field thuần.

Tiêu chí: mở dự án đã cài => `running` trong < 5s (không còn chờ 20s); Restart 10 lần liên tiếp => port không đổi, không có `slidev` thừa (`pgrep -fl slidev`); bấm Stop/đóng tab khi đang `installing` => không có tiến trình Slidev nào xuất hiện sau đó; tự `kill -9` PID của Slidev => tab chuyển `error`, và bấm Start lại chạy được; log muộn sau Stop không làm status quay lại `running`.
````

---

### Prompt 4 — pidRegistry + reaper, hàng đợi cài đặt, dừng server khi xoá dự án
*Giải quyết #4, #10 (hàng đợi) · Phụ thuộc: Prompt 3.*

````text
Bối cảnh: Slidev Studio (Electron). Hiện chỉ có `before-quit` dọn server; khi app bị kill -9/crash/electron-vite hot-restart main thì các tiến trình `slidev`/vite/esbuild bị bỏ mồ côi và giữ port. `projects:remove` (electron/ipc/projects.ipc.ts) xoá dự án khỏi registry nhưng không dừng server, và `HomeDashboard.handleRemoveProject` (src/pages/HomeDashboard.tsx ~dòng 70) không đóng tab. `npm install` được gọi trực tiếp ở processManager/scaffolder/export nên nhiều dự án mở cùng lúc sẽ chạy song song.

Yêu cầu:
1. `electron/services/pidRegistry.ts`:
   - File `~/.slidev-studio/running.json` dạng `{ entries: [{ pid, projectId, port, appPid, startedAt, cmdHint }] }`. Ghi atomic (ghi file tạm rồi `rename`). API: `add(entry)`, `remove(pid)`, `list()`.
   - `processManager` gọi `add` ngay sau spawn (cmdHint = đường dẫn bin slidev) và `remove` trong exit handler/`stop`.
   - `reapOrphans()` gọi ở `main.ts` sau khi lấy được single-instance lock và trước khi tạo cửa sổ: với mỗi entry có `appPid !== process.pid` và `appPid` KHÔNG còn sống (`try { process.kill(appPid, 0) } catch (e) { e.code === 'ESRCH' }`), kiểm tra PID còn sống và lệnh của nó CÓ chứa 'slidev' (POSIX: `ps -p <pid> -o command=`; Windows: `wmic process where processid=<pid> get commandline` hoặc bỏ qua xác minh và chỉ dùng `taskkill /PID <pid> /T /F` nếu commandline chứa slidev). CHỈ khi xác minh khớp mới `treeKill(pid,'SIGKILL')`. Sau đó xoá entry. Ghi `diag('reap', {...})` cho từng entry.
   - Nếu `settings.server.keepServersOnQuit === true` thì KHÔNG reap các entry (chúng là chủ ý); thay vào đó bỏ qua và ghi log.
2. `electron/services/installQueue.ts`: `installQueue.run<T>(label: string, task: () => Promise<T>): Promise<T>` với concurrency cố định 1 (hằng số `MAX_CONCURRENT_INSTALLS = 1`). Dùng cho: `npm install` trong `processManager.startInternal`, `scaffolder.createProject`, `export:installDeps`. Khi phải chờ, `processManager` phát log `[Slidev Studio] Đang xếp hàng cài dependencies (còn N tác vụ phía trước)...` và giữ status `installing`. Tác vụ trong hàng đợi phải hủy được (nhận `AbortSignal`), để `stop()` từ Prompt 3 rút được khỏi hàng đợi.
3. Dọn khi dev-restart/tín hiệu: trong `main.ts` đăng ký `process.on('SIGTERM'|'SIGINT'|'SIGHUP', ...)` gọi một hàm đồng bộ best-effort `processManager.killAllSync()` (duyệt instances, `process.kill(pid, 'SIGKILL')` bọc try/catch, KHÔNG dùng async) rồi `app.exit(0)`. Thêm `process.on('exit', ...)` tương tự (nhớ chỉ chạy một lần).
4. `projects:remove`: trong handler gọi `await processManager.stop(id)` TRƯỚC `projectStore.removeProject(id)`. Thêm vào preload/`env.d.ts` KHÔNG cần API mới; ở renderer, `App.tsx` truyền prop `onProjectRemoved(id)` xuống `HomeDashboard`, `handleRemoveProject` gọi nó sau khi xoá thành công; `App` đóng tab của dự án đó (không confirm, không gọi stop lần nữa) và xoá id khỏi `localStorage['slidev-studio-open-tabs']`.

Tiêu chí: mở 2 dự án, `kill -9` tiến trình Electron chính, mở lại app => `pgrep -fl slidev` không còn tiến trình cũ và port 3030 trống; mở 3 dự án chưa có node_modules cùng lúc => chỉ 1 `npm install` chạy tại một thời điểm, cái sau hiện trạng thái xếp hàng; xoá dự án đang chạy khỏi Home => server dừng, tab đóng; không bao giờ kill một PID mà lệnh không chứa `slidev`.
````

---

### Prompt 5 — Renderer: process store, batch log, Console windowed, đóng tab bền
*Giải quyết #6 (ứng viên 3), #7, #8, #22 · Nên làm sau Prompt 3.*

````text
Bối cảnh (renderer React 18 + main Electron):
- `electron/services/processManager.ts` `emitLog` (dòng ~56-74) gửi MỖI DÒNG log một IPC `process:log`.
- `src/pages/ProjectWorkspace.tsx` (dòng ~162-205) đăng ký `api.process.onStatusChange/onLog/onCompileError` trong một `useEffect` phụ thuộc `[onUpdateTab]`, và mỗi log gọi `onUpdateTab(id, prev => ({...prev, logs: [...prev.logs, x].slice(-1500)}))`.
- `src/App.tsx`: `handleUpdateTab` (dòng ~123) không được memo hoá; `handleCloseTab` (dòng ~102-121) không try/catch và gọi `setView`/`setActiveTabId` bên trong updater của `setOpenTabs`.
- `src/components/ProcessConsole.tsx` render tới 1500 `<div key={index}>` và đặt `scrollTop = scrollHeight` sau mỗi thay đổi `logs`.
Hậu quả: khi log dày (npm install, lỗi Vite) UI đơ; khi ở Home/Settings thì mất sự kiện status/log nên tab hiển thị trạng thái sai.

Yêu cầu:
1. Main — batch log: trong `ProcessManager` gom log theo project vào buffer, flush mỗi 100ms (setTimeout tự lên lịch, không setInterval vô hạn) bằng MỘT IPC `process:log-batch` với payload `{ projectId, lines: [{ text, type, time, seq }] }` (seq tăng dần theo project). Vẫn giữ ring buffer 1500 dòng trong `instance.logs`. Thêm IPC `process:getLogs(projectId) => lines[]` và expose trong `electron/preload.ts` + `src/env.d.ts` + fallback trong `src/ipc-client.ts` (`onLogBatch`, `getLogs`). Giữ `process:log` cũ nếu còn nơi dùng, nhưng renderer mới dùng batch.
2. Renderer — store: tạo `src/state/processStore.ts` (không thêm dependency, dùng `useSyncExternalStore`): giữ `Map<projectId, { status, port, url, lanUrl, error, compileError, logs: LogLine[], logCount }>`. `logs` là ring buffer 1500 (mutable + phát `version` để notify). API: `processStore.subscribe`, `getSnapshot`, `useProcessState(projectId)` (selector, chỉ render lại khi state của project đó đổi), `useProcessLogs(projectId, enabled)` (chỉ subscribe log khi Console đang mở; khi đóng chỉ cập nhật `logCount`), `clearLogs(projectId)`.
3. Đăng ký MỘT LẦN ở `App` (useEffect deps `[]`): `onStatusChange`, `onLogBatch`, `onCompileError` cập nhật `processStore`. Khi `App` mount (và khi mở tab) gọi `api.process.getStatus(id)` + `getLogs(id)` để đồng bộ. XOÁ toàn bộ effect subscribe ở `ProjectWorkspace` (dòng ~162-205); `OpenTab` chỉ giữ `project, activeEntryFile, activeFilePath` (bỏ `status/serverPort/serverUrl/lanUrl/logs/error` khỏi state React — đọc từ store). Cập nhật mọi chỗ đang đọc `currentTab.status/serverUrl/logs/...` (ProjectWorkspace, PreviewPane props, thanh tab) sang `useProcessState`.
4. `handleUpdateTab` bọc `useCallback` với deps rỗng (dùng functional setState).
5. `handleCloseTab`: đưa thành hàm tuần tự an toàn: (a) confirm nếu cần; (b) `try { if (settings.server.stopServerOnTabClose) await api.process.stop(id) } catch (e) { console.warn(...) } finally { ... }` LUÔN gỡ tab dù stop lỗi; (c) tính `nextActiveId` và `nextView` từ mảng tabs hiện tại (dùng ref `openTabsRef` cập nhật mỗi render) rồi gọi `setOpenTabs(filter)` riêng, `setActiveTabId`, `setView` NGOÀI updater. Thay `window.confirm` đồng bộ bằng một modal xác nhận nhỏ của app (state `closingTabId`).
6. `ProcessConsole`: chỉ render 500 dòng cuối (nút "Hiện thêm" mở rộng thêm 500), `key = seq`, KHÔNG set `scrollTop` mỗi lần đổi mà dùng `requestAnimationFrame` và chỉ khi người dùng đang ở đáy (theo dõi `onScroll`, ngưỡng 24px); giữ nút Copy (copy toàn bộ ring buffer) và Xoá.
7. `compileError` không bắt buộc sửa ở prompt này.

Tiêu chí: chạy `npm install` lớn trong một dự án — CPU renderer không tăng vọt, gõ trong Monaco vẫn mượt; sang Home/Settings rồi quay lại Workspace — trạng thái và log đúng, kể cả khi server crash trong lúc đó; đóng tab khi `process:stop` bị lỗi vẫn đóng được; số lần re-render của `ProjectWorkspace` khi có log là 0 nếu Console đang đóng (kiểm bằng React Profiler).
````

---

### Prompt 6 — EditorPane: không mất dữ liệu, ghi đúng file
*Giải quyết #11 · Độc lập.*

````text
Bối cảnh: `src/components/EditorPane.tsx`. Lỗi đã xác định:
1. Effect nạp file (dòng ~128-155) có cleanup `if (debounceTimerRef.current) clearTimeout(...)`. Khi `filePath` đổi hoặc component unmount trong vòng `autoSaveDelayMs` (mặc định 600ms) sau khi sửa, thay đổi chưa lưu bị BỎ, và `isDirty` bị reset khi nạp file mới.
2. `currentContentRef` (dòng ~79, 141, 202) không được reset khi đổi file: trong lúc file mới đang nạp, Cmd+S (handler `window` dòng ~188-198) hoặc timer còn sót gọi `saveFile(currentContentRef.current)` với `filePath` MỚI => ghi nội dung file CŨ vào file mới.
3. `saveFile` (dòng ~164-178) chỉ `console.error` khi lỗi ghi, UI vẫn coi như ổn.
4. `fs:writeFile` ở `electron/ipc/fs.ipc.ts` ghi trực tiếp, không atomic.

Yêu cầu:
1. Thêm `contentPathRef` = đường dẫn của file mà `currentContentRef` đang giữ nội dung; cập nhật khi nạp xong và khi người dùng gõ. `saveFile(text, targetPath = filePathRef.current)` chỉ ghi khi `targetPath === contentPathRef.current` và `!loadingRef.current`; ngược lại bỏ qua (log warn).
2. Trong cleanup của effect đổi file và trong effect unmount: nếu `isDirtyRef.current` thì gọi NGAY `api.fs.writeFile(prevPath, currentContentRef.current)` (fire-and-forget nhưng gắn `.catch` báo lỗi) với `prevPath` lấy từ ref TRƯỚC khi đổi. Chỉ sau đó mới reset `isDirty` và nạp file mới. Không gọi `saveFile` closure cũ.
3. Thêm flush khi cửa sổ sắp đóng/ẩn: `window.addEventListener('beforeunload'|'pagehide'|'visibilitychange')` gọi cùng hàm flush nếu dirty.
4. `saveStatus` thêm giá trị `'error'`: khi ghi lỗi giữ `isDirty=true`, hiển thị chip đỏ `Lưu thất bại: <message>` với nút "Thử lại"; autosave thử lại sau 3s tối đa 3 lần.
5. Main: `fs:writeFile` ghi vào `${filePath}.tmp-<pid>` rồi `fs.rename` sang đích (cùng thư mục); nếu lỗi thì xoá file tạm và ném lỗi.
6. Không đổi props công khai của `EditorPane`.

Tiêu chí: gõ một ký tự rồi chuyển file trong <100ms => file cũ chứa ký tự đó; chuyển file rồi nhấn Cmd+S ngay lập tức => file mới không bị ghi đè bằng nội dung file cũ; chuyển tab/Home ngay sau khi gõ => nội dung được lưu; rút quyền ghi file (chmod 444) => UI báo lỗi lưu thay vì "Đã lưu".
````

---

### Prompt 7 — Preview/webview: getURL an toàn, ErrorBoundary, tối ưu preload, lọc lỗi biên dịch
*Giải quyết #12, #13, #14 · Độc lập.*

````text
Bối cảnh:
- `src/components/PreviewPane.tsx` gọi `webviewRef.current.getURL()` ở dòng ~56 (`getCurrentSuffix`) và ~86 (effect nạp URL) mà không bảo đảm webview đã `dom-ready` — Electron ném lỗi nếu gọi quá sớm, và toàn app không có ErrorBoundary nên exception làm trắng màn hình.
- `electron/webview-preload.ts`: (a) `MutationObserver` (dòng ~297) gọi `requestAnimationFrame(applyPageMode)` cho MỌI mutation ở chế độ scroll; `applyPageMode` tạo lại `IntersectionObserver` và gọi `scrollIntoView` về slide hiện tại (dòng ~146) => giật trang, layout thrash; (b) `pointermove` (dòng ~263, ~286) chạy `document.querySelectorAll('[data-studio-jump-hover]')` mỗi sự kiện; (c) `gotoSlide` paged dùng `location.href = ...` (dòng ~153) tải lại cả SPA; (d) handler `wheel` luôn `preventDefault()` khi paged (dòng ~187-197) nên không cuộn được nội dung dài trong slide.
- `electron/services/processManager.ts` dòng ~268: `/(\berror\b|internal server error|pre-transform error)/i` khớp mọi dòng có chữ "error" (ví dụ "0 errors") => banner "Lỗi biên dịch" giả.

Yêu cầu:
1. PreviewPane: thêm `domReadyRef` (đặt true khi sự kiện `dom-ready`, false khi webview đổi `src`/unmount) và hàm `safeGetURL()` trả `''` nếu chưa ready hoặc có exception (bọc try/catch). Dùng ở cả `getCurrentSuffix` và effect. Các gọi `webview.send/reload/sendInputEvent/getURL` khác cũng đi qua helper `withGuest(fn)` bắt exception.
2. Tạo `src/components/ErrorBoundary.tsx` (class component) bọc `ProjectWorkspace` trong `App.tsx`, và bọc riêng `PreviewPane`. Fallback tiếng Việt: thông báo lỗi ngắn + nút "Tải lại giao diện" (reset state boundary) và "Sao chép chi tiết".
3. webview-preload:
   a. MutationObserver: debounce 150ms bằng timer (không rAF liên tục), chỉ chạy lại `applyPageMode` khi SỐ LƯỢNG node slide (`findSlides().length`) thay đổi so với lần trước; tách một tham số `scrollToCurrent` — chỉ `scrollIntoView` khi người dùng đổi chế độ hoặc gọi `studio:goto`, KHÔNG khi chỉ có mutation.
   b. `pointermove`: dùng `requestAnimationFrame` throttle và biến `lastHover: HTMLElement | null`; chỉ bỏ attribute ở `lastHover` thay vì `querySelectorAll`.
   c. `gotoSlide` paged: ưu tiên `app.__vue_app__.config.globalProperties.$router.push('/' + no)` (trong try/catch); fallback `location.href` như cũ.
   d. `wheel` paged: nếu `event.target.closest(...)` là phần tử cuộn được (`scrollHeight > clientHeight` và `overflow-y` là auto/scroll) thì KHÔNG `preventDefault` và không điều hướng slide.
4. processManager: chỉ phát `emitCompileError` cho dòng thoả `/(\[vite\][^\n]*(error|failed)|Internal server error|Pre-transform error|SyntaxError|Failed to resolve)/i` VÀ không thoả `/\b(0|no) errors?\b/i`; cắt message 500 ký tự như cũ. Renderer chỉ xoá `compileError` khi có dòng `hmr update` hoặc khi `status` chuyển `starting`.

Tiêu chí: chuyển tab/restart nhanh 20 lần không trắng màn hình; deck 100 slide ở chế độ cuộn dọc cuộn mượt, CPU webview thấp khi HMR; nhảy slide ở chế độ paged không tải lại trang; dòng log chứa "0 errors" không hiện banner.
````

---

### Prompt 8 — Hardening: ràng buộc IPC, openExternal, sanitize tên project
*Giải quyết #15 · Độc lập.*

````text
Bối cảnh: các IPC nhận đường dẫn tuỳ ý từ renderer, và vài chỗ tin dữ liệu người dùng:
- `electron/ipc/fs.ipc.ts`: `fs:readFile`, `fs:writeFile`, `fs:listTree`, `fs:showInFolder` (dòng ~49-67) không giới hạn đường dẫn.
- `electron/ipc/export.ipc.ts`: `export:run/runBatch/checkDeps/installDeps` nhận `projectPath` tuỳ ý.
- `electron/main.ts` ~dòng 52-55: `setWindowOpenHandler` gọi `shell.openExternal(details.url)` với mọi scheme.
- `electron/ipc/projects.ipc.ts` ~dòng 214: `projects:updateProject(id, partial)` áp toàn bộ `partial` (có thể đổi `path`, `id`).
- `electron/services/scaffolder.ts`: `path.join(targetDir, name)` (dòng ~148) không kiểm tra `name`; bộ lọc copy `!src.includes('node_modules') && !src.includes('.git')` (dòng ~155) loại mọi đường dẫn chứa chuỗi `.git` (kể cả `.github`, `.gitignore`).
- `src/components/PreviewPane.tsx` ~dòng 188: `<webview allowpopups={true} ...>`.

Yêu cầu:
1. `electron/utils/pathGuard.ts`: `assertInsideAllowedRoot(target: string)` — `fs.realpathSync` (fallback `path.resolve` nếu file chưa tồn tại thì realpath thư mục cha) rồi kiểm tra nằm trong ít nhất một `project.path` (đã realpath) của `projectStore.getProjects()` HOẶC trong `projectStore.getConfigDir()` (chỉ cho đọc). So sánh có phân biệt hoa/thường theo nền tảng (không phân biệt trên darwin/win32). Từ chối `..` thoát gốc và symlink thoát gốc. Ném Error tiếng Việt `Đường dẫn nằm ngoài các dự án đã đăng ký`.
   Áp dụng cho 4 handler fs và cho `projectPath` của export (`export:*`); `scaffold:create` dùng `targetDir` do người dùng chọn qua dialog nên không áp dụng, nhưng phải kiểm tra bên dưới.
2. `setWindowOpenHandler`: chỉ `shell.openExternal` khi `new URL(url).protocol` là `http:` hoặc `https:`; scheme khác thì bỏ qua và `diag('blocked-open', {url})`. Luôn `return { action: 'deny' }`.
3. `projects:updateProject`: whitelist field `preferredPort` (số nguyên 1024–65535 hoặc `undefined`), `name` (chuỗi 1–100 ký tự), `entryFiles` (mảng chuỗi là tên file `.md` không chứa `/`, `\`, `..`). Field khác bị bỏ qua.
4. Scaffolder: validate `name` bằng `/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/` (báo lỗi tiếng Việt nếu sai); sau `path.join`, kiểm `path.resolve(projectPath).startsWith(path.resolve(targetDir) + path.sep)`. Bộ lọc copy chỉ loại khi `path.basename(src)` là `node_modules` hoặc `.git` (so sánh bằng, không phải `includes`); GIỮ `.gitignore`.
5. Bỏ thuộc tính `allowpopups` khỏi `<webview>`; thêm `partition="persist:slidev-preview"`.
6. Không thay đổi hành vi hợp lệ hiện có (mở dự án, sửa file trong dự án, export vào thư mục con của dự án hoặc đường dẫn tuyệt đối do người dùng đặt trong cài đặt — với export, thư mục đầu ra tuyệt đối vẫn được phép nhưng `projectPath` phải hợp lệ).

Tiêu chí: gọi thử `window.api.fs.readFile('/etc/hosts')` từ DevTools => bị từ chối; `window.open('file:///etc/passwd')`/`smb://...` không mở; tạo dự án tên `../evil` => báo lỗi; template vẫn giữ `.gitignore`; sửa file trong dự án và export vẫn chạy bình thường.
````

---

### Prompt 9 — Dọn nợ: env dùng chung, registry, template, lint/test, đường dẫn cứng
*Giải quyết #16–#21 · Độc lập (nên làm cuối).*

````text
Bối cảnh: Slidev Studio (Electron + React). Các mục cần dọn:

1. Env dùng chung: logic dựng PATH/env lặp ở `processManager.ts getEnv()` (dòng ~89-110), `scaffolder.ts` (~218-236) và `export.ipc.ts getEnvPath()` (~291-302). Tạo `electron/utils/env.ts` export `buildEnv(settings)`: thứ tự PATH = `[settings.system.nodePathOverride, ...PATH hiện có, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']` (lọc rỗng, loại trùng) — tức Homebrew đặt SAU PATH hiện có để không đè Node do nvm/volta/fnm của người dùng. Thêm `NO_COLOR: '1'` và `npm_config_registry` khi có `settings.server.registry`. Dùng ở cả 3 nơi.

2. Chuẩn hoá registry: `projectStore.addProjectFromFolder` (dòng ~358-388) so sánh `path.resolve(p.path) === resolvedPath`. Đổi sang so sánh theo `realpath` và không phân biệt hoa/thường trên darwin/win32 (hàm `samePath(a,b)`). Khi khởi tạo `init()`, gộp các entry trùng đường dẫn (giữ entry có `lastOpenedAt` mới nhất, giữ `preferredPort` nếu có) và `save()`. Ở `App.tsx handleOpenProject`, dedupe tab bằng `openTabsRef` (không dùng closure cũ).

3. Template `hcmut-bach` (`electron/templates/hcmut-bach/package.json`): xoá `playwright-chromium` khỏi `devDependencies` (ExportDialog đã có luồng `export:installDeps` cài theo nhu cầu). Trong `scaffolder.createProject` (dòng ~172-183), khi đặt `dependencies['@slidev/cli']`, đồng thời `delete packageJson.devDependencies['@slidev/cli']` để không khai báo trùng hai range. Thêm README ngắn trong `electron/templates/hcmut-bach` (hoặc comment ở scaffolder) giải thích template này là "package theme + example.md".

4. Đường dẫn cứng: xoá nút/hàm `handleScanSampleProjects` trong `src/pages/HomeDashboard.tsx` (dòng ~119-131 và nút ~dòng 286) hoặc thay bằng nút "Thêm thư mục dự án…" mở dialog; đổi placeholder `/Users/mac/SlidevProjects` (dòng ~355) thành placeholder trung tính. Sửa `Rebuild Slidev Studio.command` dòng 2 thành `cd "$(dirname "$0")"`. Trong `scripts/install-mac-app.sh` thêm ở đầu: nếu app đang chạy (`pgrep -x "Slidev Studio"`) thì `osascript -e 'quit app "Slidev Studio"'` và chờ tối đa 10s trước khi `rm -rf` bản trong /Applications.

5. Lint/test: thêm devDependencies `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react-hooks`, `prettier`, `vitest` + file cấu hình tối thiểu (`eslint.config.js` flat config, `.prettierrc`, `vitest.config.ts`). Sửa script `lint` bỏ `--fix` (thêm `lint:fix` riêng), thêm `"test": "vitest run"`. Viết test cho: `stripAnsi`, `PortAllocator.acquire` song song, `ProjectStore.deepMerge/sanitizeSettings`, `samePath`, và `waitForReady` (dùng `net.createServer` giả). Bật rule `react-hooks/exhaustive-deps` ở mức warn.

6. `deepMerge` (`projectStore.ts` dòng ~94-106): không được chia sẻ tham chiếu lồng nhau với `DEFAULT_SETTINGS`. Dùng `structuredClone(DEFAULT_SETTINGS)` làm base trong constructor, `sanitizeSettings`, `resetSettings`; test rằng sau `sanitizeSettings` thì `DEFAULT_SETTINGS.preview.sourceJump` không bị đổi.

7. Preload webview: `electron/ipc/settings.ipc.ts` dòng ~66 hard-code `../preload/webview.mjs`. Thêm fallback: nếu `.mjs` không tồn tại thì dùng `webview.js`, giống cách `main.ts` xử lý preload chính.

Tiêu chí: `npm run lint`, `npm test`, `npm run typecheck`, `npx electron-vite build` đều pass; thêm cùng một thư mục dự án bằng hai kiểu viết hoa/thường không tạo entry thứ hai; tạo dự án từ template `hcmut-bach` không tải Chromium; script rebuild chạy được từ thư mục bất kỳ.
````

---

## 6. Checklist kiểm thử (chạy sau mỗi pha)

| # | Kịch bản | Kỳ vọng | Sau prompt |
|---|---|---|---|
| T1 | Mở dự án đã cài dependencies | Chuyển `running` **< 5 giây**; console không có mã `\x1b[`/`[36m` | 1, 3 |
| T2 | Mở 3 dự án cùng lúc (hoặc bật `restoreTabsOnLaunch`) | 3 port khác nhau (3030/3031/3032), không tab nào báo "Port already in use" | 2 |
| T3 | Chiếm 3030 bằng `python3 -m http.server 3030` rồi mở dự án | Dự án tự dùng 3031; với `strictPort` → báo lỗi rõ ràng, không spawn | 2 |
| T4 | Restart một dự án 10 lần liên tiếp | Port giữ nguyên, `pgrep -fl slidev` không có tiến trình thừa | 3 |
| T5 | Mở app lần 2 (dev + bản cài, hoặc double-click) | Không có instance thứ 2; cửa sổ cũ được focus | 1 |
| T6 | Đóng tab A khi tab B đang chạy | B vẫn `running` (`lsof -i :<portB>` còn LISTEN) | 3, 5 |
| T7 | macOS: đóng cửa sổ bằng nút đỏ, mở lại từ Dock | Server vẫn sống; **Cmd+Q** thì không còn tiến trình `slidev`/`node` nào | 1 |
| T8 | Bấm Stop/đóng tab khi đang `installing` | Không có Slidev nào được spawn sau đó | 3 |
| T9 | `kill -9` tiến trình Electron chính rồi mở lại | Reaper dọn sạch orphan; 3030 trống | 4 |
| T10 | Mở 3 dự án chưa có `node_modules` | Chỉ 1 `npm install` chạy tại một thời điểm | 4 |
| T11 | Chạy `npm install` lớn, vừa gõ trong Monaco | Gõ vẫn mượt; Console ≤ 500 dòng render; CPU renderer thấp | 5 |
| T12 | Vào Settings, để server crash, quay lại | Tab hiển thị đúng `error`/`stopped` | 5 |
| T13 | Gõ rồi chuyển file trong < 100ms; nhấn Cmd+S ngay sau khi chuyển | Nội dung được lưu đúng file, không ghi đè nhầm | 6 |
| T14 | Chuyển tab/restart nhanh 20 lần | Không trắng màn hình | 7 |
| T15 | Chạy 30 phút với 3 dự án, quan sát RAM của main | Không tăng đều đặn | 1 (`buffer:false`) |

Nếu sau Prompt 1–5 vẫn còn "tắt 1 tab tắt hết", gửi lại `~/.slidev-studio/logs/main.log` (có `pid/ppid/reason/stack` của từng lần `stop`) để khoanh vùng tiếp.

---

## 7. Điểm mạnh / điều đang làm tốt

- Code **biên dịch sạch** (typecheck + build đều pass) và phân tầng rõ: `ipc/` mỏng, `services/` chứa logic, preload chỉ expose API cần thiết qua `contextBridge` với `contextIsolation: true`, `nodeIntegration: false`.
- `projectStore.sanitizeSettings` kiểm tra kiểu/miền giá trị rất kỹ và có migrate cài đặt v1 kèm bản sao lưu `.bak-v1`.
- Có nhiều ý tưởng tốt đã sẵn: `pendingStarts` chống start trùng, `tree-kill` để dọn cây tiến trình, `safeOutputName` chặn path traversal khi export, sanitize tên theme khi scaffold, autosave có debounce, khôi phục slide sau restart, `react-resizable-panels` lưu layout theo dự án.
- Thư mục `plan/` ghi lại kiến trúc và lộ trình rõ ràng — thuận lợi cho việc giao việc cho AI.

## 8. Giới hạn của review này

- **Không chạy được GUI Electron** (sandbox không có màn hình): các kết luận về `<webview>`, Monaco, tab UI, macOS `window-all-closed` là từ đọc code, chưa xác nhận bằng cách chạy app.
- **Đã tái hiện thật** (Slidev v53.0.0, Node trong sandbox, Linux): #1 (regex + ANSI) và cơ chế port bận ở #2; đã loại trừ giả thuyết treo do prompt stdin. Chưa thử lại sau khi bỏ `FORCE_COLOR` — Prompt 1 yêu cầu xác nhận log sạch ANSI, và Prompt 3 không phụ thuộc vào điều đó (dùng readiness probe).
- **Chưa tái hiện, chỉ suy luận**: #3.3 (PID bị tái sử dụng), #6 ("tắt 1 tab tắt hết" — chưa tìm được nguyên nhân duy nhất), #9 (execa `maxBuffer`; cần chạy dài để thấy), #12 (`getURL` trước `dom-ready` trên Electron 31), các con số hiệu năng ở #7/#13. Nên đo lại sau khi sửa (mục 6).
- **Chỉ lướt qua**: `NewProjectWizard`, `ExportDialog`, `SettingsPage`, `FileTree`, hệ thống theme (`src/themes/`), `sourceLocator/slideIndex`, và nội dung các template Slidev. Có thể còn lỗi ở đó.
- Không kiểm tra Windows/Linux; các lệnh `ps`/`taskkill` trong Prompt 4 cần thử trên từng nền tảng bạn hỗ trợ.
- Số dòng tham chiếu theo bản zip `Slidev_clean_20260929_120839`; sau khi áp Prompt 1 các số dòng sẽ lệch — các prompt đã mô tả kèm đoạn code để AI tự định vị.
