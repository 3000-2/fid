import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type RenderContext,
  type ParsedKey,
  RGBA,
} from "@opentui/core"
import { realpathSync } from "fs"
import { SidebarRenderable } from "../components/Sidebar"
import { DiffViewerRenderable } from "../components/DiffViewer"
import { SettingsModal } from "../components/SettingsModal"
import { CommandPalette } from "../components/CommandPalette"
import { HelpModal } from "../components/HelpModal"
import type { GitFile, GitService } from "../services/git"
import { type Theme, themes } from "../themes"
import { type Config, saveConfig, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from "../services/config"

interface MainLayoutOptions {
  gitService: GitService
  config: Config
  minWidthForSidebar?: number
}

type FocusTarget = "sidebar" | "diff"

interface AppState {
  files: GitFile[]
  selectedFile?: GitFile
  sidebarVisible: boolean
  focusTarget: FocusTarget
  currentBranch: string
  settingsModalOpen: boolean
  commandPaletteOpen: boolean
  helpModalOpen: boolean
}

export class MainLayout extends BoxRenderable {
  private renderCtx: RenderContext
  private sidebar: SidebarRenderable
  private mainContent: BoxRenderable
  private diffViewer: DiffViewerRenderable
  private statusBar: BoxRenderable
  private statusText: TextRenderable
  private container: BoxRenderable
  private welcomeText: TextRenderable
  private settingsModal: SettingsModal | null = null
  private commandPalette: CommandPalette | null = null
  private helpModal: HelpModal | null = null

  private gitService: GitService
  private sidebarWidth: number
  private minWidthForSidebar: number
  private config: Config
  private theme: Theme
  private state: AppState
  private lastWidth: number = 0
  private isRefreshing: boolean = false

  constructor(ctx: RenderContext, options: MainLayoutOptions) {
    const theme = themes[options.config.theme]

    super(ctx, {
      id: "main-layout",
      flexDirection: "column",
      flexGrow: 1,
      backgroundColor: theme.colors.background,
    })

    this.renderCtx = ctx
    this.gitService = options.gitService
    this.sidebarWidth = options.config.sidebarWidth
    this.minWidthForSidebar = options.minWidthForSidebar || 80
    this.config = options.config
    this.theme = theme

    this.state = {
      files: [],
      sidebarVisible: true,
      focusTarget: "sidebar",
      currentBranch: "",
      settingsModalOpen: false,
      commandPaletteOpen: false,
      helpModalOpen: false,
    }

    this.container = new BoxRenderable(ctx, {
      id: "container",
      flexDirection: "row",
      flexGrow: 1,
    })
    this.add(this.container)

    this.mainContent = new BoxRenderable(ctx, {
      id: "main-content",
      flexDirection: "column",
      flexGrow: 1,
      backgroundColor: theme.colors.terminalBg,
    })

    this.welcomeText = new TextRenderable(ctx, {
      id: "welcome-text",
      content: "Select a file to view diff",
      fg: theme.colors.textMuted,
      paddingTop: 2,
      paddingLeft: 2,
    })
    this.mainContent.add(this.welcomeText)

    this.diffViewer = new DiffViewerRenderable(ctx, { theme })
    this.diffViewer.visible = false
    this.mainContent.add(this.diffViewer)

    this.statusBar = new BoxRenderable(ctx, {
      id: "status-bar",
      height: 1,
      backgroundColor: theme.colors.statusBarBg,
      flexDirection: "row",
      paddingLeft: 1,
      paddingRight: 1,
    })

    this.statusText = new TextRenderable(ctx, {
      id: "status-text",
      content: "Loading...",
      fg: theme.colors.textMuted,
    })
    this.statusBar.add(this.statusText)
    this.add(this.statusBar)

    this.sidebar = new SidebarRenderable(ctx, {
      width: this.sidebarWidth,
      files: [],
      cwd: this.gitService.getWorkingDirectory(),
      onFileSelect: (file) => this.handleFileSelect(file),
      onFocusChange: (_panel) => {
        this.updateStatusBar()
      },
      theme,
    })

    this.buildLayout()
    this.sidebar.setFocusedPanel("files")
    this.refreshFiles()

    const renderer = ctx as CliRenderer
    this.lastWidth = renderer.width
  }

  private buildLayout(): void {
    this.container.remove(this.sidebar.id)
    this.container.remove(this.mainContent.id)

    if (this.config.sidebarPosition === "left") {
      this.container.add(this.sidebar)
      this.container.add(this.mainContent)
    } else {
      this.container.add(this.mainContent)
      this.container.add(this.sidebar)
    }
  }

  resizeSidebar(delta: number): void {
    const newWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, this.sidebarWidth + delta)
    )

    if (newWidth !== this.sidebarWidth) {
      this.sidebarWidth = newWidth
      this.sidebar.setWidth(newWidth)
      this.config = { ...this.config, sidebarWidth: this.sidebarWidth }
      saveConfig(this.config)
    }
  }

  checkResize(): void {
    const renderer = this.renderCtx as CliRenderer
    if (renderer.width !== this.lastWidth) {
      this.lastWidth = renderer.width
      this.handleResize(renderer.width)
    }
  }

  private handleResize(width: number): void {
    const shouldShowSidebar = width >= this.minWidthForSidebar
    if (shouldShowSidebar !== this.state.sidebarVisible) {
      this.state.sidebarVisible = shouldShowSidebar
      this.updateSidebarVisibility()
    }
  }

  private updateSidebarVisibility(): void {
    this.sidebar.visible = this.state.sidebarVisible
    this.updateStatusBar()
  }

  private async handleFileSelect(file: GitFile): Promise<void> {
    this.state.selectedFile = file
    this.sidebar.setSelectedPath(file.path)
    this.welcomeText.visible = false
    this.diffViewer.visible = true

    const isUntracked = file.status === "?"
    const diff = await this.gitService.getDiff(file.path, file.staged, isUntracked)

    if (diff) {
      this.diffViewer.showDiff(diff, file.path)
    } else {
      this.diffViewer.clear()
    }

    this.state.focusTarget = "diff"
    this.sidebar.setDimmed(true)

    this.updateStatusBar()
  }

  handleKey(key: ParsedKey): boolean {
    if (this.state.settingsModalOpen && this.settingsModal) {
      return this.settingsModal.handleKey(key)
    }

    if (this.state.commandPaletteOpen && this.commandPalette) {
      return this.commandPalette.handleKey(key)
    }

    if (this.state.helpModalOpen && this.helpModal) {
      return this.helpModal.handleKey(key)
    }

    if (this.state.focusTarget === "sidebar") {
      if (this.sidebar.handleKey(key)) {
        return true
      }
    } else if (this.state.focusTarget === "diff") {
      if (this.diffViewer.handleKey(key)) {
        return true
      }
    }

    return false
  }

  toggleFocus(): void {
    if (this.state.focusTarget === "sidebar") {
      this.state.focusTarget = "diff"
      this.sidebar.setDimmed(true)
    } else {
      this.state.focusTarget = "sidebar"
      this.sidebar.setDimmed(false)
    }
    this.updateStatusBar()
  }

  isSidebarFocused(): boolean {
    return this.state.focusTarget === "sidebar"
  }

  toggleSettingsModal(): void {
    if (this.state.settingsModalOpen) {
      this.closeSettingsModal()
    } else {
      this.openSettingsModal()
    }
  }

  private openSettingsModal(): void {
    this.state.settingsModalOpen = true
    this.settingsModal = new SettingsModal(this.renderCtx, {
      config: this.config,
      onConfigChange: (newConfig) => this.applyConfig(newConfig),
      onClose: () => this.closeSettingsModal(),
    })
    this.add(this.settingsModal)
  }

  private closeSettingsModal(): void {
    if (this.settingsModal) {
      this.remove(this.settingsModal.id)
      this.settingsModal = null
    }
    this.state.settingsModalOpen = false
  }

  private applyConfig(newConfig: Config): void {
    const themeChanged = newConfig.theme !== this.config.theme
    const sidebarPositionChanged = newConfig.sidebarPosition !== this.config.sidebarPosition

    this.config = newConfig
    this.theme = themes[newConfig.theme]

    if (themeChanged) {
      this.applyTheme()
    }

    if (sidebarPositionChanged) {
      this.buildLayout()
    }
  }

  private applyTheme(): void {
    const t = this.theme.colors
    this.backgroundColor = t.background
    this.mainContent.backgroundColor = t.terminalBg
    this.statusBar.backgroundColor = t.statusBarBg
    this.statusText.fg = RGBA.fromHex(t.textMuted)
    this.welcomeText.fg = RGBA.fromHex(t.textMuted)
    this.sidebar.setTheme(this.theme)
    this.diffViewer.setTheme(this.theme)
  }

  async refreshFiles(): Promise<void> {
    if (this.isRefreshing) return
    this.isRefreshing = true

    try {
      this.updateStatus("Refreshing...")

      const isRepo = await this.gitService.isGitRepo()
      if (!isRepo) {
        this.updateStatus("Not a git repository")
        return
      }

      const [files, branch] = await Promise.all([
        this.gitService.getChangedFiles(),
        this.gitService.getCurrentBranch(),
      ])

      this.state.files = files
      this.state.currentBranch = branch
      this.sidebar.updateFiles(files)

      if (files.length > 0 && !this.state.selectedFile) {
        const staged = files.filter(f => f.staged)
        const unstaged = files.filter(f => !f.staged)
        const sortedFiles = [...staged, ...unstaged]
        this.handleFileSelect(sortedFiles[0])
      }

      this.updateStatusBar()
    } finally {
      this.isRefreshing = false
    }
  }

  private updateStatus(message: string): void {
    this.statusText.content = message
  }

  private updateStatusBar(): void {
    const parts: string[] = []

    const focusIndicator = this.state.focusTarget === "sidebar" ? "[Sidebar]" : "[Diff]"
    parts.push(focusIndicator)

    if (this.state.currentBranch) {
      parts.push(this.state.currentBranch)
    }

    const fileCount = this.state.files.length
    parts.push(`${fileCount} change${fileCount !== 1 ? "s" : ""}`)

    if (this.state.selectedFile) {
      parts.push(this.state.selectedFile.path)
    }

    if (this.state.focusTarget === "sidebar") {
      parts.push("[Tab] diff  [j/k] navigate  [/] commands")
    } else {
      parts.push("[Tab] sidebar  [j/k] scroll  [n/N] hunk")
    }

    this.statusText.content = parts.join("  |  ")
  }

  toggleSidebar(): void {
    this.state.sidebarVisible = !this.state.sidebarVisible
    this.updateSidebarVisibility()
  }

  isSettingsModalOpen(): boolean {
    return this.state.settingsModalOpen
  }

  toggleCommandPalette(): void {
    if (this.state.commandPaletteOpen) {
      this.closeCommandPalette()
    } else {
      this.openCommandPalette()
    }
  }

  private openCommandPalette(): void {
    this.state.commandPaletteOpen = true
    this.commandPalette = new CommandPalette(this.renderCtx, {
      theme: this.theme,
      files: this.state.files,
      cwd: this.gitService.getWorkingDirectory(),
      browseAllFiles: this.config.browseAllFiles,
      onCommand: (action, file, filePath) => this.handleCommand(action, file, filePath),
      onClose: () => this.closeCommandPalette(),
    })
    this.add(this.commandPalette)
  }

  private closeCommandPalette(): void {
    if (this.commandPalette) {
      this.remove(this.commandPalette.id)
      this.commandPalette = null
    }
    this.state.commandPaletteOpen = false
  }

  private handleCommand(action: string, file?: GitFile, filePath?: string): void {
    this.closeCommandPalette()

    switch (action) {
      case "settings":
        this.openSettingsModal()
        break
      case "help":
        this.openHelpModal()
        break
      case "refresh":
        this.refreshFiles()
        break
      case "file":
        if (file) {
          this.handleFileSelect(file)
        }
        break
      case "browse":
        if (filePath) {
          this.handleBrowseFile(filePath)
        }
        break
    }
  }

  private static readonly MAX_BROWSE_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  private async handleBrowseFile(filePath: string): Promise<void> {
    const cwd = this.gitService.getWorkingDirectory()

    try {
      const realCwd = realpathSync(cwd)
      const realPath = realpathSync(filePath)
      if (!realPath.startsWith(realCwd + "/") && realPath !== realCwd) {
        this.welcomeText.content = "Access denied: Path outside working directory"
        this.welcomeText.visible = true
        this.diffViewer.visible = false
        return
      }
    } catch {
      this.welcomeText.content = "Failed to resolve file path"
      this.welcomeText.visible = true
      this.diffViewer.visible = false
      return
    }

    this.welcomeText.visible = false
    this.diffViewer.visible = true

    try {
      const file = Bun.file(filePath)
      if (file.size > MainLayout.MAX_BROWSE_FILE_SIZE) {
        this.diffViewer.visible = false
        this.welcomeText.content = "File too large (max 10MB)"
        this.welcomeText.visible = true
        return
      }

      const content = await file.text()
      const lines = content.split("\n")
      const lineCount = lines.length
      const header = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${lineCount} +1,${lineCount} @@`
      const body = lines.map(line => ` ${line}`).join("\n")
      const fakeDiff = `${header}\n${body}`
      this.diffViewer.showDiff(fakeDiff, filePath)
    } catch {
      this.diffViewer.visible = false
      this.welcomeText.content = "Failed to read file"
      this.welcomeText.visible = true
    }

    this.state.focusTarget = "diff"
    this.sidebar.setDimmed(true)
    this.updateStatusBar()
  }

  toggleHelpModal(): void {
    if (this.state.helpModalOpen) {
      this.closeHelpModal()
    } else {
      this.openHelpModal()
    }
  }

  private openHelpModal(): void {
    this.state.helpModalOpen = true
    this.helpModal = new HelpModal(this.renderCtx, {
      theme: this.theme,
      onClose: () => this.closeHelpModal(),
    })
    this.add(this.helpModal)
  }

  private closeHelpModal(): void {
    if (this.helpModal) {
      this.remove(this.helpModal.id)
      this.helpModal = null
    }
    this.state.helpModalOpen = false
  }

  isCommandPaletteOpen(): boolean {
    return this.state.commandPaletteOpen
  }

  isHelpModalOpen(): boolean {
    return this.state.helpModalOpen
  }

  destroy(): void {
    this.sidebar?.destroy()
    this.diffViewer?.destroy()
    this.settingsModal?.destroy()
    this.commandPalette?.destroy()
    this.helpModal?.destroy()
    super.destroy()
  }
}
