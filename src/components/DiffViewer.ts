import {
  BoxRenderable,
  TextRenderable,
  DiffRenderable,
  ScrollBoxRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import { SyntaxStyle } from "@opentui/core"
import { parseColor } from "@opentui/core"
import { type Theme, themes } from "../themes"

interface DiffViewerOptions {
  diff?: string
  filePath?: string
  filetype?: string
  theme?: Theme
  onRequestFullDiff?: (filePath: string) => Promise<string | null>
}

const FILETYPE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  css: "css",
  html: "html",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
}

function getFiletype(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  return FILETYPE_MAP[ext] || "text"
}

export class DiffViewerRenderable extends BoxRenderable {
  private renderCtx: RenderContext
  private scrollBox: ScrollBoxRenderable | null = null
  private diffRenderable: DiffRenderable | null = null
  private emptyState: BoxRenderable | null = null
  private syntaxStyle: SyntaxStyle
  private theme: Theme
  private hunkPositions: number[] = []
  private gPending: boolean = false
  private gTimeout: ReturnType<typeof setTimeout> | null = null

  private fullDiffLines: string[] = []
  private loadedLineCount: number = 0
  private currentFilePath?: string
  private currentFiletype?: string

  private originalDiff: string = ""
  private isFullFileView: boolean = false
  private fullDiffContent: string | null = null
  private onRequestFullDiff?: (filePath: string) => Promise<string | null>

  private static readonly LINE_SCROLL = 1
  private static readonly HALF_PAGE_SCROLL = 10
  private static readonly HUNK_THRESHOLD = 1
  private static readonly CHUNK_SIZE = 1500
  private static readonly DOUBLE_KEY_TIMEOUT_MS = 500

  constructor(ctx: RenderContext, options: DiffViewerOptions = {}) {
    const theme = options.theme || themes["one-dark"]

    super(ctx, {
      id: "diff-viewer",
      flexDirection: "column",
      flexGrow: 1,
      backgroundColor: theme.colors.background,
    })

    this.renderCtx = ctx
    this.theme = theme
    this.onRequestFullDiff = options.onRequestFullDiff

    this.syntaxStyle = this.createSyntaxStyle()

    if (options.diff) {
      this.showDiff(options.diff, options.filePath, options.filetype)
    } else {
      this.showEmptyState()
    }
  }

  private createSyntaxStyle(): SyntaxStyle {
    const t = this.theme.colors
    return SyntaxStyle.fromStyles({
      keyword: { fg: parseColor(t.purple), bold: true },
      "keyword.import": { fg: parseColor(t.purple), bold: true },
      string: { fg: parseColor(t.success) },
      comment: { fg: parseColor(t.textMuted), italic: true },
      number: { fg: parseColor(t.warning) },
      boolean: { fg: parseColor(t.warning) },
      constant: { fg: parseColor(t.warning) },
      function: { fg: parseColor(t.accent) },
      "function.call": { fg: parseColor(t.accent) },
      constructor: { fg: parseColor(t.warning) },
      type: { fg: parseColor(t.warning) },
      operator: { fg: parseColor(t.info) },
      variable: { fg: parseColor(t.text) },
      property: { fg: parseColor(t.error) },
      bracket: { fg: parseColor(t.text) },
      punctuation: { fg: parseColor(t.text) },
      default: { fg: parseColor(t.text) },
    })
  }

  private showEmptyState(): void {
    if (this.scrollBox) {
      this.remove(this.scrollBox.id)
      this.scrollBox = null
      this.diffRenderable = null
    }

    if (!this.emptyState) {
      const t = this.theme.colors
      this.emptyState = new BoxRenderable(this.renderCtx, {
        id: "diff-empty-state",
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      })

      const icon = new TextRenderable(this.renderCtx, {
        id: "diff-empty-icon",
        content: "  ",
        fg: t.textMuted,
      })

      const text = new TextRenderable(this.renderCtx, {
        id: "diff-empty-text",
        content: "Select a file to view diff",
        fg: t.textMuted,
        marginTop: 1,
      })

      const hint = new TextRenderable(this.renderCtx, {
        id: "diff-empty-hint",
        content: "Use j/k to navigate, Enter to select",
        fg: t.border,
        marginTop: 1,
      })

      this.emptyState.add(icon)
      this.emptyState.add(text)
      this.emptyState.add(hint)
      this.add(this.emptyState)
    }
  }

