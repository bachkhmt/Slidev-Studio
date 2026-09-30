export function validateGitUrl(url: string): boolean {
  if (typeof url !== 'string' || !url || url.startsWith('-') || /[\s\u0000-\u001f\u007f]/.test(url)) return false
  if (/^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+(?:\.git)?$/.test(url)) return true
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'https:' || parsed.protocol === 'ssh:') && Boolean(parsed.hostname) && parsed.pathname.length > 1 && !parsed.username?.includes('\n')
  } catch {
    return false
  }
}
