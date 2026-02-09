import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type RenderContext,
  type ParsedKey,
  type CliRenderer,
} from "@opentui/core"
import type { Theme } from "../themes"
import type { GitCommitInfo } from "../services/git"
import {
  colorizeGraphChars,
  getBranchColor,
  formatRefTag,
  truncateMessage,
  type BranchColorName,
} from "../utils/gitGraph"

export interface LoadMoreResult {
  commits: GitCommitInfo[]
  hasMore: boolean
}

interface GitLogViewOptions {
  theme: Theme
  commits: GitCommitInfo[]
  onSelectCommit: (hash: string) => void
  onClose: () => void
  onLoadMore?: () => Promise<LoadMoreResult>
  hasMore?: boolean
}

interface RowRenderables {
  row: BoxRenderable
  message: TextRenderable
}

export class GitLogView extends BoxRenderable {
  private renderCtx: RenderContext
  private theme: Theme
  private commits: GitCommitInfo[]
  private onSelectCommit: (hash: string) => void
  private onClose: () => void
  private onLoadMore?: () => Promise<LoadMoreResult>
  private hasMore: boolean

  private cursorIndex: number = 0
  private scrollBox!: ScrollBoxRenderable
  private resultsBox!: BoxRenderable
  private rowRenderables: RowRenderables[] = []
  private statusText!: TextRenderable
  private modalBox!: BoxRenderable
  private modalWidth: number
  private isLoadingMore: boolean = false
  private loadingId: number = 0
  private isDestroyed: boolean = false

  private static readonly MAX_VISIBLE_ROWS = 20
  private static readonly MIN_MODAL_WIDTH = 60
  private static readonly MAX_MODAL_WIDTH = 120
  private static readonly MAX_GRAPH_WIDTH = 20
  private static readonly MODAL_PADDING = 10

  constructor(ctx: RenderContext, options: GitLogViewOptions) {
    super(ctx, {
      id: "git-log-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#00000080",
    })

    this.renderCtx = ctx
    this.theme = options.theme
    this.commits = options.commits
    this.onSelectCommit = options.onSelectCommit
    this.onClose = options.onClose
    this.onLoadMore = options.onLoadMore
    this.hasMore = options.hasMore ?? false

    const renderer = ctx as CliRenderer
    const termWidth = renderer.width || 80
    this.modalWidth = Math.min(
      GitLogView.MAX_MODAL_WIDTH,
      Math.max(GitLogView.MIN_MODAL_WIDTH, termWidth - GitLogView.MODAL_PADDING)
    )

    this.buildUI()
    this.renderCommits()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.renderCommits()
  }

  private buildUI(): void {
    const t = this.theme.colors

    this.modalBox = new BoxRenderable(this.renderCtx, {
      id: "git-log-modal",
      flexDirection: "column",
      width: this.modalWidth,
      maxHeight: GitLogView.MAX_VISIBLE_ROWS + 6,
      border: true,
      borderStyle: "rounded",
      borderColor: t.accent,
      backgroundColor: t.sidebarBg,
      padding: 1,
    })

    const headerBox = new BoxRenderable(this.renderCtx, {
      id: "git-log-header",
      flexDirection: "row",
      height: 1,
      marginBottom: 1,
    })

    const title = new TextRenderable(this.renderCtx, {
      id: "git-log-title",
      content: "Git Log",
      fg: t.accent,
    })
    headerBox.add(title)

    const commitCount = new TextRenderable(this.renderCtx, {
      id: "git-log-count",
      content: `  (${this.commits.length} commits)`,
      fg: t.textMuted,
    })
    headerBox.add(commitCount)

    this.modalBox.add(headerBox)

    const divider = new TextRenderable(this.renderCtx, {
      id: "git-log-divider",
      content: "─".repeat(this.modalWidth - 4),
      fg: t.border,
      marginBottom: 1,
    })
    this.modalBox.add(divider)

    this.scrollBox = new ScrollBoxRenderable(this.renderCtx, {
      id: "git-log-scroll",
      flexGrow: 1,
      maxHeight: GitLogView.MAX_VISIBLE_ROWS,
    })

    this.resultsBox = new BoxRenderable(this.renderCtx, {
      id: "git-log-results",
      flexDirection: "column",
    })

    this.scrollBox.add(this.resultsBox)
    this.modalBox.add(this.scrollBox)

    const divider2 = new TextRenderable(this.renderCtx, {
      id: "git-log-divider2",
      content: "─".repeat(this.modalWidth - 4),
      fg: t.border,
      marginTop: 1,
    })
    this.modalBox.add(divider2)

    this.statusText = new TextRenderable(this.renderCtx, {
      id: "git-log-status",
      content: this.getStatusText(),
      fg: t.textMuted,
      marginTop: 1,
    })
    this.modalBox.add(this.statusText)

    this.add(this.modalBox)
  }