  showDiff(diff: string, filePath?: string, filetype?: string): void {
    if (this.emptyState) {
      this.remove(this.emptyState.id)
      this.emptyState = null
    }

    this.originalDiff = diff
    this.isFullFileView = false
    this.fullDiffContent = null

    this.fullDiffLines = diff.split("\n")
    this.loadedLineCount = Math.min(this.fullDiffLines.length, DiffViewerRenderable.CHUNK_SIZE)
    this.currentFilePath = filePath
    this.currentFiletype = filetype

    const visibleDiff = this.getVisibleDiff()
    this.parseHunkPositions(visibleDiff)
    this.renderDiff(visibleDiff)
  }

  private getVisibleDiff(): string {
    let diff = this.fullDiffLines.slice(0, this.loadedLineCount).join("\n")
    if (this.hasMoreLines()) {
      const remaining = this.fullDiffLines.length - this.loadedLineCount
      diff += `\n\n    ─── Press [L] to load more (${remaining} lines remaining) ───`
    }
    return diff
  }

  private hasMoreLines(): boolean {
    return this.loadedLineCount < this.fullDiffLines.length
  }

  loadMore(): boolean {
    if (!this.hasMoreLines()) return false

    this.loadedLineCount = Math.min(
      this.fullDiffLines.length,
      this.loadedLineCount + DiffViewerRenderable.CHUNK_SIZE
    )

    const visibleDiff = this.getVisibleDiff()
    this.parseHunkPositions(visibleDiff)
    this.renderDiff(visibleDiff)
    return true
  }

  private renderDiff(diff: string): void {
    const lineCount = diff.split("\n").length
    const disableSyntax = lineCount > DiffViewerRenderable.CHUNK_SIZE
    const resolvedFiletype = disableSyntax ? "text" : (this.currentFiletype || (this.currentFilePath ? getFiletype(this.currentFilePath) : "text"))
    const t = this.theme.colors

    if (this.diffRenderable) {
      this.diffRenderable.diff = diff
      this.diffRenderable.filetype = resolvedFiletype
    } else {
      this.scrollBox = new ScrollBoxRenderable(this.renderCtx, {
        id: "diff-scroll",
        flexGrow: 1,
      })

      this.diffRenderable = new DiffRenderable(this.renderCtx, {
        id: "diff-content",
        diff,
        view: "unified",
        filetype: resolvedFiletype,
        syntaxStyle: this.syntaxStyle,
        showLineNumbers: true,
        wrapMode: "none",
        addedBg: t.addedBg,
        removedBg: t.removedBg,
        contextBg: "transparent",
        addedSignColor: t.success,
        removedSignColor: t.error,
        lineNumberFg: t.textDim,
        lineNumberBg: t.sidebarBg,
        addedLineNumberBg: t.addedLineNumberBg,
        removedLineNumberBg: t.removedLineNumberBg,
        selectionBg: t.selectionBg,
        selectionFg: t.selectionFg,
        flexGrow: 1,
      })

      this.scrollBox.add(this.diffRenderable)
      this.add(this.scrollBox)
    }
  }

  async toggleFullFileView(): Promise<boolean> {
    if (!this.currentFilePath || !this.onRequestFullDiff) return false

    if (this.isFullFileView) {
      this.fullDiffLines = this.originalDiff.split("\n")
      this.loadedLineCount = Math.min(this.fullDiffLines.length, DiffViewerRenderable.CHUNK_SIZE)
      this.isFullFileView = false

      const visibleDiff = this.getVisibleDiff()
      this.parseHunkPositions(visibleDiff)
      this.renderDiff(visibleDiff)
      return true
    }

    if (!this.fullDiffContent) {
      this.fullDiffContent = await this.onRequestFullDiff(this.currentFilePath)
    }

    if (!this.fullDiffContent) return false

    this.fullDiffLines = this.fullDiffContent.split("\n")
    this.loadedLineCount = Math.min(this.fullDiffLines.length, DiffViewerRenderable.CHUNK_SIZE)
    this.isFullFileView = true

    const visibleDiff = this.getVisibleDiff()
    this.parseHunkPositions(visibleDiff)
    this.renderDiff(visibleDiff)

    if (this.scrollBox) {
      this.scrollBox.scrollTo(0)
    }

    return true
  }

