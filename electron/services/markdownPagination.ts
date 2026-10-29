// Serialized into the isolated print window. Keep all helpers inside this function.
export async function paginateMarkdownReport(): Promise<number> {
  await document.fonts.ready
  await Promise.all(
    [...document.images].map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error('Không tải được ảnh báo cáo.'))
          })
    )
  )
  // Contents and figure/table lists can span several pages just like the report body.
  let frontPage = 0
  const roman = (value: number) => {
    let result = ''
    for (const [number, symbol] of [
      [100, 'c'],
      [90, 'xc'],
      [50, 'l'],
      [40, 'xl'],
      [10, 'x'],
      [9, 'ix'],
      [5, 'v'],
      [4, 'iv'],
      [1, 'i']
    ] as const)
      while (value >= number) {
        result += symbol
        value -= number
      }
    return result
  }
  for (const sheet of [...document.querySelectorAll<HTMLElement>('.contents, .lists')]) {
    let current = sheet
    let area = sheet.querySelector<HTMLElement>('.page-content')!
    const items = [...area.children]
    area.replaceChildren()
    let title = items[0]?.textContent || 'Contents'
    const numberFront = () => {
      current.dataset.number = roman(++frontPage)
      current.querySelector('footer')!.innerHTML = `Page ${roman(frontPage)}/<span data-total>1</span>`
    }
    numberFront()
    for (const item of items) {
      if (item.tagName === 'H1') title = item.textContent || title
      area.append(item)
      if (area.scrollHeight <= area.clientHeight + 1) continue
      item.remove()
      const next = sheet.cloneNode(false) as HTMLElement
      const nextArea = document.createElement('div')
      nextArea.className = 'page-content'
      const heading = document.createElement('h1')
      heading.textContent = `${title} (continued)`
      nextArea.append(heading, item)
      next.append(nextArea, document.createElement('footer'))
      current.after(next)
      current = next
      area = nextArea
      numberFront()
    }
  }
  const source = document.getElementById('report-source')!
  // Size each unbreakable formula to its container before measuring page heights.
  for (const math of source.querySelectorAll<HTMLElement>('.katex-display > .katex')) {
    const container = math.closest<HTMLElement>('td, th, li') || source
    const available = container.clientWidth - 8
    const width = [...math.querySelectorAll('.katex-html > .katex-base')].reduce(
      (total, base) => total + base.getBoundingClientRect().width,
      0
    )
    const tag = math.querySelector('.katex-tag, .tag')
    const reserve = tag ? tag.getBoundingClientRect().width + 24 : 0
    if (width > available - reserve)
      math.style.fontSize = `${(parseFloat(getComputedStyle(math).fontSize) * (available - reserve)) / width}px`
  }
  for (const cell of source.querySelectorAll<HTMLElement>('td, th'))
    for (const math of cell.querySelectorAll<HTMLElement>('.katex')) {
      const available = cell.clientWidth - 8
      if (available > 0 && math.getBoundingClientRect().width > available)
        math.style.fontSize = `${available / math.getBoundingClientRect().width}em`
    }
  const blocks = [...source.children] as HTMLElement[]
  const pages: HTMLElement[] = []
  let content!: HTMLElement
  const newPage = () => {
    const sheet = document.createElement('section')
    sheet.className = 'sheet body-page'
    sheet.dataset.number = String(pages.length + 1)
    content = document.createElement('div')
    content.className = 'page-content'
    sheet.append(content)
    const footer = document.createElement('footer')
    footer.innerHTML = `Page ${pages.length + 1}/<span data-total>1</span>`
    sheet.append(footer)
    document.body.append(sheet)
    pages.push(sheet)
  }
  const fits = () => content.scrollHeight <= content.clientHeight + 1
  const splitParagraph = (element: HTMLElement) => {
    const parent = element.parentNode!
    const splitAt = (offset: number) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode(),
        left = offset
      while (node && left > (node.textContent?.length || 0)) {
        left -= node.textContent?.length || 0
        node = walker.nextNode()
      }
      if (!node) return null
      const before = document.createRange()
      before.setStart(element, 0)
      before.setEnd(node, left)
      const after = document.createRange()
      after.setStart(node, left)
      after.setEnd(element, element.childNodes.length)
      const first = element.cloneNode(false) as HTMLElement,
        rest = element.cloneNode(false) as HTMLElement
      first.append(before.cloneContents())
      rest.append(after.cloneContents())
      return [first, rest]
    }
    const words: number[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let textNode = walker.nextNode(),
      offset = 0
    while (textNode) {
      const text = textNode.textContent || ''
      if (!textNode.parentElement?.closest('.katex'))
        for (const match of text.matchAll(/\s+/g)) words.push(offset + match.index! + match[0].length)
      offset += text.length
      textNode = walker.nextNode()
    }
    let low = 0,
      high = words.length - 1,
      best: HTMLElement[] | null = null
    while (low <= high) {
      const mid = (low + high) >> 1,
        split = splitAt(words[mid])
      if (!split) break
      parent.replaceChild(split[0], element)
      const ok = fits()
      parent.replaceChild(element, split[0])
      if (ok) {
        best = split
        low = mid + 1
      } else high = mid - 1
    }
    return best
  }
  newPage()
  while (blocks.length) {
    if (pages.length > 200) throw new Error('Báo cáo vượt giới hạn 200 trang.')
    const block = blocks.shift()!
    if (block.tagName === 'HR') {
      if (content.children.length) newPage()
      continue
    }
    content.append(block)
    if (
      fits() &&
      (!/^H[1-4]$/.test(block.tagName) ||
        content.children.length === 1 ||
        block.getBoundingClientRect().bottom < content.getBoundingClientRect().bottom - 40)
    )
      continue
    const paragraph = /^(P|PRE|BLOCKQUOTE)$/.test(block.tagName)
    if (paragraph) {
      const parts = splitParagraph(block)
      if (parts) {
        content.replaceChild(parts[0], block)
        newPage()
        blocks.unshift(parts[1])
        continue
      }
    }
    const original = block.cloneNode(true)
    if (block.tagName === 'TABLE') {
      const rows = [...block.querySelectorAll('tbody>tr')]
      if (rows.length > 1) {
        const remainder = block.cloneNode(true) as HTMLElement
        remainder.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
        const remainderRows = [...remainder.querySelectorAll('tbody>tr')]
        let kept = rows.length
        while (!fits() && kept > 1) {
          rows[--kept].remove()
        }
        if (fits()) {
          remainderRows.slice(0, kept).forEach((row) => row.remove())
          newPage()
          blocks.unshift(remainder)
          continue
        }
      }
      block.replaceChildren(...original.childNodes)
    }
    if (block.tagName === 'UL' || block.tagName === 'OL') {
      const rest = block.cloneNode(false) as HTMLElement
      const removed: Element[] = []
      while (!fits() && block.children.length > 1) {
        const item = block.lastElementChild!
        removed.unshift(item)
        item.remove()
      }
      let continued = false
      if (!fits()) {
        const item = block.firstElementChild as HTMLElement
        const tail = item.cloneNode(false) as HTMLElement
        tail.classList.add('continued-item')
        while (!fits() && item.children.length > 1) tail.prepend(item.lastElementChild!)
        if (!fits()) {
          const paragraph = item.firstElementChild as HTMLElement | null
          if (paragraph && /^(P|PRE|BLOCKQUOTE)$/.test(paragraph.tagName)) {
            const parts = splitParagraph(paragraph)
            if (parts) {
              item.replaceChild(parts[0], paragraph)
              tail.prepend(parts[1])
            }
          }
        }
        if (fits() && tail.childNodes.length) {
          rest.append(tail)
          continued = true
        }
      }
      if (fits()) {
        removed.forEach((item) => rest.append(item))
        if (block.tagName === 'OL')
          rest.setAttribute(
            'start',
            String(Number(block.getAttribute('start') || 1) + block.children.length - (continued ? 1 : 0))
          )
        newPage()
        blocks.unshift(rest)
        continue
      }
      block.replaceChildren(...original.childNodes)
    }
    if (content.children.length > 1) {
      block.remove()
      newPage()
      blocks.unshift(block)
      continue
    }
    throw new Error('Một khối nội dung quá cao cho trang A4. Hãy chia đoạn, bảng hoặc hình thành các phần nhỏ hơn.')
  }
  source.remove()
  document.querySelectorAll('[data-total]').forEach((element) => {
    element.textContent = String(pages.length)
  })
  document.querySelectorAll('[data-page-target]').forEach((element) => {
    const target = document.getElementById(element.getAttribute('data-page-target') || '')
    element.textContent = target?.closest<HTMLElement>('.sheet')?.dataset.number || '1'
  })
  return document.querySelectorAll('.sheet').length
}
