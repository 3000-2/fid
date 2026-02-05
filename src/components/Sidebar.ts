import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import { GitChangesRenderable } from "./GitChanges"
import type { GitFile } from "../services/git"
import { type Theme, themes } from "../themes"

interface CommitViewInfo {
  hash: string
  message: string
}

interface SidebarOptions {
  width: number
  files: GitFile[]
  cwd: string
  selectedPath?: string
  onFileSelect?: (file: GitFile) => void
  onStageToggle?: (file: GitFile) => void
  onFocusChange?: (panel: "files" | null) => void
  onExitCommitMode?: () => void
  theme?: Theme
}

type FocusPanel = "files" | null

export class SidebarRenderable extends BoxRenderable {
  private static readonly COMMIT_MSG_PADDING = 4
  private static readonly DIVIDER_PADDING = 2

  private renderCtx: RenderContext
  private gitChanges: GitChangesRenderable
  private sidebarWidth: number
  private focusedPanel: FocusPanel = null
  private onFocusChange?: (panel: FocusPanel) => void
  private onExitCommitMode?: () => void
  private theme: Theme
  private commitMode: CommitViewInfo | null = null
  private commitHeader: BoxRenderable | null = null

  constructor(ctx: RenderContext, options: SidebarOptions) {
    const initialTheme = options.theme || themes["one-dark"]

    super(ctx, {
      id: "sidebar",
      width: options.width,
      flexDirection: "column",
      backgroundColor: initialTheme.colors.sidebarBg,
      padding: 1,
    })

    this.renderCtx = ctx
    this.sidebarWidth = options.width
    this.onFocusChange = options.onFocusChange
    this.onExitCommitMode = options.onExitCommitMode
    this.theme = initialTheme

    this.gitChanges = new GitChangesRenderable(ctx, {
      files: options.files,
      selectedPath: options.selectedPath,
      onFileSelect: options.onFileSelect,
      onStageToggle: options.onStageToggle,
      theme: initialTheme,
    })
    this.gitChanges.flexGrow = 1
    this.add(this.gitChanges)
  }

  setCommitMode(info: CommitViewInfo | null, files?: GitFile[]): void {
    this.commitMode = info

    if (this.commitHeader) {
      this.remove(this.commitHeader.id)
      this.commitHeader.destroy()
      this.commitHeader = null
    }

    if (info) {
      this.commitHeader = this.buildCommitHeader(info)
      this.remove(this.gitChanges.id)
      this.add(this.commitHeader)
      this.add(this.gitChanges)

      if (files) {
        this.gitChanges.setCommitMode(true)
        this.gitChanges.updateFiles(files)
      }
    } else {
      this.gitChanges.setCommitMode(false)
    }
  }

  private buildCommitHeader(info: CommitViewInfo): BoxRenderable {
    const t = this.theme.colors

    const header = new BoxRenderable(this.renderCtx, {
      id: "commit-mode-header",
      flexDirection: "column",
      marginBottom: 1,
    })

    const backRow = new BoxRenderable(this.renderCtx, {
      id: "commit-back-row",
      flexDirection: "row",
      height: 1,
    })

    const backButton = new TextRenderable(this.renderCtx, {
      id: "commit-back-btn",
      content: "[Esc] Back",
      fg: t.accent,
    })
    backRow.add(backButton)

    header.add(backRow)

    const commitRow = new BoxRenderable(this.renderCtx, {
      id: "commit-info-row",
      flexDirection: "row",
      height: 1,
    })

    const hashText = new TextRenderable(this.renderCtx, {
      id: "commit-hash",
      content: info.hash + " ",
      fg: t.warning,
    })
    commitRow.add(hashText)

    const msgText = new TextRenderable(this.renderCtx, {
      id: "commit-msg",
      content: info.message.slice(0, this.sidebarWidth - info.hash.length - SidebarRenderable.COMMIT_MSG_PADDING),
      fg: t.textMuted,
      wrapMode: "none",
    })
    commitRow.add(msgText)

    header.add(commitRow)

    const divider = new TextRenderable(this.renderCtx, {
      id: "commit-divider",
      content: "─".repeat(this.sidebarWidth - SidebarRenderable.DIVIDER_PADDING),
      fg: t.border,
    })
    header.add(divider)

    return header
  }

  isCommitMode(): boolean {
    return this.commitMode !== null
  }

  setFocusedPanel(panel: FocusPanel): void {
    if (this.focusedPanel === panel) return

    if (this.focusedPanel === "files") {
      this.gitChanges.setFocus(false)
    }

    this.focusedPanel = panel

    if (panel === "files") {
      this.gitChanges.setFocus(true)
    }

    if (this.onFocusChange) {
      this.onFocusChange(panel)
    }
  }

  getFocusedPanel(): FocusPanel {
    return this.focusedPanel
  }

  handleKey(key: ParsedKey): boolean {
    if (key.name === "escape") {
      if (this.commitMode && this.onExitCommitMode) {
        this.onExitCommitMode()
        return true
      }
      this.setFocusedPanel(null)
      return true
    }

    if (this.focusedPanel === "files") {
      return this.gitChanges.handleKey(key)
    }

    return false
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.backgroundColor = theme.colors.sidebarBg
    this.gitChanges.setTheme(theme)

    if (this.commitMode && this.commitHeader) {
      const oldHeader = this.commitHeader
      this.remove(oldHeader.id)
      oldHeader.destroy()
      this.commitHeader = this.buildCommitHeader(this.commitMode)
      this.remove(this.gitChanges.id)
      this.add(this.commitHeader)
      this.add(this.gitChanges)
    }
  }

  updateFiles(files: GitFile[]): void {
    this.gitChanges.updateFiles(files)
  }

  setSelectedPath(path: string | undefined): void {
    this.gitChanges.setSelectedPath(path)
  }

  setFocusedPath(path: string): void {
    this.gitChanges.setFocusedPath(path)
  }

  setWidth(width: number): void {
    this.sidebarWidth = width
    this.width = width
  }

  getWidth(): number {
    return this.sidebarWidth
  }

  setDimmed(dimmed: boolean): void {
    this.opacity = dimmed ? 0.5 : 1
  }

  destroy(): void {
    this.commitHeader?.destroy()
    this.gitChanges?.destroy()
    super.destroy()
  }
}
