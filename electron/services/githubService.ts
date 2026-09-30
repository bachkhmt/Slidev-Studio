import fs from 'fs-extra'
import path from 'path'
import { safeStorage } from 'electron'
import type { DeviceLogin, GitHubAccount, CollabStatus } from '../../shared/collab'
import type { GitCredentials } from './collabGit'

export function githubRepo(remote: string): { owner: string; repo: string } {
  const match = remote.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)
  if (!match) throw new Error('Cộng tác GitHub cần origin dạng https://github.com/chủ/repo.git.')
  return { owner: match[1], repo: match[2] }
}

export class GitHubService {
  private session?: { clientId: string; deviceCode: string; expiresAt: number; interval: number; nextPoll: number }
  private credentials?: GitCredentials & { clientId: string }
  constructor(private configDir: string) {}
  private get file(): string {
    return path.join(this.configDir, 'github-auth.enc')
  }
  private assertEncryption(): void {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
      throw new Error('Không có kho mã hoá an toàn trên máy. Hãy bật keychain/keyring để đăng nhập GitHub.')
  }
  async getCredentials(): Promise<(GitCredentials & { clientId: string }) | undefined> {
    if (this.credentials) return this.credentials
    if (!(await fs.pathExists(this.file))) return undefined
    this.assertEncryption()
    try {
      const saved = JSON.parse(safeStorage.decryptString(await fs.readFile(this.file)))
      if (typeof saved.login !== 'string' || typeof saved.token !== 'string' || typeof saved.clientId !== 'string')
        throw new Error('invalid')
      this.credentials = saved
      return this.credentials
    } catch {
      throw new Error('Không đọc được thông tin đăng nhập. Hãy đăng xuất rồi đăng nhập lại.')
    }
  }
  async account(): Promise<GitHubAccount | null> {
    const credentials = await this.getCredentials()
    return credentials ? { login: credentials.login, clientId: credentials.clientId } : null
  }
  async logout(): Promise<void> {
    this.credentials = undefined
    this.session = undefined
    await fs.remove(this.file)
  }
  private async request(url: string, body?: object, token?: string, method = 'POST'): Promise<any> {
    let response: Response
    try {
      response = await fetch(url, {
        method: body ? method : 'GET',
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    } catch {
      throw new Error('Không kết nối được GitHub. Kiểm tra mạng rồi thử lại.')
    }
    if (!response.ok) {
      if (response.status === 401) throw new Error('Đăng nhập GitHub đã hết hạn. Hãy đăng nhập lại.')
      if (response.status === 403)
        throw new Error('GitHub từ chối truy cập. Kiểm tra quyền repository hoặc giới hạn API.')
      throw new Error(`GitHub trả lỗi ${response.status}. Kiểm tra quyền, nhánh và repository rồi thử lại.`)
    }
    return response.json()
  }
  async beginLogin(clientId: string): Promise<DeviceLogin> {
    this.assertEncryption()
    if (typeof clientId !== 'string' || !/^[A-Za-z0-9_.-]{8,120}$/.test(clientId))
      throw new Error('Nhập Client ID của OAuth App GitHub đã bật Device Flow.')
    const data = await this.request('https://github.com/login/device/code', { client_id: clientId, scope: 'repo' })
    if (!data.device_code || !data.user_code || !data.expires_in)
      throw new Error('OAuth App chưa bật Device Flow hoặc Client ID không hợp lệ.')
    const interval = Math.max(5, Number(data.interval) || 5)
    const expiresAt = Date.now() + Number(data.expires_in) * 1000
    this.session = {
      clientId,
      deviceCode: data.device_code,
      interval,
      expiresAt,
      nextPoll: Date.now() + interval * 1000
    }
    return { userCode: data.user_code, expiresAt, interval }
  }
  async pollLogin(): Promise<{ account?: GitHubAccount; pending?: boolean; interval?: number }> {
    const session = this.session
    if (!session || Date.now() > session.expiresAt) {
      this.session = undefined
      throw new Error('Mã đăng nhập đã hết hạn. Hãy lấy mã mới.')
    }
    if (Date.now() < session.nextPoll) return { pending: true, interval: session.interval }
    session.nextPoll = Date.now() + session.interval * 1000
    const data = await this.request('https://github.com/login/oauth/access_token', {
      client_id: session.clientId,
      device_code: session.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
    if (this.session !== session) throw new Error('Phiên đăng nhập đã bị huỷ.')
    if (data.error === 'authorization_pending') return { pending: true, interval: session.interval }
    if (data.error === 'slow_down') {
      session.interval += 5
      session.nextPoll = Date.now() + session.interval * 1000
      return { pending: true, interval: session.interval }
    }
    if (!data.access_token) {
      this.session = undefined
      throw new Error('GitHub chưa cấp quyền đăng nhập. Hãy lấy mã mới và xác nhận trên trình duyệt.')
    }
    const user = await this.request('https://api.github.com/user', undefined, data.access_token)
    if (this.session !== session) throw new Error('Phiên đăng nhập đã bị huỷ.')
    this.assertEncryption()
    await fs.ensureDir(this.configDir)
    const credentials = { clientId: session.clientId, login: user.login, token: data.access_token }
    await fs.writeFile(this.file, safeStorage.encryptString(JSON.stringify(credentials)), { mode: 0o600 })
    this.credentials = credentials
    this.session = undefined
    return { account: { login: user.login, clientId: session.clientId } }
  }
  private async api(remote: string, suffix: string, body?: object): Promise<any> {
    const credentials = await this.getCredentials()
    if (!credentials) throw new Error('Hãy đăng nhập GitHub trước khi gửi bài.')
    const { owner, repo } = githubRepo(remote)
    return this.request(`https://api.github.com/repos/${owner}/${repo}${suffix}`, body, credentials.token)
  }
  async findPr(remote: string, branch: string, base: string): Promise<CollabStatus['pr']> {
    const { owner } = githubRepo(remote)
    const prs = await this.api(
      remote,
      `/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(base)}&per_page=100`
    )
    const pr = prs.find((p: any) => p.state === 'open') || prs[0]
    if (!pr) return undefined
    let state: NonNullable<CollabStatus['pr']>['state'] = pr.merged_at
      ? 'merged'
      : pr.state === 'open'
        ? 'open'
        : 'closed'
    if (state === 'open') {
      const reviews = await this.api(remote, `/pulls/${pr.number}/reviews?per_page=100`)
      const latest = new Map<string, string>()
      for (const review of reviews)
        if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state))
          latest.set(review.user.login, review.state)
      if ([...latest.values()].includes('CHANGES_REQUESTED')) state = 'changes_requested'
    }
    return { url: pr.html_url, state }
  }
  async submitPr(
    remote: string,
    branch: string,
    base: string,
    title: string
  ): Promise<NonNullable<CollabStatus['pr']>> {
    const existing = await this.findPr(remote, branch, base)
    if (existing && ['open', 'changes_requested'].includes(existing.state)) return existing
    const pr = await this.api(remote, '/pulls', {
      title,
      head: branch,
      base,
      body: 'Bài gửi từ Slidev Studio. Chỉ thay đổi section được phân công và asset tương ứng.'
    })
    return { url: pr.html_url, state: 'open' }
  }
}
