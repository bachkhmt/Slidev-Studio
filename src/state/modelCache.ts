import { documents } from './documents'
import { documentKey } from './documentStore'
const models = new Map<string, { path: string; model: any; view?: any }>()
const released = new Set<any>()
export const modelCache = {
  prune() {
    for (const model of released)
      if (model.isDisposed() || !model.isAttachedToEditor()) {
        if (!model.isDisposed()) model.dispose()
        released.delete(model)
      }
  },
  touch(path: string, model: any, view?: any) {
    this.prune()
    const key = documentKey(path),
      previous = models.get(key)
    if (previous && previous.model !== model && !previous.model.isDisposed() && !previous.model.isAttachedToEditor())
      previous.model.dispose()
    models.delete(key)
    models.set(key, { path, model, view: view || previous?.view })
    const clean = [...models].filter(([, e]) => {
      const d = documents.get(e.path)
      return d.revision === d.savedRevision
    })
    while (clean.length > 10) {
      const [oldKey, e] = clean.shift()!
      if (oldKey !== key && !e.model.isAttachedToEditor()) {
        e.model.dispose()
        models.delete(oldKey)
        documents.releaseFile(e.path)
      }
    }
  },
  remember(model: any, view: any) {
    const found = [...models.values()].find((e) => e.model === model)
    if (found) found.view = view
  },
  viewFor(model: any) {
    return [...models.values()].find((e) => e.model === model)?.view
  },
  release(root: string) {
    for (const [key, e] of models)
      if (key.startsWith(`${documentKey(root)}/`)) {
        models.delete(key)
        released.add(e.model)
      }
    setTimeout(() => this.prune(), 0)
  },
  get size() {
    return models.size + released.size
  }
}
