import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ available: true }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => storage.available,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (text: string) => Buffer.from(text).map((byte) => byte ^ 0x7f),
    decryptString: (buffer: Buffer) =>
      Buffer.from(buffer)
        .map((byte) => byte ^ 0x7f)
        .toString()
  }
}))
import { GitHubService, githubRepo } from '../electron/services/githubService'
let root: string
let service: GitHubService
let now: number
let fetchMock: ReturnType<typeof vi.fn>
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'slidev-github-test-'))
  service = new GitHubService(root)
  storage.available = true
  now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await fs.remove(root)
})
async function login(): Promise<void> {
  fetchMock.mockResolvedValueOnce(
    response({ device_code: 'private-code', user_code: 'ABCD-1234', expires_in: 900, interval: 5 })
  )
  await service.beginLogin('valid-client-id')
  now += 5000
  fetchMock
    .mockResolvedValueOnce(response({ access_token: 'secret-test-token' }))
    .mockResolvedValueOnce(response({ login: 'alice' }))
  await service.pollLogin()
}

describe('GitHub device authentication and encrypted persistence', () => {
  it('obeys polling intervals, slows down, and only returns public account data', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ device_code: 'private-code', user_code: 'ABCD-1234', expires_in: 900, interval: 5 })
    )
    const device = await service.beginLogin('valid-client-id')
    expect(device).not.toHaveProperty('deviceCode')
    expect(await service.pollLogin()).toEqual({ pending: true, interval: 5 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    now += 5000
    fetchMock.mockResolvedValueOnce(response({ error: 'slow_down' }))
    expect(await service.pollLogin()).toEqual({ pending: true, interval: 10 })
    now += 10000
    fetchMock
      .mockResolvedValueOnce(response({ access_token: 'secret-test-token' }))
      .mockResolvedValueOnce(response({ login: 'alice' }))
    const result = await service.pollLogin()
    expect(result).toEqual({ account: { login: 'alice', clientId: 'valid-client-id' } })
    const encrypted = await fs.readFile(path.join(root, 'github-auth.enc'))
    expect(encrypted.toString()).not.toContain('secret-test-token')
    expect(await new GitHubService(root).account()).toEqual(result.account)
    await service.logout()
    expect(await service.account()).toBeNull()
    expect(await fs.pathExists(path.join(root, 'github-auth.enc'))).toBe(false)
  })
  it('refuses login without secure storage and handles expired codes', async () => {
    storage.available = false
    await expect(service.beginLogin('valid-client-id')).rejects.toThrow(/mã hoá an toàn/)
    expect(fetchMock).not.toHaveBeenCalled()
    storage.available = true
    fetchMock.mockResolvedValueOnce(response({ device_code: 'code', user_code: 'ABCD', expires_in: 1, interval: 5 }))
    await service.beginLogin('valid-client-id')
    now += 2000
    await expect(service.pollLogin()).rejects.toThrow(/hết hạn/)
  })
  it('reports expired credentials without exposing token or HTTP error details', async () => {
    await login()
    fetchMock.mockResolvedValueOnce(response({ message: 'secret-test-token' }, 401))
    await expect(
      service.findPr('https://github.com/team/presentation.git', 'feature/alice-01-intro', 'main')
    ).rejects.toThrow(/hết hạn/)
  })
})

describe('PR routing and review state', () => {
  it('parses GitHub HTTPS URLs and rejects other origins', () => {
    expect(githubRepo('https://github.com/team/presentation.git')).toEqual({ owner: 'team', repo: 'presentation' })
    expect(() => githubRepo('https://evil.example/team/presentation.git')).toThrow()
    expect(() => githubRepo('https://token@github.com/team/presentation.git')).toThrow()
  })
  it('reuses an existing open PR and handles latest reviewer decisions', async () => {
    await login()
    fetchMock
      .mockResolvedValueOnce(
        response([{ number: 1, state: 'open', html_url: 'https://github.com/team/presentation/pull/1' }])
      )
      .mockResolvedValueOnce(
        response([
          { user: { login: 'leader' }, state: 'CHANGES_REQUESTED' },
          { user: { login: 'leader' }, state: 'APPROVED' }
        ])
      )
    expect(
      await service.submitPr('https://github.com/team/presentation.git', 'feature/alice-01-intro', 'main', 'Intro')
    ).toEqual({ url: 'https://github.com/team/presentation/pull/1', state: 'open' })
    expect(fetchMock.mock.calls[3][0]).toContain('head=team%3Afeature%2Falice-01-intro&base=main')
    expect(fetchMock.mock.calls).toHaveLength(5)
  })
  it('creates a PR into the declared main branch and reports merge state', async () => {
    await login()
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ html_url: 'https://github.com/team/presentation/pull/2' }))
    await service.submitPr('https://github.com/team/presentation.git', 'feature/alice-01-intro', 'trunk', 'Intro')
    const request = fetchMock.mock.calls[4][1]
    expect(JSON.parse(request.body)).toMatchObject({ head: 'feature/alice-01-intro', base: 'trunk', title: 'Intro' })
    fetchMock.mockResolvedValueOnce(
      response([{ state: 'closed', merged_at: '2026-09-30', html_url: 'https://github.com/team/presentation/pull/2' }])
    )
    expect(
      (await service.findPr('https://github.com/team/presentation.git', 'feature/alice-01-intro', 'trunk'))?.state
    ).toBe('merged')
  })
})
