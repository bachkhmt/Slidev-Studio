// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { processStore, useProcessSnapshot } from '../src/state/processStore'
afterEach(cleanup)
it('log bursts do not rerender a status-only subscriber', () => {
  let renders = 0
  function Status() {
    renders++
    useProcessSnapshot('subscription', false)
    return null
  }
  render(<Status />)
  const before = renders
  act(() =>
    processStore.appendLogs(
      'subscription',
      Array.from({ length: 10000 }, (_, i) => ({ seq: i + 1, text: `log ${i}`, type: 'stdout' }))
    )
  )
  expect(renders).toBe(before)
  expect(processStore.getSnapshot('subscription').logs).toHaveLength(1500)
})
it('deduplicates logs and releases a closed project', () => {
  processStore.appendLogs('release', [
    { seq: 1, text: 'one', type: 'stdout' },
    { seq: 2, text: 'two', type: 'stdout' }
  ])
  processStore.appendLogs('release', [{ seq: 1, text: 'one', type: 'stdout' }])
  expect(processStore.getSnapshot('release').logs).toHaveLength(2)
  ;(processStore as any).release?.('release')
  expect(processStore.getSnapshot('release').logs).toHaveLength(0)
})
