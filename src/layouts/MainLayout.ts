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
import { CommandPalette } from "../components/CommandPalette"
import { HelpModal } from "../components/HelpModal"
import { CommitModal } from "../components/CommitModal"
import { Toast } from "../components/Toast"
import { type GitFile, type GitService, MAX_FILE_SIZE } from "../services/git"
import { type Theme, themes } from "../themes"
import { type Config, saveConfig, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from "../services/config"
import { copyToClipboard } from "../utils/clipboard"
import { validatePathWithinBase } from "../utils/path"
import { logger } from "../utils/logger"

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
  commitModalOpen: boolean
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
  private commitModal: CommitModal | null = null
  private toast: Toast

  private gitService: GitService
  private sidebarWidth: number
  private minWidthForSidebar: number
  private config: Config
  private theme: Theme
  private state: AppState
  private lastWidth: number = 0
  private isRefreshing: boolean = false
  private isCommitting: boolean = false
  private isStagingAll: boolean = false

  constructor(ctx: RenderContext, options: MainLayoutOptions) {
    const theme = themes[options.config.theme]

    super(ctx, {
      id: "main-layout",
      flexDirection: "column",
      flexGrow: 1,
      backgroundColor: theme.colors.background,
      onMouseUp: () => {
        setTimeout(() => {
          if (ctx.hasSelection) {
            const selection = ctx.getSelection()
            if (selection) {
              const text = selection.getSelectedText()
              if (text && text.length > 0) {
                this.copyToClipboard(text)
              }
            }
          }
        }, 0)
      },
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
      commitModalOpen: false,
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

    this.diffViewer = new DiffViewerRenderable(ctx, {
      theme,
      onRequestFullDiff: (filePath) => this.getFullContextDiff(filePath),
      onHunkStage: (hunkIndex, patch) => this.handleHunkStage(hunkIndex, patch),
      onHunkUnstage: (hunkIndex, patch) => this.handleHunkUnstage(hunkIndex, patch),
      onHunkDiscard: (hunkIndex, patch) => this.handleHunkDiscard(hunkIndex, patch),
    })
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
      onStageToggle: (file) => this.handleStageToggle(file),
      onFocusChange: (_panel) => {
        this.updateStatusBar()
      },
      theme,
    })

    this.toast = new Toast(ctx, { theme })
    this.add(this.toast)

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

  private isTogglingStage = false

  private calculateNextFocusPath(
    wasStaged: boolean,
    indexInSection: number,
    newStaged: GitFile[],
    newUnstaged: GitFile[]
  ): string | undefined {
    const sectionFiles = wasStaged ? newStaged : newUnstaged

    if (sectionFiles.length > 0) {
      const nextIndex = Math.min(indexInSection, sectionFiles.length - 1)
      return sectionFiles[nextIndex].path
    }

    if (wasStaged && newUnstaged.length > 0) {
      return newUnstaged[0].path
    }
    if (!wasStaged && newStaged.length > 0) {
      return newStaged[newStaged.length - 1].path
    }

    return undefined
  }

  // Note: isTogglingStage prevents concurrent toggles while refreshFiles() has its own isRefreshing guard.
  // Both guards work independently - isTogglingStage covers the full toggle operation including UI updates.
  private async handleStageToggle(file: GitFile): Promise<void> {
    if (this.isTogglingStage) return
    this.isTogglingStage = true

    try {
      const wasStaged = file.staged
      const sectionFiles = this.state.files.filter(f => f.staged === wasStaged)
      const indexInSection = sectionFiles.findIndex(f => f.path === file.path)

      const success = wasStaged
        ? await this.gitService.unstageFile(file)
        : await this.gitService.stageFile(file)

      if (success) {
        await this.refreshFiles()

        const newStaged = this.state.files.filter(f => f.staged)
        const newUnstaged = this.state.files.filter(f => !f.staged)
        const focusPath = this.calculateNextFocusPath(wasStaged, indexInSection, newStaged, newUnstaged)

        if (focusPath) {
          this.sidebar.setFocusedPath(focusPath)
        }

        const action = wasStaged ? "Unstaged" : "Staged"
        this.toast.show(`${action}: ${file.path.split("/").pop()}`)
      } else {
        this.toast.show("Failed to toggle stage status")
      }
    } finally {
      this.isTogglingStage = false
    }
  }

  private async handleFileSelect(file: GitFile): Promise<void> {
    this.state.selectedFile = file
    this.sidebar.setSelectedPath(file.path)
    this.welcomeText.visible = false
    this.diffViewer.visible = true

    const diff = await this.gitService.getDiff(file.path, file.staged, file.status, file.submodulePath)

    if (diff) {
      this.diffViewer.showDiff(diff, file.path)
    } else {
      this.diffViewer.clear()
    }

    this.state.focusTarget = "diff"
    this.sidebar.setDimmed(true)

    this.updateStatusBar()
  }

  private async getFullContextDiff(filePath: string): Promise<string | null> {
    const file = this.state.selectedFile
    if (!file) return null

    const diff = await this.gitService.getDiff(
      filePath,
      file.staged,
      file.status,
      file.submodulePath,
      true
    )

    return diff || null
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

    if (this.state.commitModalOpen && this.commitModal) {
      return this.commitModal.handleKey(key)
    }

    if (this.state.focusTarget === "sidebar") {
      if (this.sidebar.handleKey(key)) {
        return true
      }
    } else if (this.state.focusTarget === "diff") {
      if (key.name === "o" && !key.ctrl && !key.meta && !key.shift) {
        this.toggleFullFileView()
        return true
      }

      // Hunk actions: + stage, - unstage, x discard
      if (key.sequence === "+" && !key.ctrl && !key.meta) {
        this.stageCurrentHunk()
        return true
      }
      if (key.sequence === "-" && !key.ctrl && !key.meta) {
        this.unstageCurrentHunk()
        return true
      }
      if (key.name === "x" && !key.ctrl && !key.meta && !key.shift) {
        this.discardCurrentHunk()
        return true
      }

      if (this.diffViewer.handleKey(key)) {
        this.updateStatusBar()
        return true
      }
    }

    return false
  }

  private async toggleFullFileView(): Promise<void> {
    const success = await this.diffViewer.toggleFullFileView()
    if (success) {
      const mode = this.diffViewer.isShowingFullFile() ? "Full File" : "Diff"
      this.toast.show(mode)
    }
    this.updateStatusBar()
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
    this.toast.setTheme(this.theme)
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
    } catch (error) {
      logger.error("Error refreshing files:", error)
      this.updateStatus("Error refreshing files")
    } finally {
      this.isRefreshing = false
    }
  }

  private updateStatus(message: string): void {
    this.statusText.content = message
  }

  private updateStatusBar(): void {
    const parts: string[] = []

    if (this.state.focusTarget === "sidebar") {
      parts.push("[Sidebar]")
    } else {
      const mode = this.diffViewer.isShowingFullFile() ? "[Full]" : "[Diff]"
      parts.push(mode)
    }

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
      parts.push("[Tab] sidebar  [n/N] [+] [-] [x]")

      const hunkCount = this.diffViewer.getHunkCount()
      if (hunkCount > 0) {
        const currentHunk = this.diffViewer.getCurrentHunkIndex() + 1
        parts.push(`Hunk ${currentHunk}/${hunkCount}`)
      }
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
      getTrackedFiles: () => this.gitService.getTrackedFiles(),
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
      case "commit":
        this.openCommitModal()
        break
      case "stageAll":
        this.handleStageAll()
        break
      case "unstageAll":
        this.handleUnstageAll()
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

  private async handleBrowseFile(filePath: string): Promise<void> {
    const cwd = this.gitService.getWorkingDirectory()

    const pathValidation = validatePathWithinBase(cwd, filePath)
    if (!pathValidation.valid) {
      logger.error(`Path validation failed for ${filePath}: ${pathValidation.error}`)
      this.welcomeText.content = pathValidation.error || "Invalid file path"
      this.welcomeText.visible = true
      this.diffViewer.visible = false
      return
    }

    const safePath = pathValidation.resolvedPath
    if (!safePath) {
      this.welcomeText.content = "Failed to resolve file path"
      this.welcomeText.visible = true
      this.diffViewer.visible = false
      return
    }

    this.welcomeText.visible = false
    this.diffViewer.visible = true

    try {
      const file = Bun.file(safePath)
      if (!await file.exists()) {
        this.diffViewer.visible = false
        this.welcomeText.content = "File not found"
        this.welcomeText.visible = true
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        this.diffViewer.visible = false
        this.welcomeText.content = `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`
        this.welcomeText.visible = true
        return
      }

      const content = await file.text()
      const lines = content.split("\n")
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop()
      }
      const lineCount = lines.length
      const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lineCount} @@`
      const body = lines.map(line => `+${line}`).join("\n")
      const fakeDiff = `${header}\n${body}`
      this.diffViewer.showDiff(fakeDiff, filePath)
    } catch (error) {
      logger.error(`Failed to read file ${filePath}:`, error)
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

  private async openCommitModal(): Promise<void> {
    const stagedCount = await this.gitService.getStagedCount()

    if (stagedCount === 0) {
      this.toast.show("No staged changes to commit")
      return
    }

    this.state.commitModalOpen = true
    this.commitModal = new CommitModal(this.renderCtx, {
      theme: this.theme,
      stagedCount,
      onCommit: (message) => this.handleCommit(message),
      onClose: () => this.closeCommitModal(),
    })
    this.add(this.commitModal)
  }

  private closeCommitModal(): void {
    if (this.commitModal) {
      this.remove(this.commitModal.id)
      this.commitModal = null
    }
    this.state.commitModalOpen = false
  }

  private async handleStageAll(): Promise<void> {
    if (this.isStagingAll) return
    this.isStagingAll = true

    try {
      const unstaged = this.state.files.filter(f => !f.staged)
      if (unstaged.length === 0) {
        this.toast.show("No unstaged changes")
        return
      }

      const success = await this.gitService.stageAll()
      if (success) {
        await this.refreshFiles()
        this.toast.show(`Staged ${unstaged.length} file${unstaged.length !== 1 ? "s" : ""}`)
      } else {
        this.toast.show("Failed to stage files")
      }
    } finally {
      this.isStagingAll = false
    }
  }

  private async handleUnstageAll(): Promise<void> {
    if (this.isStagingAll) return
    this.isStagingAll = true

    try {
      const staged = this.state.files.filter(f => f.staged)
      if (staged.length === 0) {
        this.toast.show("No staged changes")
        return
      }

      const success = await this.gitService.unstageAll()
      if (success) {
        await this.refreshFiles()
        this.toast.show(`Unstaged ${staged.length} file${staged.length !== 1 ? "s" : ""}`)
      } else {
        this.toast.show("Failed to unstage files")
      }
    } finally {
      this.isStagingAll = false
    }
  }

  private async stageCurrentHunk(): Promise<void> {
    const file = this.state.selectedFile
    if (!file || file.staged) {
      this.toast.show("Cannot stage: file is already staged")
      return
    }

    const hunkIndex = this.diffViewer.getCurrentHunkIndex()
    const hunk = this.diffViewer.getHunkByIndex(hunkIndex)
    if (!hunk) {
      this.toast.show("No hunk selected")
      return
    }

    await this.handleHunkStage(hunkIndex, hunk.patch)
  }

  private async unstageCurrentHunk(): Promise<void> {
    const file = this.state.selectedFile
    if (!file || !file.staged) {
      this.toast.show("Cannot unstage: file is not staged")
      return
    }

    const hunkIndex = this.diffViewer.getCurrentHunkIndex()
    const hunk = this.diffViewer.getHunkByIndex(hunkIndex)
    if (!hunk) {
      this.toast.show("No hunk selected")
      return
    }

    await this.handleHunkUnstage(hunkIndex, hunk.patch)
  }

  private async discardCurrentHunk(): Promise<void> {
    const file = this.state.selectedFile
    if (!file || file.staged) {
      this.toast.show("Cannot discard: switch to unstaged view first")
      return
    }

    const hunkIndex = this.diffViewer.getCurrentHunkIndex()
    const hunk = this.diffViewer.getHunkByIndex(hunkIndex)
    if (!hunk) {
      this.toast.show("No hunk selected")
      return
    }

    await this.handleHunkDiscard(hunkIndex, hunk.patch)
  }

  private async handleHunkStage(hunkIndex: number, patch: string): Promise<void> {
    const file = this.state.selectedFile
    if (!file) return

    const success = await this.gitService.stageHunk(file.path, patch)
    if (success) {
      this.toast.show(`Staged hunk ${hunkIndex + 1}`)
      await this.reloadCurrentFile()
    } else {
      this.toast.show("Failed to stage hunk")
    }
  }

  private async handleHunkUnstage(hunkIndex: number, patch: string): Promise<void> {
    const file = this.state.selectedFile
    if (!file) return

    const success = await this.gitService.unstageHunk(file.path, patch)
    if (success) {
      this.toast.show(`Unstaged hunk ${hunkIndex + 1}`)
      await this.reloadCurrentFile()
    } else {
      this.toast.show("Failed to unstage hunk")
    }
  }

  private async handleHunkDiscard(hunkIndex: number, patch: string): Promise<void> {
    const file = this.state.selectedFile
    if (!file) return

    const success = await this.gitService.discardHunk(file.path, patch)
    if (success) {
      this.toast.show(`Discarded hunk ${hunkIndex + 1}`)
      await this.reloadCurrentFile()
    } else {
      this.toast.show("Failed to discard hunk")
    }
  }

  private async reloadCurrentFile(): Promise<void> {
    await this.refreshFiles()
    const file = this.state.selectedFile
    if (file) {
      const updatedFile = this.state.files.find(f => f.path === file.path)
      if (updatedFile) {
        await this.handleFileSelect(updatedFile)
      } else {
        this.diffViewer.clear()
        this.state.selectedFile = undefined
      }
    }
  }

  private async handleCommit(message: string): Promise<void> {
    if (this.isCommitting) return
    this.isCommitting = true

    try {
      const result = await this.gitService.commit(message)

      if (result.success) {
        this.closeCommitModal()
        this.toast.show("Committed successfully")
        await this.refreshFiles()
      } else {
        this.commitModal?.showError(result.error || "Commit failed")
      }
    } finally {
      this.isCommitting = false
    }
  }

  isCommandPaletteOpen(): boolean {
    return this.state.commandPaletteOpen
  }

  isHelpModalOpen(): boolean {
    return this.state.helpModalOpen
  }

  showToast(message: string, duration?: number): void {
    this.toast.show(message, duration)
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await copyToClipboard(text)
      this.toast.show("Copied to clipboard")
    } catch {
      this.toast.show("Failed to copy")
    }
  }

  destroy(): void {
    this.sidebar?.destroy()
    this.diffViewer?.destroy()
    this.settingsModal?.destroy()
    this.commandPalette?.destroy()
    this.helpModal?.destroy()
    this.commitModal?.destroy()
    this.toast?.destroy()
    super.destroy()
  }
}
