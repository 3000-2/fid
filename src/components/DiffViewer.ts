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
import { VirtualScrollManager } from "../utils/virtualScroll"

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
  private absoluteHunkPositions: number[] = []
  private gPending: boolean = false
  private gTimeout: ReturnType<typeof setTimeout> | null = null

  private virtualScroll: VirtualScrollManager
  private currentFilePath?: string
  private currentFiletype?: string

  private originalDiff: string = ""
  private isFullFileView: boolean = false
  private fullDiffContent: string | null = null
  private onRequestFullDiff?: (filePath: string) => Promise<string | null>

  private static readonly LINE_SCROLL = 1
  private static readonly HALF_PAGE_SCROLL = 10
  private static readonly HUNK_THRESHOLD = 1
  private static readonly VIRTUAL_SCROLL_WINDOW = 1000
  private static readonly VIRTUAL_SCROLL_THRESHOLD = 200
  private static readonly VIRTUAL_SCROLL_BUFFER = 300
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

    this.virtualScroll = new VirtualScrollManager({
      windowSize: DiffViewerRenderable.VIRTUAL_SCROLL_WINDOW,
      bufferThreshold: DiffViewerRenderable.VIRTUAL_SCROLL_THRESHOLD,
      bufferSize: DiffViewerRenderable.VIRTUAL_SCROLL_BUFFER,
    })

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
    this.currentFilePath = filePath
    this.currentFiletype = filetype

    const lines = diff.split("\n")
    this.virtualScroll.setLines(lines)
    this.parseAbsoluteHunkPositions(lines)

    const visibleDiff = this.getVisibleDiff()
    this.parseHunkPositions(visibleDiff)
    this.renderDiff(visibleDiff)
  }

  private getVisibleDiff(): string {
    const state = this.virtualScroll.getState()

    if (state.totalLines <= DiffViewerRenderable.VIRTUAL_SCROLL_WINDOW) {
      return this.virtualScroll.getWindowedContent()
    }

    let content = this.virtualScroll.getWindowedContent()
    const windowInfo = `Lines ${state.windowStart + 1}-${state.windowEnd} of ${state.totalLines}`

    if (!this.virtualScroll.isAtStart()) {
      content = `    ─── ${windowInfo} (scroll up for more) ───\n\n` + content
    }

    if (!this.virtualScroll.isAtEnd()) {
      content += `\n\n    ─── ${windowInfo} (scroll down for more) ───`
    }

    return content
  }

  private renderDiff(diff: string): void {
    const state = this.virtualScroll.getState()
    const disableSyntax = state.totalLines > DiffViewerRenderable.VIRTUAL_SCROLL_WINDOW
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

  private checkVirtualScroll(): void {
    if (!this.scrollBox) return

    const scrollTop = this.scrollBox.scrollTop
    const absolutePosition = this.virtualScroll.toAbsolutePosition(scrollTop)

    if (this.virtualScroll.handleScroll(absolutePosition)) {
      const visibleDiff = this.getVisibleDiff()
      this.parseHunkPositions(visibleDiff)
      this.renderDiff(visibleDiff)

      const newRelativePosition = this.virtualScroll.toRelativePosition(absolutePosition)
      this.scrollBox.scrollTo(Math.max(0, newRelativePosition))
    }
  }

  async toggleFullFileView(): Promise<boolean> {
    if (!this.currentFilePath || !this.onRequestFullDiff) return false

    if (this.isFullFileView) {
      const lines = this.originalDiff.split("\n")
      this.virtualScroll.setLines(lines)
      this.parseAbsoluteHunkPositions(lines)
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

    const lines = this.fullDiffContent.split("\n")
    this.virtualScroll.setLines(lines)
    this.parseAbsoluteHunkPositions(lines)
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

  getScrollInfo(): { current: number; total: number } {
    const state = this.virtualScroll.getState()
    const scrollTop = this.scrollBox?.scrollTop ?? 0
    return {
      current: this.virtualScroll.toAbsolutePosition(scrollTop),
      total: state.totalLines,
    }
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
    this.absoluteHunkPositions = []
    this.virtualScroll.reset()
    this.currentFilePath = undefined
    this.currentFiletype = undefined
    this.originalDiff = ""
    this.isFullFileView = false
    this.fullDiffContent = null
    this.showEmptyState()
  }

  private parseAbsoluteHunkPositions(lines: string[]): void {
    this.absoluteHunkPositions = []
    let lineNumber = 0

    for (const line of lines) {
      if (line.startsWith("@@")) {
        this.absoluteHunkPositions.push(lineNumber)
      }
      lineNumber++
    }
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
      this.scrollToAbsolute(this.virtualScroll.getTotalLines() - 1)
      return true
    }

    if (key.name === "g" && !key.shift && !key.ctrl && !key.meta) {
      if (this.gPending) {
        this.scrollToAbsolute(0)
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

    switch (key.name) {
      case "j":
      case "down":
        this.scrollBox.scrollBy(DiffViewerRenderable.LINE_SCROLL)
        this.checkVirtualScroll()
        return true

      case "k":
      case "up":
        this.scrollBox.scrollBy(-DiffViewerRenderable.LINE_SCROLL)
        this.checkVirtualScroll()
        return true

      case "d":
        if (!key.ctrl && !key.meta) {
          this.scrollBox.scrollBy(DiffViewerRenderable.HALF_PAGE_SCROLL)
          this.checkVirtualScroll()
          return true
        }
        break

      case "u":
        if (!key.ctrl && !key.meta) {
          this.scrollBox.scrollBy(-DiffViewerRenderable.HALF_PAGE_SCROLL)
          this.checkVirtualScroll()
          return true
        }
        break
    }

    return false
  }

  private scrollToAbsolute(absolutePosition: number): void {
    const result = this.virtualScroll.scrollToAbsolute(absolutePosition)

    if (result.windowChanged) {
      const visibleDiff = this.getVisibleDiff()
      this.parseHunkPositions(visibleDiff)
      this.renderDiff(visibleDiff)
    }

    if (this.scrollBox) {
      this.scrollBox.scrollTo(result.relativePosition)
    }
  }

  private goToNextHunk(): void {
    if (this.absoluteHunkPositions.length === 0 || !this.scrollBox) return

    const currentAbsolute = this.virtualScroll.toAbsolutePosition(this.scrollBox.scrollTop)
    const threshold = DiffViewerRenderable.HUNK_THRESHOLD

    for (const pos of this.absoluteHunkPositions) {
      if (pos > currentAbsolute + threshold) {
        this.scrollToAbsolute(pos)
        return
      }
    }
  }

  private goToPrevHunk(): void {
    if (this.absoluteHunkPositions.length === 0 || !this.scrollBox) return

    const currentAbsolute = this.virtualScroll.toAbsolutePosition(this.scrollBox.scrollTop)
    const threshold = DiffViewerRenderable.HUNK_THRESHOLD

    for (let i = this.absoluteHunkPositions.length - 1; i >= 0; i--) {
      if (this.absoluteHunkPositions[i] < currentAbsolute - threshold) {
        this.scrollToAbsolute(this.absoluteHunkPositions[i])
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
