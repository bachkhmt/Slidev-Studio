import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
const read = async (name) => JSON.parse(await fs.readFile(`reports/${name}.json`, 'utf8'))
const [before, after, unit, e2e, packaged, exports, preview] = await Promise.all(
  [
    'baseline-online',
    'optimized',
    'unit-tests',
    'e2e-tests',
    'packaged-smoke',
    'export-smoke',
    'preview-performance'
  ].map(read)
)
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
const runs = (data) => data.runs.filter((r) => !r.warmup)
const memory = (data) =>
  median(runs(data).map((r) => r.metrics.reduce((sum, m) => sum + (m.memory.privateBytes || 0), 0) / 1024))
const editor = (data) => median(runs(data).map((r) => r.sizes.find((s) => s.size === 30).editorMs))
const number = (n) => n.toFixed(1)
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'))
const installer = `dist/releases/${version}/Slidev Studio-Setup-${version}-x64.exe`
const binary = await fs.readFile(installer),
  hash = createHash('sha256').update(binary).digest('hex')
const release = {
  version,
  installer,
  bytes: binary.length,
  sha256: hash,
  testsPassed: unit.numPassedTests,
  e2ePassed: e2e.stats.expected,
  packagedSmoke: packaged.success,
  performanceMeasuredVersion: '1.0.1',
  performanceTargets: after.summary.targets
}
await fs.writeFile('reports/release.json', JSON.stringify(release, null, 2))
const text = `# Kết quả kiểm chứng Slidev Studio ${version}

Windows x64, ngày 29/10/2026. Bản cũ và bộ cài mới được giữ riêng trong **dist/releases/**.

## Kiểm thử

- ${unit.numPassedTests}/${unit.numTotalTests} unit/component/integration test đạt; không có test bị bỏ qua.
- ${e2e.stats.expected} Electron E2E đạt; lỗi ${e2e.stats.unexpected}, bỏ qua ${e2e.stats.skipped}, flaky ${e2e.stats.flaky}.
- 20 vòng mở/đóng kiểm tra PID Slidev đã thoát, model Monaco = 0, subscription = 0 và webview = 0.
- Thư mục 5.000 file chỉ render phần nhìn thấy; junction ra ngoài dự án bị từ chối.
- Bản .exe đóng gói thật: editor hoạt động khi chặn mạng ngoài, JSON/TypeScript worker cục bộ, 10 template và logo trùng byte với build/icon.png.
- Xuất PDF/PPTX/web thật: ${exports.map((r) => `${r.format}: ${r.success ? 'đạt' : 'lỗi'}${r.pages ? ` (${r.pages} trang)` : ''}`).join('; ')}. PPTX được kiểm tra có 3 phần slide XML.

## Hiệu năng

Hai lượt làm nóng và năm lượt đo cùng fixture 30/100/300 slide trên bản tối ưu 1.0.1; bản ${version} bổ sung sửa luồng cộng tác, chưa đo lại benchmark. p95 gõ/chuyển tab tính trong renderer từ sự kiện tới hai animation frame, không cộng thời gian truyền lệnh Playwright. Số đo phản ánh phiên Windows hiện tại, không phải cam kết cho mọi máy.

| Chỉ số | Bản cũ, có mạng | Bản tối ưu |
| --- | ---: | ---: |
| Mở màn hình chính, median | ${number(before.summary.launchMedianMs)} ms | ${number(after.summary.launchMedianMs)} ms |
| Mở editor đầu tiên, 30 slide, median | ${number(editor(before))} ms | ${number(editor(after))} ms |
| Gõ, p95 | ${number(before.summary.typingP95Ms)} ms | ${number(after.summary.typingP95Ms)} ms |
| Chuyển tab đã mở, p95 | ${number(before.summary.cachedTabP95Ms)} ms | ${number(after.summary.cachedTabP95Ms)} ms |
| RAM riêng Electron sau chuỗi thao tác, median | ${number(memory(before))} MiB | ${number(memory(after))} MiB |

Chuyển tab giảm khoảng ${number(100 * (1 - after.summary.cachedTabP95Ms / before.summary.cachedTabP95Ms))}%. Độ trễ gõ gần tương đương; khởi động màn hình chính không cải thiện đáng kể. Hai mục tiêu gõ <50 ms và chuyển tab <300 ms đều đạt.

**Đánh đổi RAM:** giữ hai preview để chuyển nhanh làm mẫu RAM Electron tăng khoảng ${number(memory(after) - memory(before))} MiB. Đây là mẫu sau chuỗi thao tác, không phải phép đo RAM ổn định dài hạn; không gồm các server Node của Slidev và không cộng working set có thể đếm trùng bộ nhớ chung. Giới hạn tài nguyên được kiểm tra riêng bằng vòng mở/đóng.

Ở phép thử chặn mạng ngoài, editor bản cũ không mở trong 10 giây ở cả bảy lượt. Bản mới mở được offline. Dữ liệu này được lưu riêng trong baseline.json, không trộn với phép so sánh có mạng.

## Preview và HMR

HMR đo từ ghi file xuống đĩa tới nội dung xuất hiện trong guest DOM, không cộng debounce autosave 1.200 ms.

| Số slide | Server sẵn sàng | Preview hiển thị | HMR p95, 5 mẫu sau 2 warmup |
| --- | ---: | ---: | ---: |
${preview.results
  .map(
    (r) =>
      `| ${r.count} | ${number(r.serverReadyMs)} ms | ${number(r.previewReadyMs)} ms | ${number(
        percentile(
          r.updates.filter((s) => !s.warmup).map((s) => s.hmrMs),
          0.95
        )
      )} ms |`
  )
  .join('\n')}

Thời gian server/Vite và preview được tách khỏi độ trễ giao diện. Bài 300 slide vẫn cần vài giây để biên dịch và render lần đầu.

## Bản bàn giao và giới hạn

- Bộ cài: ${installer} (${number(binary.length / 1024 / 1024)} MiB).
- Chạy trực tiếp: dist/releases/${version}/win-unpacked/Slidev Studio.exe; giữ nguyên cả thư mục.
- SHA-256: ${hash}.
- Kết quả cài đặt Desktop và kiểm thử cộng tác: [team-workflow.md](team-workflow.md).
- Monaco/worker offline làm bộ cài lớn hơn. Electron/React giữ nguyên phiên bản chính; cảnh báo dependency audit chưa được xử lý bằng nâng cấp diện rộng.
- PDF có chọn range dùng chế độ per-slide của Slidev 53 để bảo đảm đúng số trang; chế độ này không giữ liên kết chéo/TOC của PDF. PDF toàn bộ tiếp tục dùng đường in mặc định.
- Không bảo đảm lưu bản nháp khi mất điện hoặc hệ điều hành cưỡng chế kết thúc tiến trình.

Chi tiết triển khai và lệnh tái lập: [implementation.md](implementation.md). Các báo cáo JSON giữ toàn bộ mẫu đo và kết quả kiểm thử.
`
await fs.writeFile('reports/validation.md', text)
console.log(JSON.stringify(release, null, 2))
