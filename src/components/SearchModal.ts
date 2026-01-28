import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import type { Theme } from "../themes"
import type { GitFile } from "../services/git"

interface SearchModalOptions {
  theme: Theme
  files: GitFile[]
  onSelect: (file: GitFile) => void
  onClose: () => void
}

export class SearchModal extends BoxRenderable {
  private renderCtx: RenderContext
  private theme: Theme
  private files: GitFile[]
  private filteredFiles: GitFile[] = []
  private onSelect: (file: GitFile) => void
  private onClose: () => void

  private query: string = ""
  private cursorIndex: number = 0

  private modalBox!: BoxRenderable
  private inputBox!: BoxRenderable
  private inputText!: TextRenderable
  private resultsBox!: BoxRenderable
  private hintText!: TextRenderable
  private resultIds: string[] = []

  constructor(ctx: RenderContext, options: SearchModalOptions) {
    super(ctx, {
      id: "search-modal-overlay",
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
    this.files = options.files
    this.filteredFiles = [...this.files]
    this.onSelect = options.onSelect
    this.onClose = options.onClose

    this.buildUI()
    this.renderResults()
  }

  private buildUI(): void {
    const t = this.theme.colors

    this.modalBox = new BoxRenderable(this.renderCtx, {
      id: "search-modal",
      flexDirection: "column",
      width: 50,
      maxHeight: 20,
      border: true,
      borderStyle: "rounded",
      borderColor: t.border,
      backgroundColor: t.sidebarBg,
      padding: 1,
    })

    const titleRow = new BoxRenderable(this.renderCtx, {
      id: "search-title-row",
      flexDirection: "row",
      marginBottom: 1,
    })

    const title = new TextRenderable(this.renderCtx, {
      id: "search-title",
      content: "Search Files",
      fg: t.accent,
    })

    titleRow.add(title)
    this.modalBox.add(titleRow)

    this.inputBox = new BoxRenderable(this.renderCtx, {
      id: "search-input-box",
      flexDirection: "row",
      height: 1,
      marginBottom: 1,
    })

    const prompt = new TextRenderable(this.renderCtx, {
      id: "search-prompt",
      content: "> ",
      fg: t.accent,
    })

    this.inputText = new TextRenderable(this.renderCtx, {
      id: "search-input",
      content: "",
      fg: t.text,
      flexGrow: 1,
    })

    this.inputBox.add(prompt)
    this.inputBox.add(this.inputText)
    this.modalBox.add(this.inputBox)

    const divider = new TextRenderable(this.renderCtx, {
      id: "search-divider",
      content: "─".repeat(46),
      fg: t.border,
      marginBottom: 1,
    })
    this.modalBox.add(divider)

    this.resultsBox = new BoxRenderable(this.renderCtx, {
      id: "search-results",
      flexDirection: "column",
      flexGrow: 1,
    })
    this.modalBox.add(this.resultsBox)

    this.hintText = new TextRenderable(this.renderCtx, {
      id: "search-hint",
      content: "[ESC] Close  [↑↓] Move  [Enter] Select",
      fg: t.textMuted,
      marginTop: 1,
    })
    this.modalBox.add(this.hintText)

    this.add(this.modalBox)
  }

  private clearResults(): void {
    for (const id of this.resultIds) {
      this.resultsBox.remove(id)
    }
    this.resultIds = []
  }

  private filterFiles(): void {
    if (this.query === "") {
      this.filteredFiles = [...this.files]
    } else {
      const lowerQuery = this.query.toLowerCase()
      this.filteredFiles = this.files.filter((file) => {
        const fileName = file.path.split("/").pop() || file.path
        return fileName.toLowerCase().includes(lowerQuery) ||
               file.path.toLowerCase().includes(lowerQuery)
      })
    }

    if (this.cursorIndex >= this.filteredFiles.length) {
      this.cursorIndex = Math.max(0, this.filteredFiles.length - 1)
    }
  }

  private renderResults(): void {
    this.clearResults()
    const t = this.theme.colors

    this.inputText.content = this.query + "▏"

    if (this.filteredFiles.length === 0) {
      const noResults = new TextRenderable(this.renderCtx, {
        id: "no-results",
        content: this.query ? "No matching files" : "No changed files",
        fg: t.textMuted,
      })
      this.resultsBox.add(noResults)
      this.resultIds.push("no-results")
      return
    }

    const maxResults = 10
    const displayFiles = this.filteredFiles.slice(0, maxResults)

    displayFiles.forEach((file, index) => {
      const isCursor = index === this.cursorIndex
      const fileName = file.path.split("/").pop() || file.path

      const rowId = `search-result-${index}`
      const row = new BoxRenderable(this.renderCtx, {
        id: rowId,
        flexDirection: "row",
        height: 1,
        backgroundColor: isCursor ? t.selectionBg : "transparent",
      })

      const status = new TextRenderable(this.renderCtx, {
        id: `search-status-${index}`,
        content: file.status + " ",
        fg: file.staged ? t.success : t.warning,
      })

      const name = new TextRenderable(this.renderCtx, {
        id: `search-name-${index}`,
        content: fileName,
        fg: isCursor ? t.accent : t.text,
        wrapMode: "none",
      })

      row.add(status)
      row.add(name)
      this.resultsBox.add(row)
      this.resultIds.push(rowId)
    })

    if (this.filteredFiles.length > maxResults) {
      const moreId = "search-more"
      const more = new TextRenderable(this.renderCtx, {
        id: moreId,
        content: `... and ${this.filteredFiles.length - maxResults} more`,
        fg: t.textMuted,
      })
      this.resultsBox.add(more)
      this.resultIds.push(moreId)
    }
  }

  handleKey(key: ParsedKey): boolean {
    if (key.name === "escape") {
      this.onClose()
      return true
    }

    if (key.name === "return") {
      if (this.filteredFiles.length > 0 && this.cursorIndex < this.filteredFiles.length) {
        this.onSelect(this.filteredFiles[this.cursorIndex])
        this.onClose()
      }
      return true
    }

    if (key.name === "up") {
      if (this.cursorIndex > 0) {
        this.cursorIndex--
        this.renderResults()
      }
      return true
    }

    if (key.name === "down") {
      if (this.cursorIndex < this.filteredFiles.length - 1 && this.cursorIndex < 9) {
        this.cursorIndex++
        this.renderResults()
      }
      return true
    }

    if (key.name === "backspace") {
      if (this.query.length > 0) {
        this.query = this.query.slice(0, -1)
        this.cursorIndex = 0
        this.filterFiles()
        this.renderResults()
      }
      return true
    }

    if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
      this.query += key.sequence
      this.cursorIndex = 0
      this.filterFiles()
      this.renderResults()
      return true
    }

    return true
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    const t = theme.colors
    this.modalBox.borderColor = t.border
    this.modalBox.backgroundColor = t.sidebarBg
    this.renderResults()
  }
}
