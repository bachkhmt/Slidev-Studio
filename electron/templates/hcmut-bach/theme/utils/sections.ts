import { computed } from 'vue'
import { useNav, useSlideContext } from '@slidev/client'

export interface HbSection {
  no: number
  title: string
  short: string
  sub?: string
  startNo: number
  endNo: number
  slideNumbers: number[]
}

/**
 * Sections are declared by slides using `layout: section`. The interval up to
 * the next section becomes the mini-frame range shown in the Beamer headline.
 */
export function useSections() {
  const { slides, go } = useNav()
  const { $page } = useSlideContext()

  const sections = computed<HbSection[]>(() => {
    const allSlides = slides.value
    const boundaries = allSlides
      .map((slide, index) => {
        const frontmatter = slide.meta?.slide?.frontmatter ?? {}
        if (frontmatter.layout !== 'section') return undefined

        const no = Number(slide.no ?? index + 1)
        const title = String(frontmatter.title ?? slide.meta?.slide?.title ?? '')
        const sub = frontmatter.sub ? String(frontmatter.sub) : undefined
        return {
          no,
          title,
          short: String(frontmatter.short ?? frontmatter.shortTitle ?? title),
          sub,
          startNo: no
        }
      })
      .filter((section): section is NonNullable<typeof section> => Boolean(section))

    return boundaries.map((section, index) => {
      const nextSection = boundaries[index + 1]
      const lastSlide = allSlides[allSlides.length - 1]
      const endNo = nextSection ? nextSection.no - 1 : Number(lastSlide?.no ?? section.no)
      const slideNumbers = allSlides
        .map((slide, slideIndex) => Number(slide.no ?? slideIndex + 1))
        .filter((no) => no >= section.startNo && no <= endNo)

      return { ...section, endNo, slideNumbers }
    })
  })

  const current = computed(() => {
    let index = -1
    sections.value.forEach((section, sectionIndex) => {
      if (section.startNo <= Number($page.value)) index = sectionIndex
    })
    return index
  })

  return { sections, current, go }
}
