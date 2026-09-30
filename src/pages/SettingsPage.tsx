import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Search, Palette, Code2, MonitorPlay, Server, FileOutput, FolderKanban,
  Wrench, Keyboard, RotateCcw, RotateCw, FolderOpen, Download, Upload, Cpu, Terminal
} from 'lucide-react'
import api from '../ipc-client'
import { useSettings } from '../settings/SettingsContext'
import { themes } from '../themes/registry'
import { DEFAULT_SETTINGS, type AppSettings, type SettingsGroup } from '../../shared/settings'

type Group = SettingsGroup | 'shortcuts'
const groups: Array<{ id: Group; title: string; detail: string; icon: React.ReactNode }> = [
  { id: 'appearance', title: 'Giao diện', detail: 'theme màu, zoom, font giao diện', icon: <Palette /> },
  { id: 'editor', title: 'Trình soạn thảo', detail: 'monaco, tự lưu, font chữ, minimap', icon: <Code2 /> },
  { id: 'preview', title: 'Xem trước', detail: 'cuộn, slide, click-to-source', icon: <MonitorPlay /> },
  { id: 'server', title: 'Máy chủ & Kết nối', detail: 'port, lan, package manager, timeout', icon: <Server /> },
  { id: 'export', title: 'Xuất file', detail: 'định dạng, thư mục, tùy chọn', icon: <FileOutput /> },
  { id: 'projects', title: 'Dự án & Template', detail: 'workspace, tác giả, slidev cli, tab', icon: <FolderKanban /> },
  { id: 'system', title: 'Hệ thống', detail: 'node, chẩn đoán, cài đặt json', icon: <Wrench /> },
  { id: 'shortcuts', title: 'Phím tắt', detail: 'bảng phím tắt hiện có', icon: <Keyboard /> }
]
const searchTerms: Record<Group, string> = {
  appearance: 'theme sáng tối hệ thống cặp zoom giao diện font source sans inter',
  editor: 'cỡ chữ font ligature số dòng minimap wrap tab whitespace autosave độ trễ monaco theme',
  preview: 'điều hướng trang cuộn dọc ngang wheel snap khoảng cách fit color scheme slide source click alt ctrl flash sync',
  server: 'port cổng quét strict bind lan mật khẩu remote open timeout cli package manager registry dependencies dừng tab thoát restart',
  export: 'định dạng pdf png pptx markdown thư mục xuất dark click nền mở folder',
  projects: 'workspace thư mục tác giả author cli git tab template xác nhận đóng',
  system: 'node git playwright log chẩn đoán config json export import reset phiên bản',
  shortcuts: 'phím tắt keyboard cmd ctrl lưu slide trước sau source'
}

const controlClass = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500'
const buttonClass = 'inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700'

