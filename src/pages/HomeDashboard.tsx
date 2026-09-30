import React, { useState, useEffect } from 'react'
import {
  FolderOpen,
  Plus,
  GitBranch,
  Search,
  Settings as SettingsIcon,
  Presentation,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react'
import { GitHubLogin } from '../components/GitHubLogin'
import { ProjectCard } from '../components/ProjectCard'
import api, { ProjectItem } from '../ipc-client'

interface HomeDashboardProps {
  onOpenProject: (project: ProjectItem) => void
  onNavigateNewProject: () => void
  onOpenSettings: () => void
  onProjectRemoved: (id: string) => void
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  onOpenProject,
  onNavigateNewProject,
  onOpenSettings,
  onProjectRemoved
}) => {
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cloningProjectIds, setCloningProjectIds] = useState<Set<string>>(() => new Set())

  // Git Clone Modal State
  const [isGitModalOpen, setIsGitModalOpen] = useState<boolean>(false)
  const [gitUrl, setGitUrl] = useState<string>('')
  const [gitTargetDir, setGitTargetDir] = useState<string>('')
  const [isCloning, setIsCloning] = useState<boolean>(false)
  const [gitError, setGitError] = useState<string | null>(null)

  const loadProjects = async () => {
    try {
      setLoading(true)
      const list = await api.projects.list()
      setProjects(list)
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tải danh sách dự án')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const handleOpenFolder = async () => {
    try {
      setErrorMessage(null)
      const project = await api.projects.addFolder()
      if (project) {
        onOpenProject(project)
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('huỷ')) {
        setErrorMessage(err.message)
      }
    }
  }

  const handleRemoveProject = async (id: string) => {
    try {
      const removed = await api.projects.remove(id)
      if (removed) {
        localStorage.removeItem(`react-resizable-panels:workspace-v-${id}`)
        localStorage.removeItem(`react-resizable-panels:workspace-h-${id}`)
        localStorage.removeItem(`slidev-console-open-${id}`)
        setProjects((prev) => prev.filter((p) => p.id !== id))
        onProjectRemoved(id)
      }
    } catch (err: any) {
      setErrorMessage(err.message)
    }
  }

  const handleUpdateProject = (project: ProjectItem) => {
    setProjects((previous) => previous.map((item) => item.id === project.id ? project : item))
  }

  const handleCloneProject = async (source: ProjectItem) => {
    setErrorMessage(null)
    setCloningProjectIds((previous) => new Set(previous).add(source.id))
    try {
      const targetDir = await api.projects.selectDirectory('Chọn thư mục lưu bản sao')
      if (!targetDir) return
      const project = await api.projects.cloneProject(source.id, targetDir)
      setProjects((previous) => [project, ...previous])
      onOpenProject(project)
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tạo bản sao dự án')
    } finally {
      setCloningProjectIds((previous) => {
        const next = new Set(previous)
        next.delete(source.id)
        return next
      })
    }
  }

  const handleOpenGitModal = async () => {
    setGitError(null)
    setGitUrl('')
    const settings = await api.settings.get()
    setGitTargetDir(settings?.projects.defaultWorkspaceDir || '')
    setIsGitModalOpen(true)
  }

  const handleCloneGit = async () => {
    if (!gitUrl.trim()) {
      setGitError('Vui lòng nhập đường dẫn Git repository URL')
      return
    }
    if (!gitTargetDir.trim()) {
      setGitError('Vui lòng chọn thư mục lưu trữ')
      return
    }

    setIsCloning(true)
    setGitError(null)
    try {
      const project = await api.projects.cloneFromGit(gitUrl.trim(), gitTargetDir.trim())
      setIsGitModalOpen(false)
      onOpenProject(project)
    } catch (err: any) {
      setGitError(err.message || 'Lỗi khi clone repository')
    } finally {
      setIsCloning(false)
    }
  }

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="border-b border-slate-800 px-8 py-3"><GitHubLogin /></div>
      {/* Top Navbar */}
      <header className="app-chrome border-b border-slate-800 bg-slate-900/60 sticky top-0 z-20 backdrop-blur-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/20">
            <Presentation className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Slidev Studio</h1>
              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-semibold uppercase tracking-wider border border-blue-500/20">
                Desktop
              </span>
            </div>
            <p className="text-xs text-slate-400">Quản lý và biên tập bài thuyết trình Slidev với Live Preview</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettings}
            title="Cài đặt hệ thống"
            className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-50 transition-colors border border-slate-800"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 space-y-8">
        {/* Banner with 3 Main Action CTA Buttons */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-blue-900/40 to-slate-900 border border-blue-700/30 hover:border-blue-500 text-left transition-all duration-200 hover:-translate-y-0.5 shadow-lg hover:shadow-blue-500/10 group"
          >
            <div className="p-3.5 rounded-xl bg-blue-600/20 text-blue-400 group-hover:scale-110 transition-transform">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">
                Mở thư mục có sẵn
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Chọn một repo Slidev đã có trên máy</p>
            </div>
          </button>

          <button
            onClick={onNavigateNewProject}
            className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-700/30 hover:border-emerald-500 text-left transition-all duration-200 hover:-translate-y-0.5 shadow-lg hover:shadow-emerald-500/10 group"
          >
            <div className="p-3.5 rounded-xl bg-emerald-600/20 text-emerald-400 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white group-hover:text-emerald-400 transition-colors">
                Tạo project mới
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Wizard 3 bước từ các theme tuyển chọn</p>
            </div>
          </button>

          <button
            onClick={handleOpenGitModal}
            className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-700/30 hover:border-purple-500 text-left transition-all duration-200 hover:-translate-y-0.5 shadow-lg hover:shadow-purple-500/10 group"
          >
            <div className="p-3.5 rounded-xl bg-purple-600/20 text-purple-400 group-hover:scale-110 transition-transform">
              <GitBranch className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white group-hover:text-purple-400 transition-colors">
                Clone từ Git
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Tải repo trực tiếp từ GitHub/GitLab</p>
            </div>
          </button>
        </section>

        {/* Error message alert */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="hover:text-slate-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Project List Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100 tracking-tight">Bài thuyết trình gần đây</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                {projects.length}
              </span>
            </div>

            <div className="relative min-w-[280px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm dự án theo tên hoặc đường dẫn..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 space-y-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-xs text-slate-400">Đang tải danh sách bài thuyết trình...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-4 bg-slate-900/20">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500">
                <Presentation className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Chưa có bài thuyết trình nào</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Hãy mở một thư mục Slidev có sẵn trên máy tính, hoặc tạo bài thuyết trình mới từ các theme có sẵn.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleOpenFolder}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  Mở thư mục có sẵn
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  Thêm thư mục dự án…
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((proj) => (
                <ProjectCard
                  key={proj.id}
                  project={proj}
                  onOpen={onOpenProject}
                  onRemove={handleRemoveProject}
                  onUpdateProject={handleUpdateProject}
                  onClone={handleCloneProject}
                  cloning={cloningProjectIds.has(proj.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Git Clone Modal */}
      {isGitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Clone Slidev từ Git</h3>
                  <p className="text-xs text-slate-400">Tải mã nguồn từ GitHub/GitLab về máy tính</p>
                </div>
              </div>
              <button
                onClick={() => setIsGitModalOpen(false)}
                disabled={isCloning}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Repository URL
                </label>
                <input
                  type="text"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/slidev-deck.git"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Thư mục đích lưu trữ
                </label>
                <input
                  type="text"
                  value={gitTargetDir}
                  onChange={(e) => setGitTargetDir(e.target.value)}
                placeholder="~/SlidevProjects"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              {gitError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono">
                  {gitError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
              <button
                onClick={() => setIsGitModalOpen(false)}
                disabled={isCloning}
                className="px-4 py-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium"
              >
                Huỷ
              </button>
              <button
                onClick={handleCloneGit}
                disabled={isCloning}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50 transition-colors shadow-lg shadow-purple-600/20"
              >
                {isCloning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang Clone...</span>
                  </>
                ) : (
                  <span>Clone & Mở</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
