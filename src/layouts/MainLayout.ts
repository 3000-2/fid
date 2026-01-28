import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type RenderContext,
  type ParsedKey,
  RGBA,
} from "@opentui/core"
import { SidebarRenderable } from "../components/Sidebar"
import { DiffViewerRenderable } from "../components/DiffViewer"
import { SettingsModal } from "../components/SettingsModal"
import { SearchModal } from "../components/SearchModal"
import type { GitFile, GitService } from "../services/git"
import { type Theme, themes } from "../themes"
import { type Config } from "../services/config"

interface MainLayoutOptions {
  gitService: GitService
  config: Config
  sidebarWidth?: number
  minWidthForSidebar?: number
}

interface AppState {
  files: GitFile[]
  selectedFile?: GitFile
  sidebarVisible: boolean
  sidebarFocused: boolean
  currentBranch: string
  settingsModalOpen: boolean
  searchModalOpen: boolean
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
  private searchModal: SearchModal | null = null

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
    this.sidebarWidth = options.sidebarWidth || 30
    this.minWidthForSidebar = options.minWidthForSidebar || 80
    this.config = options.config
    this.theme = theme

    this.state = {
      files: [],
      sidebarVisible: true,
      sidebarFocused: true,
      currentBranch: "",
      settingsModalOpen: false,
      searchModalOpen: false,
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
      onFocusChange: (panel) => {
        this.state.sidebarFocused = panel !== null
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

    const diff = await this.gitService.getDiff(file.path, file.staged)

    if (diff) {
      this.diffViewer.showDiff(diff, file.path)
    } else {
      this.diffViewer.clear()
    }

    this.updateStatusBar()
  }

  handleKey(key: ParsedKey): boolean {
    if (this.state.settingsModalOpen && this.settingsModal) {
      return this.settingsModal.handleKey(key)
    }

    if (this.state.searchModalOpen && this.searchModal) {
      return this.searchModal.handleKey(key)
    }

    if (this.sidebar && this.state.sidebarFocused) {
      if (this.sidebar.handleKey(key)) {
        return true
      }
    }

    switch (key.name) {
      case "f":
        if (!key.ctrl && !key.meta) {
          this.sidebar.setFocusedPanel("files")
          return true
        }
        break
    }

    return false
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

    if (this.state.currentBranch) {
      parts.push(this.state.currentBranch)
    }

    const fileCount = this.state.files.length
    parts.push(`${fileCount} change${fileCount !== 1 ? "s" : ""}`)

    if (this.state.selectedFile) {
      parts.push(this.state.selectedFile.path)
    }

    parts.push("[j/k] navigate  [Enter] select  [/] search  [?] settings")

    this.statusText.content = parts.join("  |  ")
  }

  toggleSidebar(): void {
    this.state.sidebarVisible = !this.state.sidebarVisible
    this.updateSidebarVisibility()
  }

  isSettingsModalOpen(): boolean {
    return this.state.settingsModalOpen
  }

  toggleSearch(): void {
    if (this.state.searchModalOpen) {
      this.closeSearchModal()
    } else {
      this.openSearchModal()
    }
  }

  private openSearchModal(): void {
    this.state.searchModalOpen = true
    this.searchModal = new SearchModal(this.renderCtx, {
      theme: this.theme,
      files: this.state.files,
      onSelect: (file) => this.handleFileSelect(file),
      onClose: () => this.closeSearchModal(),
    })
    this.add(this.searchModal)
  }

  private closeSearchModal(): void {
    if (this.searchModal) {
      this.remove(this.searchModal.id)
      this.searchModal = null
    }
    this.state.searchModalOpen = false
  }

  isSearchModalOpen(): boolean {
    return this.state.searchModalOpen
  }

  destroy(): void {
    this.sidebar?.destroy()
    super.destroy()
  }
}
