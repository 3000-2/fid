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

interface HunkInfo {
  index: number
  startLine: number
  endLine: number
  patch: string
}

interface DiffViewerOptions {
  diff?: string
  filePath?: string
  filetype?: string
  theme?: Theme
  onRequestFullDiff?: (filePath: string) => Promise<string | null>
  onHunkStage?: (hunkIndex: number, patch: string) => void
  onHunkUnstage?: (hunkIndex: number, patch: string) => void
  onHunkDiscard?: (hunkIndex: number, patch: string) => void
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

  private hunks: HunkInfo[] = []
  private currentHunkIndex: number = -1
  private onHunkStage?: (hunkIndex: number, patch: string) => void
  private onHunkUnstage?: (hunkIndex: number, patch: string) => void
  private onHunkDiscard?: (hunkIndex: number, patch: string) => void

  private static readonly LINE_SCROLL = 1
  private static readonly HALF_PAGE_SCROLL = 10
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
      onMouseUp: (event) => this.handleMouseClick(event),
    })

    this.renderCtx = ctx
    this.theme = theme
    this.onRequestFullDiff = options.onRequestFullDiff
    this.onHunkStage = options.onHunkStage
    this.onHunkUnstage = options.onHunkUnstage
    this.onHunkDiscard = options.onHunkDiscard

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

    this.parseHunks(diff)
    this.currentHunkIndex = this.hunks.length > 0 ? 0 : -1

    const lines = diff.split("\n")
    this.virtualScroll.setLines(lines)
    this.parseAbsoluteHunkPositions(lines)

    const visibleDiff = this.getVisibleDiff()
    this.parseHunkPositions(visibleDiff)
    this.renderDiff(visibleDiff)
  }

  private parseHunks(diff: string): void {
    this.hunks = []
    const lines = diff.split("\n")
    let currentHunk: { startLine: number; lines: string[] } | null = null
    let diffHeader: string[] = []
    let inHeader = true

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (inHeader) {
        if (line.startsWith("@@")) {
          inHeader = false
        } else {
          diffHeader.push(line)
          continue
        }
      }

      if (line.startsWith("@@")) {
        if (currentHunk) {
          this.hunks.push({
            index: this.hunks.length,
            startLine: currentHunk.startLine,
            endLine: i - 1,
            patch: [...diffHeader, ...currentHunk.lines].join("\n") + "\n",
          })
        }
        currentHunk = { startLine: i, lines: [line] }
      } else if (currentHunk) {
        currentHunk.lines.push(line)
      }
    }

    if (currentHunk) {
      this.hunks.push({
        index: this.hunks.length,
        startLine: currentHunk.startLine,
        endLine: lines.length - 1,
        patch: [...diffHeader, ...currentHunk.lines].join("\n") + "\n",
      })
    }
  }

  getCurrentHunkIndex(): number {
    return this.currentHunkIndex
  }

  getHunkCount(): number {
    return this.hunks.length
  }

  getHunkAt(lineNumber: number): HunkInfo | null {
    for (const hunk of this.hunks) {
      if (lineNumber >= hunk.startLine && lineNumber <= hunk.endLine) {
        return hunk
      }
    }
    return null
  }

  getHunkByIndex(index: number): HunkInfo | null {
    return this.hunks[index] || null
  }

  handleHunkAction(action: "stage" | "unstage" | "discard", hunkIndex: number): void {
    const hunk = this.getHunkByIndex(hunkIndex)
    if (!hunk) return

    switch (action) {
      case "stage":
        this.onHunkStage?.(hunkIndex, hunk.patch)
        break
      case "unstage":
        this.onHunkUnstage?.(hunkIndex, hunk.patch)
        break
      case "discard":
        this.onHunkDiscard?.(hunkIndex, hunk.patch)
        break
    }
  }

  private handleMouseClick(_event: { x: number; y: number }): void {
    // Reserved for future mouse interactions
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
    this.hunks = []
    this.currentHunkIndex = -1
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
    if (this.hunks.length === 0 || !this.scrollBox) return

    if (this.currentHunkIndex < this.hunks.length - 1) {
      this.currentHunkIndex++
      const hunk = this.hunks[this.currentHunkIndex]
      this.scrollToAbsolute(hunk.startLine)
    }
  }

  private goToPrevHunk(): void {
    if (this.hunks.length === 0 || !this.scrollBox) return

    if (this.currentHunkIndex > 0) {
      this.currentHunkIndex--
      const hunk = this.hunks[this.currentHunkIndex]
      this.scrollToAbsolute(hunk.startLine)
    }
  }

  stageCurrentHunk(): boolean {
    if (this.currentHunkIndex < 0 || this.currentHunkIndex >= this.hunks.length) {
      return false
    }
    const hunk = this.hunks[this.currentHunkIndex]
    this.onHunkStage?.(this.currentHunkIndex, hunk.patch)
    return true
  }

  unstageCurrentHunk(): boolean {
    if (this.currentHunkIndex < 0 || this.currentHunkIndex >= this.hunks.length) {
      return false
    }
    const hunk = this.hunks[this.currentHunkIndex]
    this.onHunkUnstage?.(this.currentHunkIndex, hunk.patch)
    return true
  }

  discardCurrentHunk(): boolean {
    if (this.currentHunkIndex < 0 || this.currentHunkIndex >= this.hunks.length) {
      return false
    }
    const hunk = this.hunks[this.currentHunkIndex]
    this.onHunkDiscard?.(this.currentHunkIndex, hunk.patch)
    return true
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