  private getStatusText(): string {
    if (this.isLoadingMore) {
      return "Loading more commits..."
    }
    const total = this.commits.length
    const current = total > 0 ? this.cursorIndex + 1 : 0
    const totalDisplay = this.hasMore ? `${total}+` : `${total}`
    return `[Esc] Close  [j/k] Navigate  [g/G] First/Last  [Enter] View Diff  ${current}/${totalDisplay}`
  }

  private clearResults(): void {
    for (const { row } of this.rowRenderables) {
      row.destroy()
    }
    this.rowRenderables = []
  }

  private getColorForBranch(colorName: BranchColorName): string {
    const t = this.theme.colors
    const colorMap: Record<BranchColorName, string> = {
      accent: t.accent,
      success: t.success,
      warning: t.warning,
      error: t.error,
      info: t.info,
      purple: t.purple,
    }
    return colorMap[colorName]
  }

  private renderCommitRow(
    commit: GitCommitInfo,
    index: number,
    graphColWidth: number,
    isCursor: boolean,
  ): RowRenderables {
    const t = this.theme.colors

    const row = new BoxRenderable(this.renderCtx, {
      id: `git-log-row-${index}`,
      flexDirection: "row",
      height: 1,
      backgroundColor: isCursor ? t.selectionBg : "transparent",
    })

    const graphColors = colorizeGraphChars(commit.graphChars)
    const graphBox = new BoxRenderable(this.renderCtx, {
      id: `git-log-graph-${index}`,
      flexDirection: "row",
      width: graphColWidth,
    })

    for (let i = 0; i < graphColors.length; i++) {
      const { char, colorIndex } = graphColors[i]
      const colorName = getBranchColor(colorIndex)
      const color = this.getColorForBranch(colorName)

      const charText = new TextRenderable(this.renderCtx, {
        id: `git-log-graph-char-${index}-${i}`,
        content: char,
        fg: char === "*" ? color : char === " " ? t.textMuted : color,
      })
      graphBox.add(charText)
    }

    const paddingNeeded = graphColWidth - graphColors.length
    if (paddingNeeded > 0) {
      const padding = new TextRenderable(this.renderCtx, {
        id: `git-log-graph-pad-${index}`,
        content: " ".repeat(paddingNeeded),
        fg: t.textMuted,
      })
      graphBox.add(padding)
    }

    row.add(graphBox)

    const hash = new TextRenderable(this.renderCtx, {
      id: `git-log-hash-${index}`,
      content: commit.hash + " ",
      fg: t.warning,
    })
    row.add(hash)

    let usedWidth = graphColWidth + commit.hash.length + 1

    if (commit.refs.length > 0) {
      const refsBox = new BoxRenderable(this.renderCtx, {
        id: `git-log-refs-${index}`,
        flexDirection: "row",
      })

      for (let ri = 0; ri < Math.min(commit.refs.length, 3); ri++) {
        const ref = commit.refs[ri]
        const { text, isHead, isTag, isRemote } = formatRefTag(ref)

        let refColor = t.success
        let prefix = ""
        if (isHead) {
          refColor = t.accent
        } else if (isTag) {
          refColor = t.purple
          prefix = "tag:"
        } else if (isRemote) {
          refColor = t.error
        }

        const displayText = prefix + text
        const refText = new TextRenderable(this.renderCtx, {
          id: `git-log-ref-${index}-${ri}`,
          content: `(${displayText}) `,
          fg: refColor,
        })
        refsBox.add(refText)
        usedWidth += displayText.length + 3
      }

      if (commit.refs.length > 3) {
        const moreRefs = new TextRenderable(this.renderCtx, {
          id: `git-log-ref-more-${index}`,
          content: `+${commit.refs.length - 3} `,
          fg: t.textMuted,
        })
        refsBox.add(moreRefs)
        usedWidth += 4
      }

      row.add(refsBox)
    }

    const authorDateWidth = commit.author.length + commit.relativeDate.length + 4
    const availableForMessage = this.modalWidth - usedWidth - authorDateWidth - 6

    const message = new TextRenderable(this.renderCtx, {
      id: `git-log-msg-${index}`,
      content: truncateMessage(commit.message, Math.max(availableForMessage, 20)) + " ",
      fg: isCursor ? t.text : t.textDim,
      flexGrow: 1,
      wrapMode: "none",
    })
    row.add(message)

    const author = new TextRenderable(this.renderCtx, {
      id: `git-log-author-${index}`,
      content: commit.author,
      fg: t.info,
    })
    row.add(author)

    const date = new TextRenderable(this.renderCtx, {
      id: `git-log-date-${index}`,
      content: " " + commit.relativeDate,
      fg: t.textMuted,
    })
    row.add(date)

    return { row, message }
  }

