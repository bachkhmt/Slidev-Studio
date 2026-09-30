import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Folder,
  CheckCircle2,
  Loader2,
  Layers,
  BookOpen,
  LayoutGrid,
  Palette,
  Heart,
  Terminal,
  Moon
} from 'lucide-react'
import api, { TemplateInfo, ProjectItem } from '../ipc-client'

interface NewProjectWizardProps {
  onCancel: () => void
  onCreated: (project: ProjectItem) => void
}

export const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ onCancel, onCreated }) => {
  const [step, setStep] = useState<number>(1)
  const [name, setName] = useState<string>('')
  const [targetDir, setTargetDir] = useState<string>('')
  const [templateId, setTemplateId] = useState<string>('default')
  const [customTheme, setCustomTheme] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [author, setAuthor] = useState<string>('')
  const [collabOwners, setCollabOwners] = useState(['', '', ''])
  const [collabCoordinator, setCollabCoordinator] = useState('')
  const [templates, setTemplates] = useState<TemplateInfo[]>([])

  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const cleanMetadata = (value: string): string => value.replace(/[\r\n\u0000-\u001f\u007f]/g, '').slice(0, 200)

  useEffect(() => {
    api.settings.get().then((s) => {
      if (s?.projects.defaultWorkspaceDir) setTargetDir(s.projects.defaultWorkspaceDir)
      if (s?.projects.defaultAuthor) {
        setAuthor(s.projects.defaultAuthor)
      }
    })
    api.scaffold.listTemplates().then((tpls) => {
      setTemplates(tpls)
      if (tpls.length > 0) setTemplateId(tpls[0].id)
    })

    const cleanup = api.scaffold.onLog((text) => {
      setLogs((prev) => [...prev, text])
    })
    return () => cleanup()
  }, [])

  const handleSelectFolder = async () => {
    const dir = await api.projects.selectDirectory('Chọn thư mục lưu dự án mới')
    if (dir) setTargetDir(dir)
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Vui lòng nhập tên thư mục dự án')
      setStep(1)
      return
    }
    if (!targetDir.trim()) {
      setError('Vui lòng chọn thư mục lưu trữ')
      setStep(1)
      return
    }

    setIsCreating(true)
    setError(null)
    setLogs(['Bắt đầu tiến trình tạo dự án...'])

    try {
      const newProj = await api.scaffold.create({
        name: name.trim(),
        targetDir: targetDir.trim(),
        templateId: templateId === 'git-collab' ? templateId : customTheme.trim() ? 'default' : templateId,
        ...(templateId === 'git-collab' ? { collabOwners: collabOwners.map((s) => s.trim()), collabCoordinator: collabCoordinator.trim() } : {}),
        title: cleanMetadata(title).trim() || name.trim(),
        author: cleanMetadata(author).trim() || 'Slidev Author',
        ...(customTheme.trim() ? { customTheme: customTheme.trim() } : {})
      })
      onCreated(newProj)
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo dự án Slidev')
      setIsCreating(false)
    }
  }

  const getTemplateIcon = (id: string) => {
    switch (id) {
      case 'frankfurt-academic':
        return <BookOpen className="w-6 h-6 text-blue-400" />
      case 'seriph':
        return <Palette className="w-6 h-6 text-emerald-400" />
      case 'bricks':
        return <LayoutGrid className="w-6 h-6 text-purple-400" />
      case 'apple-basic':
        return <Sparkles className="w-6 h-6 text-slate-300" />
      case 'shibainu':
        return <Heart className="w-6 h-6 text-pink-400" />
      case 'penguin':
        return <Terminal className="w-6 h-6 text-cyan-400" />
      case 'dracula':
        return <Moon className="w-6 h-6 text-violet-400" />
      case 'hcmut-bach':
        return <BookOpen className="w-6 h-6 text-blue-400" />
      default:
        return <Layers className="w-6 h-6 text-amber-400" />
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Wizard Header */}
      <div className="app-chrome border-b border-slate-800 bg-slate-900/60 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Khởi tạo bài thuyết trình mới</h1>
            <p className="text-xs text-slate-400">Tạo dự án Slidev từ các theme tuyển chọn, sẵn sàng live-edit</p>
          </div>
        </div>

        {/* Stepper Indicator */}
        <div className="flex items-center gap-3">
          {[
            { num: 1, label: 'Tên & Vị trí' },
            { num: 2, label: 'Chọn Theme' },
            { num: 3, label: 'Thông tin Slide' }
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s.num
                    ? 'bg-blue-600 text-white ring-4 ring-blue-600/20'
                    : step > s.num
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </div>
              <span className={`text-xs hidden sm:inline ${step === s.num ? 'text-white font-medium' : 'text-slate-500'}`}>
                {s.label}
              </span>
              {s.num < 3 && <div className="w-6 h-[1px] bg-slate-800" />}
            </div>
          ))}
        </div>
      </div>

      {/* Main Wizard Form Container */}
      <div className="flex-1 max-w-3xl w-full mx-auto p-8 flex flex-col justify-center">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-xl">
          {/* STEP 1: Name & Destination */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-100 mb-1">Bước 1: Tên dự án & Vị trí lưu</h2>
                <p className="text-xs text-slate-400">Chọn tên thư mục và nơi lưu trữ tệp tin trên máy tính</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Tên dự án (Thư mục)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (!title) setTitle(e.target.value)
                    }}
                    placeholder="vd: KhoaHocDuLieu-K65 hoặc AI-Presentation"
                    autoFocus
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Thư mục chứa dự án
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={targetDir}
                      onChange={(e) => setTargetDir(e.target.value)}
                      placeholder="/Users/yourname/SlidevProjects"
                      className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleSelectFolder}
                      className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium flex items-center gap-2 border border-slate-700 transition-colors"
                    >
                      <Folder className="w-4 h-4 text-blue-400" />
                      <span>Chọn...</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Choose Theme */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-100 mb-1">Bước 2: Chọn phong cách thiết kế (Theme)</h2>
                <p className="text-xs text-slate-400">App đã bundle sẵn các template tối ưu mà không cần tương tác CLI</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setTemplateId(tpl.id)
                      setCustomTheme('')
                    }}
                    className={`p-5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      templateId === tpl.id && !customTheme.trim()
                        ? 'bg-blue-600/10 border-blue-500 ring-2 ring-blue-500/40 text-slate-100'
                        : 'bg-slate-800/40 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700/80">
                          {getTemplateIcon(tpl.id)}
                        </div>
                        {templateId === tpl.id && !customTheme.trim() && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đã chọn
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-base mb-1">{tpl.name}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">{tpl.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Theme: {tpl.theme}</span>
                      <span className="text-blue-400">Sẵn sàng compile</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={`rounded-xl border p-4 transition-colors ${customTheme.trim() ? 'border-blue-500/60 bg-blue-600/10' : 'border-slate-800 bg-slate-800/30'}`}>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Theme tuỳ chỉnh (nâng cao)
                </label>
                <input
                  type="text"
                  value={customTheme}
                  onChange={(event) => setCustomTheme(event.target.value)}
                  placeholder="vd: geist, frankfurt, slidev-theme-penguin"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <p className="mt-2 text-xs text-slate-500">
                  {customTheme.trim()
                    ? `Dự án sẽ dùng Default làm khung và đặt theme: ${customTheme.trim()}`
                    : 'Nhập tên theme đã phát hành trên npm. Dự án sẽ dùng template Default làm khung.'}
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Slide Frontmatter Info */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-100 mb-1">Bước 3: Tiêu đề & Tác giả</h2>
                <p className="text-xs text-slate-400">Thông tin này sẽ được điền tự động vào trang bìa slides.md</p>
              </div>

              <div className="space-y-4">
                {templateId === 'git-collab' && <div className="space-y-3 rounded-xl border border-blue-800 p-4"><p className="text-sm text-blue-300">Phân công bằng tài khoản GitHub</p><label className="block text-xs">Điều phối<input value={collabCoordinator} onChange={(e) => setCollabCoordinator(e.target.value)} placeholder="github-login" className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 px-3 py-2" /></label>{['01-intro', '02-analysis', '03-demo'].map((id, i) => <label key={id} className="block text-xs">{id}<input value={collabOwners[i]} onChange={(e) => setCollabOwners((owners) => owners.map((v, n) => n === i ? e.target.value : v))} placeholder="Tài khoản GitHub người phụ trách" className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 px-3 py-2" /></label>)}</div>}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Tiêu đề bài thuyết trình
                  </label>
                  <input
                    type="text"
                    value={title}
                    maxLength={200}
                    onChange={(e) => setTitle(cleanMetadata(e.target.value))}
                    placeholder="vd: Báo cáo tiến độ đề tài nghiên cứu"
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Tác giả / Nhóm thực hiện
                  </label>
                  <input
                    type="text"
                    value={author}
                    maxLength={200}
                    onChange={(e) => setAuthor(cleanMetadata(e.target.value))}
                    placeholder="vd: Nhóm 07 - ĐH Bách Khoa"
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mt-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Real-time installation terminal log during creation */}
          {isCreating && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang thiết lập dự án và cài đặt dependencies...</span>
              </div>
              <div className="h-40 overflow-y-auto p-3 bg-black/70 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-400 space-y-1">
                {logs.map((log, idx) => (
                  <div key={idx} className="break-all">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-8 pt-5 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={step === 1 ? onCancel : () => setStep(step - 1)}
              disabled={isCreating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-50 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{step === 1 ? 'Huỷ bỏ' : 'Quay lại'}</span>
            </button>

            {step < 3 ? (
              <button
                onClick={() => {
                  if (step === 1 && !name.trim()) {
                    setError('Vui lòng nhập tên dự án')
                    return
                  }
                  setError(null)
                  setStep(step + 1)
                }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-600/20 transition-colors"
              >
                <span>Tiếp tục</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="flex items-center gap-2 px-7 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium shadow-lg shadow-blue-600/20 transition-colors"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang khởi tạo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Tạo dự án & Mở ngay</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
