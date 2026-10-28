import type { FileStamp } from '../../shared/documents'
import { parseSlideIndex, type SlideSourceRange } from './slideIndex'
export class FileContentCache {
  private entries = new Map<string, { stamp: FileStamp; content: string; index?: SlideSourceRange[] }>()
  private generation = 0
  constructor(
    private io: { statFile: (path: string) => Promise<FileStamp>; readFile: (path: string) => Promise<string> }
  ) {}
  async read(path: string): Promise<string> {
    const generation = this.generation,
      stamp = await this.io.statFile(path),
      cached = this.entries.get(path)
    if (cached && cached.stamp.mtimeMs === stamp.mtimeMs && cached.stamp.size === stamp.size) return cached.content
    const content = await this.io.readFile(path)
    if (generation === this.generation) {
      this.entries.delete(path)
      this.entries.set(path, { stamp, content })
      if (this.entries.size > 20) this.entries.delete(this.entries.keys().next().value!)
    }
    return content
  }
  clear() {
    this.generation++
    this.entries.clear()
  }
  async index(path: string): Promise<SlideSourceRange[]> {
    const content = await this.read(path),
      entry = this.entries.get(path)
    if (entry && entry.content === content) return (entry.index ||= parseSlideIndex(content, path))
    return parseSlideIndex(content, path)
  }
}