  private renderCommits(): void {
    this.clearResults()
    const t = this.theme.colors

    if (this.commits.length === 0) {
      const noResults = new TextRenderable(this.renderCtx, {
        id: "git-log-empty",
        content: "No commits found",
        fg: t.textMuted,
      })
      this.resultsBox.add(noResults)
      return
    }

    const maxGraphWidth = this.commits.reduce((max, c) => Math.max(max, c.graphChars.length), 0)
    const graphColWidth = Math.min(maxGraphWidth + 1, GitLogView.MAX_GRAPH_WIDTH)

    for (let index = 0; index < this.commits.length; index++) {
      const renderable = this.renderCommitRow(
        this.commits[index],
        index,
        graphColWidth,
        index === this.cursorIndex,
      )
      this.resultsBox.add(renderable.row)
      this.rowRenderables.push(renderable)
    }

    this.scrollToCursor()
    this.updateStatus()
  }

  private updateCursor(oldIndex: number, newIndex: number): void {
    const t = this.theme.colors

    if (oldIndex >= 0 && oldIndex < this.rowRenderables.length) {
      const oldRow = this.rowRenderables[oldIndex]
      oldRow.row.backgroundColor = "transparent"
      oldRow.message.fg = t.textDim
    }

    if (newIndex >= 0 && newIndex < this.rowRenderables.length) {
      const newRow = this.rowRenderables[newIndex]
      newRow.row.backgroundColor = t.selectionBg
      newRow.message.fg = t.text
    }

    this.scrollToCursor()
    this.updateStatus()
  }

  private scrollToCursor(): void {
    if (this.cursorIndex >= 0) {
      this.scrollBox.scrollTo(this.cursorIndex)
    }
  }

  private updateStatus(): void {
    this.statusText.content = this.getStatusText()
  }

  appendCommits(newCommits: GitCommitInfo[], hasMore: boolean): void {
    this.hasMore = hasMore
    if (newCommits.length === 0) {
      this.isLoadingMore = false
      this.updateStatus()
      return
    }

    const existingMaxGraph = this.commits.reduce((max, c) => Math.max(max, c.graphChars.length), 0)
    const newMaxGraph = newCommits.reduce((max, c) => Math.max(max, c.graphChars.length), 0)
    const graphColWidth = Math.min(
      Math.max(existingMaxGraph, newMaxGraph) + 1,
      GitLogView.MAX_GRAPH_WIDTH
    )

    const startIndex = this.commits.length
    this.commits = [...this.commits, ...newCommits]

    for (let i = 0; i < newCommits.length; i++) {
      const index = startIndex + i
      const renderable = this.renderCommitRow(
        newCommits[i],
        index,
        graphColWidth,
        index === this.cursorIndex,
      )
      this.resultsBox.add(renderable.row)
      this.rowRenderables.push(renderable)
    }

    this.isLoadingMore = false
    this.updateStatus()
  }

