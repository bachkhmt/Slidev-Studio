import { isReportKind } from '../shared/projectKinds'
import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import { HomeDashboard } from './pages/HomeDashboard'
import type { OpenTab } from './pages/ProjectWorkspace'
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace').then((m) => ({ default: m.ProjectWorkspace })))
const NewProjectWizard = lazy(() => import('./pages/NewProjectWizard').then((m) => ({ default: m.NewProjectWizard })))
import api, { ProjectItem } from './ipc-client'
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
import { useSettings } from './settings/SettingsContext'
import { processStore } from './state/processStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import { documents } from './state/documents'
import { modelCache } from './state/modelCache'

type AppView = 'home' | 'wizard' | 'workspace' | 'settings'

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>('home')
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [returnView, setReturnView] = useState<AppView>('home')
  const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null)
  const [tabActionError, setTabActionError] = useState('')
  const [trustRequest, setTrustRequest] = useState<{ requestId: string; projectId: string; command: string } | null>(
    null
  )
  const [ignoreInstallScripts, setIgnoreInstallScripts] = useState(true)
  const { settings, ready } = useSettings()
  useEffect(() => {
    documents.configure(settings.editor)
  }, [settings.editor])
  useEffect(
    () =>
      api.lifecycle.onPrepareClose(async (request) => {
        try {
          const ok = await documents.prepareClose(undefined, api.lifecycle.confirmUnsaved)
          api.lifecycle.prepared({ requestId: request.requestId, status: ok ? 'complete' : 'cancel' })
        } catch (error: any) {
          api.lifecycle.prepared({ requestId: request.requestId, status: 'error', message: error.message })
        }
      }),
    []
  )
  const restoreAttempted = useRef(false)
  const openingProjectIds = useRef(new Set<string>())
  const openTabsRef = useRef<OpenTab[]>(openTabs)
  openTabsRef.current = openTabs
  useEffect(() => {
    if (activeTabId) void api.process.prioritize(activeTabId)
  }, [activeTabId])

  const openSettings = useCallback(() => {
    setReturnView(view === 'settings' ? returnView : view)
    setView('settings')
  }, [returnView, view])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault()
        if (view === 'settings') setView(returnView)
        else openSettings()
      }
      if (event.key === 'Escape' && view === 'settings') setView(returnView)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [view, returnView, openSettings])

  const handleOpenProject = useCallback(async (project: ProjectItem) => {
    // Check if already open in tabs
    const existingIndex = openTabsRef.current.findIndex((t) => t.project.id === project.id)
    if (existingIndex !== -1 || openingProjectIds.current.has(project.id)) {
      setActiveTabId(project.id)
      setView('workspace')
      return
    }
    openingProjectIds.current.add(project.id)

    const defaultEntry = project.entryFiles[0] || (project.kind === 'latex' ? 'main.tex' : project.kind === 'markdown-report' ? 'main.md' : 'slides.md')
    const initialTab: OpenTab = {
      project,
      activeEntryFile: defaultEntry,
      activeFilePath: `${project.path}/${defaultEntry}`,
      status: isReportKind(project.kind) ? 'idle' : 'starting',
      logs: []
    }

    const nextTabs = [...openTabsRef.current, initialTab]
    openTabsRef.current = nextTabs
    setOpenTabs(nextTabs)
    try {
      const saved = new Set<string>(JSON.parse(localStorage.getItem('slidev-studio-open-tabs') || '[]'))
      saved.add(project.id)
      localStorage.setItem('slidev-studio-open-tabs', JSON.stringify([...saved]))
    } catch {
      /* Ignore invalid session state and continue opening the project. */
    }
    setActiveTabId(project.id)
    setView('workspace')

    if (isReportKind(project.kind)) {
      openingProjectIds.current.delete(project.id)
      return
    }

    // Start Dev Server
    try {
      await api.process.start(project.id, project.path, defaultEntry)
    } catch (err: any) {
      if (
        err?.code === 'STOPPED_BY_USER' ||
        /đã huỷ/i.test(err?.message || '') ||
        processStore.getSnapshot(project.id).status?.status === 'stopped'
      ) {
        processStore.setStatus({ projectId: project.id, status: 'stopped' })
      } else
        processStore.setStatus({
          projectId: project.id,
          status: 'error',
          error: err.message || 'Không thể khởi chạy Slidev server'
        })
    } finally {
      openingProjectIds.current.delete(project.id)
    }
  }, [])

  useEffect(() => {
    const offStatus = api.process.onStatusChange((status) => processStore.setStatus(status))
    const offLogs = api.process.onLogBatch(({ projectId, lines }) => {
      if (openTabsRef.current.some((t) => t.project.id === projectId)) processStore.appendLogs(projectId, lines)
    })
    const offCompileError = api.process.onCompileError(({ projectId, ...error }) =>
      processStore.setCompileError(projectId, error)
    )
    const offCompileOk = api.process.onCompileOk(({ projectId }) => processStore.clearCompileError(projectId))
    const offNeedsTrust = api.process.onNeedsTrust((request) => {
      setIgnoreInstallScripts(true)
      setTrustRequest(request)
    })
    return () => {
      offStatus()
      offLogs()
      offCompileError()
      offCompileOk()
      offNeedsTrust()
    }
  }, [])

  const respondToTrustRequest = useCallback(
    async (choice: 'once' | 'remember' | 'cancel') => {
      if (!trustRequest) return
      const request = trustRequest
      await api.process.confirmTrust(request.requestId, choice, ignoreInstallScripts)
      setTrustRequest((current) => (current?.requestId === request.requestId ? null : current))
    },
    [ignoreInstallScripts, trustRequest]
  )

  const openTabIds = openTabs.map((tab) => tab.project.id).join('|')
  useEffect(() => {
    for (const projectId of openTabIds.split('|').filter(Boolean)) {
      void Promise.all([api.process.getStatus(projectId), api.process.getLogs(projectId)])
        .then(([status, logs]) => {
          if (status) processStore.setStatus(status)
          if (logs.length) processStore.appendLogs(projectId, logs)
        })
        .catch(() => {})
    }
  }, [openTabIds])

  useEffect(() => {
    if (!ready || restoreAttempted.current) return
    restoreAttempted.current = true
    if (!settings.projects.restoreTabsOnLaunch) return
    let projectIds: string[] = []
    try {
      projectIds = JSON.parse(localStorage.getItem('slidev-studio-open-tabs') || '[]')
    } catch {
      projectIds = []
    }
    if (!Array.isArray(projectIds) || projectIds.length === 0) return
    api.projects.list().then((projects) => {
      const byId = new Map(projects.map((project) => [project.id, project]))
      ;[...new Set(projectIds)].forEach((id) => {
        const project = byId.get(id)
        if (project) void handleOpenProject(project)
      })
    })
  }, [handleOpenProject, ready, settings.projects.restoreTabsOnLaunch])

  const removeTabState = useCallback(
    (projectId: string) => {
      const filtered = openTabsRef.current.filter((tab) => tab.project.id !== projectId)
      openTabsRef.current = filtered
      setOpenTabs(filtered)
      if (filtered.length === 0) {
        setView('home')
        setActiveTabId('')
      } else if (activeTabId === projectId) {
        setActiveTabId(filtered[0].project.id)
      }
    },
    [activeTabId]
  )

  const handleCloseTab = useCallback(
    async (projectId: string, confirmed = false) => {
      if (settings.projects.confirmBeforeCloseTab && !confirmed) {
        setCloseConfirmId(projectId)
        return
      }
      const closing = openTabsRef.current.find((t) => t.project.id === projectId)
      if (closing && !(await documents.prepareClose(closing.project.path, api.lifecycle.confirmUnsaved))) return
      try {
        const ids = (JSON.parse(localStorage.getItem('slidev-studio-open-tabs') || '[]') as string[]).filter(
          (id) => id !== projectId
        )
        localStorage.setItem('slidev-studio-open-tabs', JSON.stringify(ids))
      } catch {
        localStorage.removeItem('slidev-studio-open-tabs')
      }
      // Stop server
      if (isReportKind(closing?.project.kind)) await api.reports.cancel(projectId)
      if (settings.server.stopServerOnTabClose) {
        try {
          const stopped = await api.process.stop(projectId)
          if (!stopped) {
            setTabActionError('Không thể xác nhận máy chủ đã dừng. Tab vẫn được giữ để bạn thử lại.')
            return
          }
        } catch (error: any) {
          setTabActionError(error?.message || 'Không thể dừng máy chủ của dự án.')
          return
        }
      }
      if (settings.server.stopServerOnTabClose) await api.process.release(projectId)
      if (closing) {
        modelCache.release(closing.project.path)
        documents.releaseProject(closing.project.path)
      }
      processStore.release(projectId)
      removeTabState(projectId)
      setCloseConfirmId(null)
    },
    [removeTabState, settings.projects.confirmBeforeCloseTab, settings.server.stopServerOnTabClose]
  )

  const handleUpdateTab = useCallback((id: string, updater: Partial<OpenTab> | ((prev: OpenTab) => OpenTab)) => {
    const nextTabs = openTabsRef.current.map((tab) => {
      if (tab.project.id !== id) return tab
      if (typeof updater === 'function') return updater(tab)
      return { ...tab, ...updater }
    })
    openTabsRef.current = nextTabs
    setOpenTabs(nextTabs)
  }, [])

  const handleProjectRemoved = useCallback(
    (projectId: string) => {
      try {
        const ids = (JSON.parse(localStorage.getItem('slidev-studio-open-tabs') || '[]') as string[]).filter(
          (id) => id !== projectId
        )
        localStorage.setItem('slidev-studio-open-tabs', JSON.stringify(ids))
      } catch {
        localStorage.removeItem('slidev-studio-open-tabs')
      }
      removeTabState(projectId)
    },
    [removeTabState]
  )

  const handleCreatedNewProject = (newProject: ProjectItem) => {
    handleOpenProject(newProject)
  }

  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Đang tải...</div>}>
      <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans">
        {view === 'home' && (
          <HomeDashboard
            onOpenProject={handleOpenProject}
            onNavigateNewProject={() => setView('wizard')}
            onOpenSettings={openSettings}
            onProjectRemoved={handleProjectRemoved}
          />
        )}

        {view === 'wizard' && <NewProjectWizard onCancel={() => setView('home')} onCreated={handleCreatedNewProject} />}

        {openTabs.length > 0 && (
          <div className={view === 'workspace' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>
            <ErrorBoundary label="Workspace">
              <ProjectWorkspace
                visible={view === 'workspace'}
                openTabs={openTabs}
                activeTabId={activeTabId}
                onSelectTab={(id) => setActiveTabId(id)}
                onCloseTab={handleCloseTab}
                onGoHome={() => setView('home')}
                onUpdateTab={handleUpdateTab}
                onOpenSettings={openSettings}
              />
            </ErrorBoundary>
          </div>
        )}

        {view === 'settings' && <SettingsPage onBack={() => setView(returnView)} />}
        {tabActionError && (
          <div
            role="alert"
            className="fixed bottom-4 right-4 z-[100] max-w-lg rounded-lg border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-100 shadow-xl"
          >
            <span>{tabActionError}</span>
            <button className="ml-4 underline" onClick={() => setTabActionError('')}>
              Đóng
            </button>
          </div>
        )}
        {closeConfirmId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            >
              <h2 className="text-base font-semibold text-slate-100">Đóng tab dự án?</h2>
              <p className="mt-2 text-sm text-slate-400">
                Máy chủ sẽ dừng nếu cài đặt “Dừng máy chủ khi đóng tab” đang bật.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  onClick={() => setCloseConfirmId(null)}
                >
                  Huỷ
                </button>
                <button
                  className="rounded-lg bg-rose-700 px-3 py-2 text-sm text-white hover:bg-rose-600"
                  onClick={() => void handleCloseTab(closeConfirmId, true)}
                >
                  Đóng tab
                </button>
              </div>
            </div>
          </div>
        )}
        {trustRequest && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-lg rounded-xl border border-amber-700/60 bg-slate-900 p-5 shadow-2xl"
            >
              <h2 className="text-base font-semibold text-slate-100">Xác nhận cài dependencies</h2>
              <p className="mt-2 text-sm text-slate-300">Dự án này chưa được đánh dấu tin cậy. Studio muốn chạy:</p>
              <code className="mt-2 block break-all rounded-lg bg-slate-950 p-3 font-mono text-xs text-amber-200">
                {trustRequest.command}
              </code>
              <label className="mt-4 flex items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={ignoreInstallScripts}
                  onChange={(event) => setIgnoreInstallScripts(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Bỏ qua script cài đặt (--ignore-scripts). Bật tuỳ chọn này để không chạy lifecycle script của
                  dependency.
                </span>
              </label>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  onClick={() => void respondToTrustRequest('cancel')}
                >
                  Huỷ
                </button>
                <button
                  className="rounded-lg bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-600"
                  onClick={() => void respondToTrustRequest('once')}
                >
                  Đồng ý một lần
                </button>
                <button
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-600"
                  onClick={() => void respondToTrustRequest('remember')}
                >
                  Đồng ý & nhớ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Suspense>
  )
}

export default App
