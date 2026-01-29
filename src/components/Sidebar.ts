import {
  BoxRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import { GitChangesRenderable } from "./GitChanges"
import type { GitFile } from "../services/git"
import { type Theme, themes } from "../themes"

interface SidebarOptions {
  width: number
  files: GitFile[]
  cwd: string
  selectedPath?: string
  onFileSelect?: (file: GitFile) => void
  onFocusChange?: (panel: "files" | null) => void
  theme?: Theme
}

type FocusPanel = "files" | null

export class SidebarRenderable extends BoxRenderable {
  private gitChanges: GitChangesRenderable
  private sidebarWidth: number
  private focusedPanel: FocusPanel = null
  private onFocusChange?: (panel: FocusPanel) => void

  constructor(ctx: RenderContext, options: SidebarOptions) {
    const initialTheme = options.theme || themes["one-dark"]

    super(ctx, {
      id: "sidebar",
      width: options.width,
      flexDirection: "column",
      backgroundColor: initialTheme.colors.sidebarBg,
      padding: 1,
    })

    this.sidebarWidth = options.width
    this.onFocusChange = options.onFocusChange

    this.gitChanges = new GitChangesRenderable(ctx, {
      files: options.files,
      selectedPath: options.selectedPath,
      onFileSelect: options.onFileSelect,
      theme: initialTheme,
    })
    this.gitChanges.flexGrow = 1
    this.add(this.gitChanges)
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
      this.setFocusedPanel(null)
      return true
    }

    if (this.focusedPanel === "files") {
      return this.gitChanges.handleKey(key)
    }

    return false
  }

  setTheme(theme: Theme): void {
    this.backgroundColor = theme.colors.sidebarBg
    this.gitChanges.setTheme(theme)
  }

  updateFiles(files: GitFile[]): void {
    this.gitChanges.updateFiles(files)
  }

  setSelectedPath(path: string | undefined): void {
    this.gitChanges.setSelectedPath(path)
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
}
