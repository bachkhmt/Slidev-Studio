import { EventEmitter } from 'events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  handlers: new Map<string, any>(),
  events: new Map<string, any>(),
  message: vi.fn(async () => ({ response: 2 }))
}))
vi.mock('electron', () => ({
  ipcMain: {
    on: (c: string, fn: any) => mock.events.set(c, fn),
    handle: (c: string, fn: any) => mock.handlers.set(c, fn)
  },
  dialog: { showMessageBox: mock.message },
  BrowserWindow: { fromWebContents: () => ({}) }
}))
import { registerCloseCoordinator } from '../electron/services/closeCoordinator'
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function setup() {
  const quit = vi.fn(async () => {}),
    coordinator = registerCloseCoordinator(quit),
    win = Object.assign(new EventEmitter(), {
      webContents: { id: 7, send: vi.fn() },
      isDestroyed: () => false,
      close: vi.fn()
    })
  coordinator.attach(win as any)
  return { coordinator, win, quit }
}
it('ignores stale request IDs and responses from other windows', async () => {
  const { win, quit } = setup()
  win.emit('close', { preventDefault: vi.fn() })
  const request = win.webContents.send.mock.calls[0][1]
  mock.events.get('lifecycle:prepared')({ sender: { id: 8 } }, { requestId: request.requestId, status: 'complete' })
  mock.events.get('lifecycle:prepared')({ sender: { id: 7 } }, { requestId: 'stale', status: 'complete' })
  await Promise.resolve()
  expect(quit).not.toHaveBeenCalled()
  mock.events.get('lifecycle:prepared')({ sender: { id: 7 } }, { requestId: request.requestId, status: 'complete' })
  await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
})
it('coalesces multiple close events and cancels after a renderer timeout', async () => {
  const { win, quit } = setup()
  win.emit('close', { preventDefault: vi.fn() })
  win.emit('close', { preventDefault: vi.fn() })
  expect(win.webContents.send).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(10000)
  expect(quit).not.toHaveBeenCalled()
  win.emit('close', { preventDefault: vi.fn() })
  expect(win.webContents.send).toHaveBeenCalledTimes(2)
})
it('completes a repeated close only once', async () => {
  const { win, quit } = setup()
  win.emit('close', { preventDefault: vi.fn() })
  win.emit('close', { preventDefault: vi.fn() })
  const request = win.webContents.send.mock.calls[0][1]
  mock.events.get('lifecycle:prepared')({ sender: { id: 7 } }, { requestId: request.requestId, status: 'complete' })
  await vi.waitFor(() => expect(quit).toHaveBeenCalled())
  expect(quit).toHaveBeenCalledTimes(1)
})
