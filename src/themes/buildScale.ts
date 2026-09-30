import type { ColorScale, Theme } from './types'

const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)) as [number, number, number]
}

function hex(value: [number, number, number]): string {
  return `#${value.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

function mix(a: string, b: string, amount: number): string {
  const left = rgb(a)
  const right = rgb(b)
  return hex(left.map((channel, i) => channel + (right[i] - channel) * amount) as [number, number, number])
}

export function buildScale(theme: Theme): { slate: ColorScale; accent: ColorScale } {
  const anchors: Array<[number, string]> = [
    [0, theme.fg],
    [4, theme.fgMuted],
    [8, theme.border],
    [9, theme.surface],
    [10, theme.bg]
  ]
  const slate: ColorScale = {}
  for (let index = 0; index < steps.length; index++) {
    let left = anchors[0]
    let right = anchors[anchors.length - 1]
    for (let i = 0; i < anchors.length - 1; i++) {
      if (index >= anchors[i][0] && index <= anchors[i + 1][0]) {
        left = anchors[i]
        right = anchors[i + 1]
        break
      }
    }
    const span = Math.max(1, right[0] - left[0])
    slate[steps[index]] = mix(left[1], right[1], (index - left[0]) / span)
  }

  const accent: ColorScale = {}
  for (let index = 0; index < steps.length; index++) {
    const amount = (index - 5) / 5
    const target = amount < 0 ? (theme.kind === 'dark' ? '#ffffff' : '#ffffff') : theme.bg
    const strength = amount < 0 ? Math.abs(amount) * 0.78 : amount * (theme.kind === 'dark' ? 0.28 : 0.42)
    accent[steps[index]] = mix(theme.accent, target, strength)
  }
  accent[400] = theme.kind === 'dark' ? mix(theme.accent, '#ffffff', 0.32) : mix(theme.accent, '#000000', 0.16)
  accent[500] = theme.accent
  accent[600] = theme.accent
  return { slate, accent }
}

export function toRgbChannels(color: string): string {
  return rgb(color).join(' ')
}
