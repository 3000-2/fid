export type ThemeName = "one-dark" | "github-dark" | "monokai" | "catppuccin" | "dracula"

export interface Theme {
  name: ThemeName
  displayName: string
  description: string
  colors: {
    background: string
    sidebarBg: string
    terminalBg: string
    statusBarBg: string
    border: string
    borderFocused: string
    text: string
    textMuted: string
    textDim: string
    accent: string
    success: string
    warning: string
    error: string
    info: string
    purple: string
    addedBg: string
    removedBg: string
    addedLineNumberBg: string
    removedLineNumberBg: string
    cursorBg: string
    selectionBg: string
    selectionFg: string
    scrollbarBg: string
    scrollbarThumb: string
  }
}

export const themes: Record<ThemeName, Theme> = {
  "one-dark": {
    name: "one-dark",
    displayName: "One Dark",
    description: "dark blue-gray",
    colors: {
      background: "#282c34",
      sidebarBg: "#21252b",
      terminalBg: "#1e2127",
      statusBarBg: "#21252b",
      border: "#3E4451",
      borderFocused: "#61afef",
      text: "#abb2bf",
      textMuted: "#5c6370",
      textDim: "#636d83",
      accent: "#61afef",
      success: "#98c379",
      warning: "#e5c07b",
      error: "#e06c75",
      info: "#56b6c2",
      purple: "#c678dd",
      addedBg: "#2d4a2d",
      removedBg: "#4d2d2d",
      addedLineNumberBg: "#1e3a1e",
      removedLineNumberBg: "#3a1e1e",
      cursorBg: "#528bff",
      selectionBg: "#3E4451",
      selectionFg: "#ffffff",
      scrollbarBg: "#252527",
      scrollbarThumb: "#9a9ea3",
    },
  },

  "github-dark": {
    name: "github-dark",
    displayName: "GitHub Dark",
    description: "dark with blue accents",
    colors: {
      background: "#0d1117",
      sidebarBg: "#161b22",
      terminalBg: "#0d1117",
      statusBarBg: "#161b22",
      border: "#30363d",
      borderFocused: "#58a6ff",
      text: "#c9d1d9",
      textMuted: "#8b949e",
      textDim: "#6e7681",
      accent: "#58a6ff",
      success: "#3fb950",
      warning: "#d29922",
      error: "#f85149",
      info: "#39c5cf",
      purple: "#a371f7",
      addedBg: "#1b4721",
      removedBg: "#5c1e1e",
      addedLineNumberBg: "#144620",
      removedLineNumberBg: "#4c1717",
      cursorBg: "#58a6ff",
      selectionBg: "#264f78",
      selectionFg: "#ffffff",
      scrollbarBg: "#161b22",
      scrollbarThumb: "#484f58",
    },
  },

  monokai: {
    name: "monokai",
    displayName: "Monokai",
    description: "classic dark with warm colors",
    colors: {
      background: "#272822",
      sidebarBg: "#1e1f1c",
      terminalBg: "#1e1f1c",
      statusBarBg: "#1e1f1c",
      border: "#49483e",
      borderFocused: "#f92672",
      text: "#f8f8f2",
      textMuted: "#75715e",
      textDim: "#5c5d56",
      accent: "#66d9ef",
      success: "#a6e22e",
      warning: "#e6db74",
      error: "#f92672",
      info: "#66d9ef",
      purple: "#ae81ff",
      addedBg: "#2d4a2d",
      removedBg: "#4d2d2d",
      addedLineNumberBg: "#1e3a1e",
      removedLineNumberBg: "#3a1e1e",
      cursorBg: "#f8f8f0",
      selectionBg: "#49483e",
      selectionFg: "#f8f8f2",
      scrollbarBg: "#1e1f1c",
      scrollbarThumb: "#75715e",
    },
  },

  catppuccin: {
    name: "catppuccin",
    displayName: "Catppuccin",
    description: "soothing pastel theme",
    colors: {
      background: "#1e1e2e",
      sidebarBg: "#181825",
      terminalBg: "#11111b",
      statusBarBg: "#181825",
      border: "#313244",
      borderFocused: "#cba6f7",
      text: "#cdd6f4",
      textMuted: "#6c7086",
      textDim: "#585b70",
      accent: "#cba6f7",
      success: "#a6e3a1",
      warning: "#f9e2af",
      error: "#f38ba8",
      info: "#89dceb",
      purple: "#cba6f7",
      addedBg: "#1e3a29",
      removedBg: "#3a1e2e",
      addedLineNumberBg: "#162b1f",
      removedLineNumberBg: "#2b1622",
      cursorBg: "#f5e0dc",
      selectionBg: "#45475a",
      selectionFg: "#cdd6f4",
      scrollbarBg: "#181825",
      scrollbarThumb: "#585b70",
    },
  },

  dracula: {
    name: "dracula",
    displayName: "Dracula",
    description: "dark theme with vibrant colors",
    colors: {
      background: "#282a36",
      sidebarBg: "#21222c",
      terminalBg: "#1e1f29",
      statusBarBg: "#21222c",
      border: "#44475a",
      borderFocused: "#bd93f9",
      text: "#f8f8f2",
      textMuted: "#6272a4",
      textDim: "#4a5578",
      accent: "#bd93f9",
      success: "#50fa7b",
      warning: "#f1fa8c",
      error: "#ff5555",
      info: "#8be9fd",
      purple: "#bd93f9",
      addedBg: "#1f3d1f",
      removedBg: "#3d1f1f",
      addedLineNumberBg: "#162b16",
      removedLineNumberBg: "#2b1616",
      cursorBg: "#f8f8f2",
      selectionBg: "#44475a",
      selectionFg: "#f8f8f2",
      scrollbarBg: "#21222c",
      scrollbarThumb: "#6272a4",
    },
  },
}

export const themeNames = Object.keys(themes) as ThemeName[]

export const statusColors: Record<string, (theme: Theme) => string> = {
  M: (t) => t.colors.warning,
  A: (t) => t.colors.success,
  D: (t) => t.colors.error,
  R: (t) => t.colors.accent,
  C: (t) => t.colors.purple,
  U: (t) => t.colors.error,
  "?": (t) => t.colors.textMuted,
}