  isShowingFullFile(): boolean {
    return this.isFullFileView
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.backgroundColor = theme.colors.background

    this.syntaxStyle.destroy()
    this.syntaxStyle = this.createSyntaxStyle()

    if (this.diffRenderable) {
      this.diffRenderable.syntaxStyle = this.syntaxStyle
    }
  }

  clear(): void {
    if (this.scrollBox) {
      this.remove(this.scrollBox.id)
      this.scrollBox = null
      this.diffRenderable = null
    }
    this.hunkPositions = []
    this.fullDiffLines = []
    this.loadedLineCount = 0
    this.currentFilePath = undefined
    this.currentFiletype = undefined
    this.originalDiff = ""
    this.isFullFileView = false
    this.fullDiffContent = null
    this.showEmptyState()
  }

  private parseHunkPositions(diff: string): void {
    this.hunkPositions = []
    const lines = diff.split("\n")
    let lineNumber = 0

    for (const line of lines) {
      if (line.startsWith("@@")) {
        this.hunkPositions.push(lineNumber)
      }
      lineNumber++
    }
  }

  handleKey(key: ParsedKey): boolean {
    if (!this.scrollBox) return false

    if (key.name === "g" && key.shift && !key.ctrl && !key.meta) {
      this.gPending = false
      this.scrollBox.scrollTo(this.scrollBox.scrollHeight)
      return true
    }

    if (key.name === "g" && !key.shift && !key.ctrl && !key.meta) {
      if (this.gPending) {
        this.scrollBox.scrollTo(0)
        this.gPending = false
        if (this.gTimeout) {
          clearTimeout(this.gTimeout)
          this.gTimeout = null
        }
        return true
      } else {
        this.gPending = true
        this.gTimeout = setTimeout(() => {
          this.gPending = false
          this.gTimeout = null
        }, DiffViewerRenderable.DOUBLE_KEY_TIMEOUT_MS)
        return true
      }
    }

    this.gPending = false

    if (key.name === "n" && key.shift && !key.ctrl && !key.meta) {
      this.goToPrevHunk()
      return true
    }

    if (key.name === "n" && !key.shift && !key.ctrl && !key.meta) {
      this.goToNextHunk()
      return true
    }

    if (key.name === "l" && key.shift && !key.ctrl && !key.meta) {
      if (this.loadMore()) {
        this.scrollBox.scrollTo(this.scrollBox.scrollHeight)
      }
      return true
    }

    switch (key.name) {
      case "j":
      case "down":
        this.scrollBox.scrollBy(DiffViewerRenderable.LINE_SCROLL)
        return true

      case "k":
      case "up":
        this.scrollBox.scrollBy(-DiffViewerRenderable.LINE_SCROLL)
        return true

      case "d":
        if (!key.ctrl && !key.meta) {
          this.scrollBox.scrollBy(DiffViewerRenderable.HALF_PAGE_SCROLL)
          return true
        }
        break

      case "u":
        if (!key.ctrl && !key.meta) {
          this.scrollBox.scrollBy(-DiffViewerRenderable.HALF_PAGE_SCROLL)
          return true
        }
        break
    }

    return false
  }

  private goToNextHunk(): void {
    if (this.hunkPositions.length === 0 || !this.scrollBox) return

    const currentScroll = this.scrollBox.scrollTop
    const threshold = DiffViewerRenderable.HUNK_THRESHOLD

    for (const pos of this.hunkPositions) {
      if (pos > currentScroll + threshold) {
        this.scrollBox.scrollTo(pos)
        return
      }
    }
  }

  private goToPrevHunk(): void {
    if (this.hunkPositions.length === 0 || !this.scrollBox) return

    const currentScroll = this.scrollBox.scrollTop
    const threshold = DiffViewerRenderable.HUNK_THRESHOLD

    for (let i = this.hunkPositions.length - 1; i >= 0; i--) {
      if (this.hunkPositions[i] < currentScroll - threshold) {
        this.scrollBox.scrollTo(this.hunkPositions[i])
        return
      }
    }
  }

  destroy(): void {
    if (this.gTimeout) {
      clearTimeout(this.gTimeout)
      this.gTimeout = null
    }
    this.syntaxStyle.destroy()
    super.destroy()
  }
}
