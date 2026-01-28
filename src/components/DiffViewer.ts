import {
  BoxRenderable,
  TextRenderable,
  DiffRenderable,
  ScrollBoxRenderable,
  type RenderContext,
} from "@opentui/core"
import { SyntaxStyle } from "@opentui/core"
import { parseColor } from "@opentui/core"
import { type Theme, themes } from "../themes"

interface DiffViewerOptions {
  diff?: string
  filePath?: string
  filetype?: string
  theme?: Theme
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

    const resolvedFiletype = filetype || (filePath ? getFiletype(filePath) : "text")
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
    this.showEmptyState()
  }

  destroy(): void {
    this.syntaxStyle.destroy()
    super.destroy()
  }
}
