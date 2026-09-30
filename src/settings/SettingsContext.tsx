import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../ipc-client'
import { DEFAULT_SETTINGS, type AppSettings, type DeepPartial, type SettingsGroup } from '../../shared/settings'
import { applyTheme } from '../themes/applyTheme'
import { getTheme } from '../themes/registry'

interface SettingsContextValue {
  settings: AppSettings
  ready: boolean
  effectiveThemeId: string
  previewTheme: (themeId: string | null) => void
  update: (partial: DeepPartial<AppSettings>) => Promise<void>
  reset: (group?: SettingsGroup) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function mergeSettings(base: AppSettings, patch: DeepPartial<AppSettings>): AppSettings {
  const merge = (left: any, right: any): any => {
    const result = { ...left }
    Object.entries(right || {}).forEach(([key, value]) => {
      result[key] = value && typeof value === 'object' && !Array.isArray(value) && left[key] && typeof left[key] === 'object'
        ? merge(left[key], value)
        : value
    })
    return result
  }
  return merge(base, patch)
}

export const SettingsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => structuredClone(DEFAULT_SETTINGS))
  const [ready, setReady] = useState(false)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    api.settings.get().then((loaded) => {
      if (mounted && loaded) setSettings(loaded)
    }).finally(() => mounted && setReady(true))
    const offSettings = api.settings.onChange(setSettings)
    const offSystem = api.settings.onSystemTheme((theme) => setSystemDark(theme === 'dark'))
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onMedia = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media?.addEventListener?.('change', onMedia)
    return () => {
      mounted = false
      offSettings()
      offSystem()
      media?.removeEventListener?.('change', onMedia)
    }
  }, [])

  const effectiveThemeId = previewThemeId || (settings.appearance.followSystem
    ? systemDark ? settings.appearance.themeIdDark : settings.appearance.themeIdLight
    : settings.appearance.themeId)

  useEffect(() => {
    const theme = getTheme(effectiveThemeId)
    applyTheme(theme)
    api.system.setZoom(settings.appearance.uiZoom)
    const font = settings.appearance.uiFontFamily === 'source-sans'
      ? '"Source Sans 3", ui-sans-serif, system-ui, sans-serif'
      : settings.appearance.uiFontFamily === 'inter'
        ? 'Inter, ui-sans-serif, system-ui, sans-serif'
        : 'ui-sans-serif, system-ui, sans-serif'
    document.documentElement.style.setProperty('--ui-font', font)
  }, [effectiveThemeId, settings.appearance.uiZoom, settings.appearance.uiFontFamily])

  const update = useCallback(async (partial: DeepPartial<AppSettings>) => {
    setSettings((current) => mergeSettings(current, partial))
    await api.settings.update(partial)
  }, [])
  const reset = useCallback(async (group?: SettingsGroup) => {
    const updated = await api.settings.reset(group)
    setSettings(updated)
  }, [])
  const previewTheme = useCallback((themeId: string | null) => setPreviewThemeId(themeId), [])
  const value = useMemo(() => ({ settings, ready, effectiveThemeId, previewTheme, update, reset }), [settings, ready, effectiveThemeId, previewTheme, update, reset])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside SettingsProvider')
  return value
}