  private async triggerLoadMore(): Promise<void> {
    if (this.isDestroyed || this.isLoadingMore || !this.hasMore || !this.onLoadMore) return
    this.isLoadingMore = true
    this.loadingId++
    const currentLoadingId = this.loadingId
    this.updateStatus()

    try {
      const result = await this.onLoadMore()
      if (this.isDestroyed || currentLoadingId !== this.loadingId) {
        this.isLoadingMore = false
        return
      }
      this.appendCommits(result.commits, result.hasMore)
    } catch {
      this.isLoadingMore = false
      if (!this.isDestroyed && currentLoadingId === this.loadingId) {
        this.hasMore = false
        this.updateStatus()
      }
    }
  }

  private isEnterKey(key: ParsedKey): boolean {
    return (
      key.name === "return" ||
      key.name === "enter" ||
      key.sequence === "\r" ||
      key.sequence === "\n"
    )
  }

  handleKey(key: ParsedKey): boolean {
    if (key.name === "escape") {
      this.onClose()
      return true
    }

    if (this.isEnterKey(key)) {
      if (this.commits.length > 0 && this.cursorIndex < this.commits.length) {
        const commit = this.commits[this.cursorIndex]
        this.onSelectCommit(commit.hash)
      }
      return true
    }

    if (key.name === "j" || key.name === "down") {
      if (this.cursorIndex < this.commits.length - 1) {
        const oldIndex = this.cursorIndex
        this.cursorIndex++
        this.updateCursor(oldIndex, this.cursorIndex)
        if (this.cursorIndex >= this.commits.length - 1 && this.hasMore) {
          this.triggerLoadMore()
        }
      }
      return true
    }

    if (key.name === "k" || key.name === "up") {
      if (this.cursorIndex > 0) {
        const oldIndex = this.cursorIndex
        this.cursorIndex--
        this.updateCursor(oldIndex, this.cursorIndex)
      }
      return true
    }

    if (key.name === "g" && !key.shift) {
      const oldIndex = this.cursorIndex
      this.cursorIndex = 0
      this.updateCursor(oldIndex, this.cursorIndex)
      return true
    }

    if (key.name === "G" || (key.name === "g" && key.shift)) {
      const oldIndex = this.cursorIndex
      this.cursorIndex = Math.max(0, this.commits.length - 1)
      this.updateCursor(oldIndex, this.cursorIndex)
      if (this.hasMore) {
        this.triggerLoadMore()
      }
      return true
    }

    if (key.name === "d" && !key.ctrl) {
      const halfPage = Math.floor(GitLogView.MAX_VISIBLE_ROWS / 2)
      const oldIndex = this.cursorIndex
      this.cursorIndex = Math.min(this.commits.length - 1, this.cursorIndex + halfPage)
      this.updateCursor(oldIndex, this.cursorIndex)
      if (this.cursorIndex >= this.commits.length - 1 && this.hasMore) {
        this.triggerLoadMore()
      }
      return true
    }

    if (key.name === "u" && !key.ctrl) {
      const halfPage = Math.floor(GitLogView.MAX_VISIBLE_ROWS / 2)
      const oldIndex = this.cursorIndex
      this.cursorIndex = Math.max(0, this.cursorIndex - halfPage)
      this.updateCursor(oldIndex, this.cursorIndex)
      return true
    }

    return true
  }

  destroy(): void {
    this.isDestroyed = true
    this.clearResults()
    this.scrollBox?.destroy()
    this.resultsBox?.destroy()
    this.statusText?.destroy()
    this.modalBox?.destroy()
    super.destroy()
  }
}
