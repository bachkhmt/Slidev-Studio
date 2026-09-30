const hcmutLightTheme = {
  name: 'hcmut-bach-light',
  type: 'light',
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#111111',
    'editorLineNumber.foreground': '#667085',
    'editorLineNumber.activeForeground': '#032b91'
  },
  tokenColors: [
    { scope: ['keyword', 'storage', 'storage.type'], settings: { foreground: '#032b91', fontStyle: 'bold' } },
    { scope: ['string', 'constant.character'], settings: { foreground: '#b42318' } },
    { scope: ['comment'], settings: { foreground: '#16803c', fontStyle: 'italic' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#1488db' } },
    { scope: ['variable', 'meta.object-literal.key'], settings: { foreground: '#111111' } }
  ]
}

export default () => ({
  themes: {
    light: hcmutLightTheme,
    dark: hcmutLightTheme
  }
})