export const SettingsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { settings, ready, previewTheme, update, reset } = useSettings()
  const [active, setActive] = useState<Group>('appearance')
  const [query, setQuery] = useState('')
  const [snapshot, setSnapshot] = useState<AppSettings | null>(null)
  const [diagnostics, setDiagnostics] = useState<{ node?: string; git?: string; playwright?: string }>({})
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const initialized = useRef(false)
  const needle = query.trim().toLocaleLowerCase()

  useEffect(() => {
    if (ready && !initialized.current) {
      setSnapshot(JSON.parse(JSON.stringify(settings)))
      initialized.current = true
    }
  }, [ready, settings])

  useEffect(() => {
    api.env.checkNode().then((result) => setDiagnostics((value) => ({ ...value, node: result.ok ? result.version : 'Chưa tìm thấy' })))
    api.env.checkGit().then((result) => setDiagnostics((value) => ({ ...value, git: result.ok ? result.version : 'Chưa cài đặt' })))
    api.projects.list().then(async (projects) => {
      if (!projects.length) {
        setDiagnostics((value) => ({ ...value, playwright: 'Chưa có dự án để kiểm tra' }))
        return
      }
      const project = projects[0]
      try {
        const result = await api.export.checkDeps(project.path)
        setDiagnostics((value) => ({ ...value, playwright: `${result.ok ? 'Đã cài' : 'Chưa cài'} trong ${project.name}` }))
      } catch {
        setDiagnostics((value) => ({ ...value, playwright: `Không kiểm tra được ${project.name}` }))
      }
    }).catch(() => setDiagnostics((value) => ({ ...value, playwright: 'Không kiểm tra được' })))
  }, [])

  useEffect(() => () => previewTheme(null), [previewTheme])
  useEffect(() => api.settings.onImportWarnings(setImportWarnings), [])

  const filteredGroups = useMemo(() => groups.filter((group) => !needle || `${group.title} ${group.detail} ${searchTerms[group.id]}`.toLocaleLowerCase().includes(needle)), [needle])
  const visible = (label: string, detail = '') => !needle || `${label} ${detail}`.toLocaleLowerCase().includes(needle)
  const row = (label: string, detail: string, control: React.ReactNode) => visible(label, detail) ? (
    <div key={label} className="grid grid-cols-1 gap-2 border-b border-slate-800/70 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] sm:items-center">
      <div><div className="text-sm font-medium text-slate-200">{label}</div>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>
      <div>{control}</div>
    </div>
  ) : null
  const section = (id: Group, title: string, subtitle: string, content: React.ReactNode) => {
    const group = groups.find((item) => item.id === id)!
    if (!needle && active !== id) return null
    if (needle && !visible(title, `${subtitle} ${searchTerms[id]}`)) return null
    const changed = !!snapshot && id !== 'shortcuts' && JSON.stringify((settings as any)[id]) !== JSON.stringify((snapshot as any)[id])
    return (
      <section key={id} className="mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div><h2 className="font-semibold text-slate-100">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>
          <div className="flex items-center gap-2">{changed && <span className="text-[11px] text-amber-400">Đã thay đổi</span>}{id !== 'shortcuts' && <button className={buttonClass} onClick={() => handleReset(id as SettingsGroup)}><RotateCcw className="h-3.5 w-3.5" />Reset nhóm</button>}</div>
        </div>
        <div className="px-5">{content}</div>
      </section>
    )
  }
  const select = (value: string, options: Array<[string, string]>, onChange: (value: string) => void) => <select className={controlClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
  const text = (value: string, onChange: (value: string) => void, placeholder = '') => <input className={controlClass} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  const number = (value: number, onChange: (value: number) => void, min: number, max: number, step = 1) => <input className={controlClass} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
  const toggle = (value: boolean, onChange: (value: boolean) => void) => <button type="button" aria-pressed={value} onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-700'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} /></button>
  const markServerChange = (patch: any) => {
    void update({ server: patch })
    const changed = JSON.stringify({ ...settings.server, ...patch }) !== JSON.stringify(snapshot?.server)
    localStorage.setItem('studio-server-settings-pending', changed ? 'true' : 'false')
  }
  const handleReset = async (group?: SettingsGroup) => {
    await reset(group)
    const resetServer = group ? group === 'server' ? DEFAULT_SETTINGS.server : settings.server : DEFAULT_SETTINGS.server
    localStorage.setItem('studio-server-settings-pending', JSON.stringify(resetServer) !== JSON.stringify(snapshot?.server) ? 'true' : 'false')
  }

  const appearance = <>
    <div className="grid grid-cols-1 gap-3 py-5 sm:grid-cols-2 xl:grid-cols-3">
      {themes.map((theme) => <button key={theme.id} onClick={() => update({ appearance: { themeId: theme.id, followSystem: false } })} onMouseEnter={() => previewTheme(theme.id)} onMouseLeave={() => previewTheme(null)} aria-pressed={!settings.appearance.followSystem && settings.appearance.themeId === theme.id} className={`overflow-hidden rounded-xl border text-left transition-all ${!settings.appearance.followSystem && settings.appearance.themeId === theme.id ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-700 hover:border-slate-500'}`}>
        <div className="h-20 p-2" style={{ background: theme.bg }}><div className="h-3 rounded-t-md" style={{ background: theme.chromeBg || theme.surface }} /><div className="flex h-12 gap-1 rounded-b-md p-1" style={{ background: theme.surface }}><div className="w-1/4 rounded" style={{ background: theme.border }} /><div className="flex-1 rounded p-1"><div className="h-1.5 w-3/4 rounded" style={{ background: theme.fgMuted }} /><div className="mt-1 h-1.5 w-1/2 rounded" style={{ background: theme.accent }} /></div></div></div>
        <div className="flex items-center justify-between bg-slate-900 px-3 py-2"><span className="text-xs font-medium text-slate-200">{theme.name}</span><span className="text-[10px] uppercase text-slate-500">{theme.kind === 'light' ? 'Sáng' : 'Tối'}</span></div>
      </button>)}
    </div>
    {row('Theo hệ thống', 'Tự đổi giữa cặp theme khi chế độ sáng/tối của hệ điều hành thay đổi.', toggle(settings.appearance.followSystem, (value) => update({ appearance: { followSystem: value } })))}
    {settings.appearance.followSystem && <div className="grid gap-4 py-4 sm:grid-cols-2">
      {row('Theme sáng', '', select(settings.appearance.themeIdLight, themes.filter((theme) => theme.kind === 'light').map((theme) => [theme.id, theme.name] as [string, string]), (value) => update({ appearance: { themeIdLight: value } })))}
      {row('Theme tối', '', select(settings.appearance.themeIdDark, themes.filter((theme) => theme.kind === 'dark').map((theme) => [theme.id, theme.name] as [string, string]), (value) => update({ appearance: { themeIdDark: value } })))}
    </div>}
    {row('Zoom giao diện', 'Phóng to hoặc thu nhỏ toàn bộ giao diện ứng dụng.', number(settings.appearance.uiZoom, (value) => update({ appearance: { uiZoom: value } }), 0.85, 1.25, 0.05))}
    {row('Font giao diện', '', select(settings.appearance.uiFontFamily, [['system', 'System'], ['inter', 'Inter'], ['source-sans', 'Source Sans 3']], (value) => update({ appearance: { uiFontFamily: value as AppSettings['appearance']['uiFontFamily'] } })))}
  </>

  const editor = <>
    {row('Cỡ chữ', '', number(settings.editor.fontSize, (value) => update({ editor: { fontSize: value } }), 10, 32))}
    {row('Font chữ', '', text(settings.editor.fontFamily, (value) => update({ editor: { fontFamily: value } })))}
    {row('Ligatures', 'Hiển thị các ký tự ghép trong font lập trình.', toggle(settings.editor.fontLigatures, (value) => update({ editor: { fontLigatures: value } })))}
    {row('Số dòng', '', toggle(settings.editor.lineNumbers, (value) => update({ editor: { lineNumbers: value } })))}
    {row('Minimap', '', toggle(settings.editor.minimap, (value) => update({ editor: { minimap: value } })))}
    {row('Tự xuống dòng', '', select(settings.editor.wordWrap, [['on', 'Bật'], ['off', 'Tắt']], (value) => update({ editor: { wordWrap: value as 'on' | 'off' } })))}
    {row('Tab size', '', select(String(settings.editor.tabSize), [['2', '2 spaces'], ['4', '4 spaces']], (value) => update({ editor: { tabSize: Number(value) as 2 | 4 } })))}
    {row('Render whitespace', '', select(settings.editor.renderWhitespace, [['none', 'Ẩn'], ['selection', 'Khi chọn'], ['all', 'Luôn hiển thị']], (value) => update({ editor: { renderWhitespace: value as AppSettings['editor']['renderWhitespace'] } })))}
    {row('Tự lưu', '', select(settings.editor.autoSave, [['off', 'Tắt'], ['afterDelay', 'Sau khoảng chờ'], ['onBlur', 'Khi rời Editor']], (value) => update({ editor: { autoSave: value as AppSettings['editor']['autoSave'] } })))}
    {settings.editor.autoSave === 'afterDelay' && row('Độ trễ tự lưu (ms)', '', number(settings.editor.autoSaveDelayMs, (value) => update({ editor: { autoSaveDelayMs: value } }), 100, 10000, 100))}
    {settings.editor.autoSave === 'afterDelay' && row('Tạm dừng autosave khi Markdown chưa hợp lệ', 'Chặn autosave sau khoảng chờ nếu frontmatter, code fence, công thức hoặc component chưa đóng.', toggle(settings.editor.autoSaveGuard, (value) => update({ editor: { autoSaveGuard: value } })))}
    {row('Theme Monaco', 'follow-app dùng màu của theme ứng dụng.', text(settings.editor.monacoTheme, (value) => update({ editor: { monacoTheme: value } }), 'follow-app'))}
  </>

  const preview = <>
    {row('Kiểu điều hướng', '', select(settings.preview.navMode, [['paged', 'Theo trang'], ['scroll-vertical', 'Cuộn dọc'], ['scroll-horizontal', 'Cuộn ngang']], (value) => update({ preview: { navMode: value as AppSettings['preview']['navMode'] } })))}
    {row('Trục cuộn chuột', 'Dùng cho chế độ theo trang.', select(settings.preview.wheelAxis, [['both', 'Dọc và ngang'], ['vertical', 'Chỉ dọc'], ['horizontal', 'Chỉ ngang']], (value) => update({ preview: { wheelAxis: value as AppSettings['preview']['wheelAxis'] } })))}
    {row('Bám slide (snap)', '', toggle(settings.preview.scrollSnap, (value) => update({ preview: { scrollSnap: value } })))}
    {row('Khoảng cách slide (px)', '', number(settings.preview.slideGapPx, (value) => update({ preview: { slideGapPx: value } }), 0, 120))}
    {row('Fit mode', '', select(settings.preview.fitMode, [['fit-width', 'Vừa chiều rộng'], ['fit-height', 'Vừa chiều cao'], ['manual', 'Thủ công']], (value) => update({ preview: { fitMode: value as AppSettings['preview']['fitMode'] } })))}
    {row('Bảng màu slide', '', select(settings.preview.colorScheme, [['follow-app', 'Theo ứng dụng'], ['slide-default', 'Mặc định của Slidev'], ['light', 'Sáng'], ['dark', 'Tối']], (value) => update({ preview: { colorScheme: value as AppSettings['preview']['colorScheme'] } })))}
    {row('Khôi phục slide sau khi chạy lại', '', toggle(settings.preview.restoreSlideAfterRestart, (value) => update({ preview: { restoreSlideAfterRestart: value } })))}
    {row('Bật Click-to-Source', 'Option/Alt-click vào nội dung để mở đúng vị trí trong Markdown.', toggle(settings.preview.sourceJump.enabled, (value) => update({ preview: { sourceJump: { ...settings.preview.sourceJump, enabled: value } } })))}
    {row('Cử chỉ Click-to-Source', '', select(settings.preview.sourceJump.trigger, [['alt-click', 'Alt / Option + Click'], ['ctrl-click', 'Ctrl + Click'], ['double-click', 'Nhấp đúp'], ['click', 'Nhấp thường']], (value) => update({ preview: { sourceJump: { ...settings.preview.sourceJump, trigger: value as AppSettings['preview']['sourceJump']['trigger'] } } })))}
    {row('Thời gian nhấp nháy (ms)', '', number(settings.preview.sourceJump.flashMs, (value) => update({ preview: { sourceJump: { ...settings.preview.sourceJump, flashMs: value } } }), 100, 5000, 100))}
    {row('Đồng bộ con trỏ Editor → Preview', 'Đưa preview tới slide chứa dòng đang đặt con trỏ.', toggle(settings.preview.sourceJump.syncEditorToPreview, (value) => update({ preview: { sourceJump: { ...settings.preview.sourceJump, syncEditorToPreview: value } } })))}
  </>

  const server = <>
    {settings.server.bindMode === 'lan' && <div className="my-3 rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">LAN cho phép thiết bị cùng mạng truy cập server. Hãy đặt mật khẩu presenter nếu cần giới hạn quyền điều khiển. Slidev nhận mật khẩu qua tham số lệnh nên người dùng cùng máy có thể nhìn thấy mật khẩu bằng `ps`.</div>}
    {row('Cổng mặc định', '', number(settings.server.defaultPort, (value) => markServerChange({ defaultPort: value }), 1024, 65535))}
    {row('Dải quét cổng', '', number(settings.server.portScanRange, (value) => markServerChange({ portScanRange: value }), 0, 10000))}
    {row('Chỉ dùng đúng cổng', 'Nếu cổng bận, hiển thị lỗi thay vì tự chọn cổng kế tiếp.', toggle(settings.server.strictPort, (value) => markServerChange({ strictPort: value })))}
    {row('Bind server', '', select(settings.server.bindMode, [['localhost', 'Chỉ máy này'], ['lan', 'Mạng LAN']], (value) => markServerChange({ bindMode: value as AppSettings['server']['bindMode'] })))}
    {settings.server.bindMode === 'lan' && row('Mật khẩu remote', '', text(settings.server.remotePassword, (value) => markServerChange({ remotePassword: value }), 'Để trống nếu không cần mật khẩu'))}
    {row('Mở trình duyệt ngoài khi chạy', '', toggle(settings.server.openExternalBrowser, (value) => markServerChange({ openExternalBrowser: value })))}
    {row('Timeout khởi động (ms)', 'Mặc định 120 giây để Slidev biên dịch và mở cổng lần đầu. Thời gian cài dependencies không tính vào timeout này.', number(settings.server.startupTimeoutMs, (value) => markServerChange({ startupTimeoutMs: value }), 1000, 120000, 1000))}
    {row('Tham số CLI bổ sung', 'Ví dụ: --log info', text(settings.server.extraArgs, (value) => markServerChange({ extraArgs: value })))}
    {row('Tự cài dependencies', '', toggle(settings.server.autoInstallDeps, (value) => markServerChange({ autoInstallDeps: value })))}
    {row('Package manager', '', select(settings.server.packageManager, [['npm', 'npm'], ['pnpm', 'pnpm'], ['yarn', 'Yarn'], ['bun', 'Bun']], (value) => markServerChange({ packageManager: value as AppSettings['server']['packageManager'] })))}
    {row('Registry', 'Để trống để dùng cấu hình mặc định.', text(settings.server.registry, (value) => markServerChange({ registry: value }), 'https://registry.npmjs.org'))}
    {row('Dừng server khi đóng tab', '', toggle(settings.server.stopServerOnTabClose, (value) => markServerChange({ stopServerOnTabClose: value })))}
    {row('Giữ server khi thoát ứng dụng', '', toggle(settings.server.keepServersOnQuit, (value) => markServerChange({ keepServersOnQuit: value })))}
  </>

  const exportSettings = <>
    {row('Định dạng mặc định', '', select(settings.export.defaultFormat, [['pdf', 'PDF'], ['png', 'PNG'], ['pptx', 'PowerPoint'], ['pptx-editable', 'PowerPoint có thể sửa'], ['md', 'Markdown'], ['build', 'Static Web']], (value) => update({ export: { defaultFormat: value as AppSettings['export']['defaultFormat'] } })))}
    {row('Thư mục xuất', 'project/export được tính từ thư mục dự án.', text(settings.export.outputDir, (value) => update({ export: { outputDir: value } })))}
    {row('Tối ưu màu tối khi xuất', '', toggle(!!settings.export.defaultOptions.dark, (value) => update({ export: { defaultOptions: { ...settings.export.defaultOptions, dark: value } } })))}
    {row('Xuất theo từng bước click', '', toggle(!!settings.export.defaultOptions.withClicks, (value) => update({ export: { defaultOptions: { ...settings.export.defaultOptions, withClicks: value } } })))}
    {row('Bỏ nền khi xuất PNG', '', toggle(!!settings.export.defaultOptions.omitBackground, (value) => update({ export: { defaultOptions: { ...settings.export.defaultOptions, omitBackground: value } } })))}
    {row('Phạm vi slide mặc định', 'Để trống để xuất toàn bộ. Ví dụ: 1,4-5,6.', text(settings.export.defaultOptions.range || '', (value) => update({ export: { defaultOptions: { ...settings.export.defaultOptions, range: value || undefined } } }), '1,4-5,6'))}
    {row('Timeout xuất (ms)', 'Để trống để dùng timeout mặc định của Slidev.', number(settings.export.defaultOptions.timeout || 30000, (value) => update({ export: { defaultOptions: { ...settings.export.defaultOptions, timeout: value } } }), 1000, 120000, 1000))}
    {row('Mở thư mục sau khi xuất', '', toggle(settings.export.openFolderAfterExport, (value) => update({ export: { openFolderAfterExport: value } })))}
  </>

  const projects = <>
    <div className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]">{text(settings.projects.defaultWorkspaceDir, (value) => update({ projects: { defaultWorkspaceDir: value } }), '~/SlidevProjects')}<button className={buttonClass} onClick={async () => { const value = await api.projects.selectDirectory('Chọn thư mục workspace mặc định'); if (value) update({ projects: { defaultWorkspaceDir: value } }) }}><FolderOpen className="h-4 w-4" />Chọn thư mục</button></div>
    {row('Tác giả mặc định', '', text(settings.projects.defaultAuthor, (value) => update({ projects: { defaultAuthor: value } })))}
    {row('Phiên bản @slidev/cli mới', '', text(settings.projects.defaultCliRange, (value) => update({ projects: { defaultCliRange: value } })))}
    {row('Khởi tạo Git cho project mới', '', toggle(settings.projects.gitInitOnCreate, (value) => update({ projects: { gitInitOnCreate: value } })))}
    {row('Khôi phục tab khi mở ứng dụng', '', toggle(settings.projects.restoreTabsOnLaunch, (value) => update({ projects: { restoreTabsOnLaunch: value } })))}
    {row('Xác nhận trước khi đóng tab', '', toggle(settings.projects.confirmBeforeCloseTab, (value) => update({ projects: { confirmBeforeCloseTab: value } })))}
  </>

  const system = <>
    {row('Đường dẫn Node.js thủ công', 'Ví dụ: /opt/homebrew/bin', text(settings.system.nodePathOverride, (value) => update({ system: { nodePathOverride: value } })))}
    {row('Mức log', '', select(settings.system.logLevel, [['error', 'Error'], ['info', 'Info'], ['debug', 'Debug']], (value) => update({ system: { logLevel: value as AppSettings['system']['logLevel'] } })))}
    <div className="grid gap-3 py-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3"><div className="flex items-center gap-2 text-xs text-slate-400"><Cpu className="h-4 w-4 text-emerald-400" />Node.js</div><div className="mt-2 text-sm text-slate-200">{diagnostics.node || 'Đang kiểm tra…'}</div></div><div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3"><div className="flex items-center gap-2 text-xs text-slate-400"><Terminal className="h-4 w-4 text-blue-400" />Git</div><div className="mt-2 text-sm text-slate-200">{diagnostics.git || 'Đang kiểm tra…'}</div></div><div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3"><div className="text-xs text-slate-400">Playwright Chromium</div><div className="mt-2 text-sm text-slate-200">{diagnostics.playwright || 'Đang kiểm tra…'}</div></div><div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3"><div className="text-xs text-slate-400">Slidev Studio</div><div className="mt-2 text-sm text-slate-200">v1.0.0</div></div></div>
    <div className="flex flex-wrap gap-2 py-4"><button className={buttonClass} onClick={() => api.settings.openConfigDir()}><FolderOpen className="h-4 w-4" />Mở thư mục cài đặt</button><button className={buttonClass} onClick={() => api.settings.export()}><Download className="h-4 w-4" />Xuất JSON</button><button className={buttonClass} onClick={async () => { setImportWarnings([]); const imported = await api.settings.import(); if (imported) localStorage.setItem('studio-server-settings-pending', JSON.stringify(imported.server) !== JSON.stringify(snapshot?.server) ? 'true' : 'false') }}><Upload className="h-4 w-4" />Nhập JSON</button><button className={`${buttonClass} text-rose-300`} onClick={() => handleReset()}><RotateCcw className="h-4 w-4" />Reset toàn bộ</button></div>
    {importWarnings.length > 0 && <div role="status" className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">{importWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
  </>

  const shortcuts = <div className="divide-y divide-slate-800 py-2">{[['Mở cài đặt', '⌘ , / Ctrl ,'], ['Lưu file đang sửa', '⌘ S / Ctrl S'], ['Slide trước', '←'], ['Slide sau', '→'], ['Click-to-Source', '⌥ + Click']].map(([action, key]) => <div key={action} className="flex items-center justify-between py-3 text-sm"><span className="text-slate-300">{action}</span><kbd className="rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400">{key}</kbd></div>)}</div>

  const contentByGroup: Record<Group, React.ReactNode> = {
    appearance: appearance,
    editor,
    preview,
    server,
    export: exportSettings,
    projects,
    system,
    shortcuts
  }
  const subtitles: Record<Group, string> = {
    appearance: 'Chọn bảng màu và cách hiển thị ứng dụng.', editor: 'Tùy chỉnh Monaco và hành vi tự lưu.',
    preview: 'Điều chỉnh cách duyệt slide và liên kết về source.', server: 'Cấu hình tiến trình Slidev và kết nối mạng.',
    export: 'Đặt lựa chọn được chọn sẵn trong hộp thoại xuất.', projects: 'Giá trị mặc định cho dự án mới và các tab.',
    system: 'Cấu hình môi trường và quản lý file cài đặt.', shortcuts: 'Phím tắt đang hỗ trợ trong ứng dụng.'
  }

  return <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
    <header className="app-chrome flex h-16 shrink-0 items-center gap-4 border-b border-slate-800 px-5">
      <button onClick={onBack} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" title="Quay lại"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0"><h1 className="text-base font-semibold">Cài đặt</h1><p className="text-xs text-slate-400">Tùy biến Slidev Studio</p></div>
      <div className="relative ml-auto w-full max-w-xl"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm cài đặt…" className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>
      <button disabled={!snapshot || JSON.stringify(settings) === JSON.stringify(snapshot)} onClick={() => snapshot && update(snapshot)} className="hidden shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 sm:flex"><RotateCw className="h-3.5 w-3.5" />Hoàn tác thay đổi</button>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-slate-800 p-3 md:block"><nav className="space-y-1">{filteredGroups.map((group) => <button key={group.id} onClick={() => setActive(group.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${active === group.id ? 'bg-blue-600/15 text-blue-300' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'}`}><span className="[&_svg]:h-4 [&_svg]:w-4">{group.icon}</span>{group.title}</button>)}</nav></aside>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {ready && <div className="mb-4 md:hidden">{select(active, filteredGroups.map((group) => [group.id, group.title] as [string, string]), (value) => setActive(value as Group))}</div>}
        {!ready ? <div className="p-8 text-sm text-slate-400">Đang tải cài đặt…</div> : groups.map((group) => section(group.id, group.title, subtitles[group.id], contentByGroup[group.id]))}
      </main>
    </div>
  </div>
}
