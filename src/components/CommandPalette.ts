import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import { Glob } from "bun"
import { resolve } from "path"
import { realpathSync } from "fs"
import type { Theme } from "../themes"
import type { GitFile } from "../services/git"

type CommandAction = "settings" | "help" | "refresh" | "file" | "browse"

interface Command {
  id: string
  label: string
  description: string
  action: CommandAction
  file?: GitFile
  filePath?: string
}

interface CommandPaletteOptions {
  theme: Theme
  files: GitFile[]
  cwd: string
  browseAllFiles?: boolean
  onCommand: (action: CommandAction, file?: GitFile, filePath?: string) => void
  onClose: () => void
}

export class CommandPalette extends BoxRenderable {
  private renderCtx: RenderContext
  private theme: Theme
  private files: GitFile[]
  private cwd: string
  private browseAllFiles: boolean
  private onCommand: (action: CommandAction, file?: GitFile, filePath?: string) => void
  private onClose: () => void

  private query: string = ""
  private cursorIndex: number = 0
  private filteredItems: Command[] = []
  private projectFiles: string[] = []
  private isLoadingFiles: boolean = false
  private isClosed: boolean = false

  private modalBox!: BoxRenderable
  private inputText!: TextRenderable
  private resultsBox!: BoxRenderable
  private resultIds: string[] = []

  private baseCommands: Command[] = [
    { id: "settings", label: "Settings", description: "Change theme and preferences", action: "settings" },
    { id: "help", label: "Help", description: "Show keyboard shortcuts", action: "help" },
    { id: "refresh", label: "Refresh", description: "Reload changed files", action: "refresh" },
  ]

  private static readonly IGNORE_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".cache",
    "coverage",
    ".turbo",
  ])

  private static readonly MAX_PROJECT_FILES = 1000

  constructor(ctx: RenderContext, options: CommandPaletteOptions) {
    super(ctx, {
      id: "command-palette-overlay",
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
    this.cwd = options.cwd
    this.browseAllFiles = options.browseAllFiles || false
    this.onCommand = options.onCommand
    this.onClose = options.onClose

    if (this.browseAllFiles) {
      this.loadProjectFilesAsync()
    }

    this.filterItems()
    this.buildUI()
    this.renderResults()
  }

  private async loadProjectFilesAsync(): Promise<void> {
    if (this.isLoadingFiles || this.isClosed) return
    this.isLoadingFiles = true

    try {
      const glob = new Glob("**/*")
      const resolvedCwd = resolve(this.cwd)
      const collectedFiles: string[] = []

      for await (const file of glob.scan({ cwd: resolvedCwd, onlyFiles: true })) {
        if (this.isClosed) return
        const segments = file.split("/")
        const shouldIgnore = segments.some(seg => CommandPalette.IGNORE_DIRS.has(seg))
        if (!shouldIgnore) {
          collectedFiles.push(file)
        }
        if (collectedFiles.length >= CommandPalette.MAX_PROJECT_FILES) break
      }

      if (this.isClosed) return
      this.projectFiles = collectedFiles
      this.filterItems()
      this.renderResults()
    } catch {
      // Ignore glob scan errors (permission denied, etc.)
    } finally {
      this.isLoadingFiles = false
    }
  }

  private isPathSafe(filePath: string): boolean {
    try {
      const realCwd = realpathSync(this.cwd)
      const realPath = realpathSync(filePath)
      return realPath === realCwd || realPath.startsWith(realCwd + "/")
    } catch {
      return false
    }
  }

  destroy(): void {
    this.isClosed = true
    super.destroy()
  }

  private buildUI(): void {
    const t = this.theme.colors

    this.modalBox = new BoxRenderable(this.renderCtx, {
      id: "command-palette",
      flexDirection: "column",
      width: 55,
      maxHeight: 20,
      border: true,
      borderStyle: "rounded",
      borderColor: t.accent,
      backgroundColor: t.sidebarBg,
      padding: 1,
    })

    const inputBox = new BoxRenderable(this.renderCtx, {
      id: "palette-input-box",
      flexDirection: "row",
      height: 1,
      marginBottom: 1,
    })

    const prompt = new TextRenderable(this.renderCtx, {
      id: "palette-prompt",
      content: "> ",
      fg: t.accent,
    })

    this.inputText = new TextRenderable(this.renderCtx, {
      id: "palette-input",
      content: "▏",
      fg: t.text,
      flexGrow: 1,
    })

    inputBox.add(prompt)
    inputBox.add(this.inputText)
    this.modalBox.add(inputBox)

    const divider = new TextRenderable(this.renderCtx, {
      id: "palette-divider",
      content: "─".repeat(51),
      fg: t.border,
      marginBottom: 1,
    })
    this.modalBox.add(divider)

    this.resultsBox = new BoxRenderable(this.renderCtx, {
      id: "palette-results",
      flexDirection: "column",
      flexGrow: 1,
    })
    this.modalBox.add(this.resultsBox)

    const hint = new TextRenderable(this.renderCtx, {
      id: "palette-hint",
      content: "[ESC] Close  [↑↓] Move  [Enter] Select",
      fg: t.textMuted,
      marginTop: 1,
    })
    this.modalBox.add(hint)

    this.add(this.modalBox)
  }

  private clearResults(): void {
    for (const id of this.resultIds) {
      this.resultsBox.remove(id)
    }
    this.resultIds = []
  }

  private filterItems(): void {
    const lowerQuery = this.query.toLowerCase().trim()

    if (lowerQuery === "") {
      this.filteredItems = [
        ...this.baseCommands,
        ...this.files.slice(0, 7).map((file) => ({
          id: `file-${file.path}`,
          label: file.path.split("/").pop() || file.path,
          description: file.path,
          action: "file" as CommandAction,
          file,
        })),
      ]

      if (this.browseAllFiles) {
        const browseFiles = this.projectFiles
          .slice(0, 5)
          .map((path) => {
            const fullPath = resolve(this.cwd, path)
            return {
              id: `browse-${path}`,
              label: path.split("/").pop() || path,
              description: path,
              action: "browse" as CommandAction,
              filePath: fullPath,
            }
          })
          .filter((item) => this.isPathSafe(item.filePath))
        this.filteredItems.push(...browseFiles)
      }
    } else {
      const matchedCommands = this.baseCommands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(lowerQuery) ||
          cmd.description.toLowerCase().includes(lowerQuery)
      )

      const matchedGitFiles = this.files
        .filter((file) => {
          const fileName = file.path.split("/").pop() || file.path
          return (
            fileName.toLowerCase().includes(lowerQuery) ||
            file.path.toLowerCase().includes(lowerQuery)
          )
        })
        .slice(0, 10)
        .map((file) => ({
          id: `file-${file.path}`,
          label: file.path.split("/").pop() || file.path,
          description: file.path,
          action: "file" as CommandAction,
          file,
        }))

      const matchedProjectFiles = this.browseAllFiles
        ? this.projectFiles
            .filter((path) => path.toLowerCase().includes(lowerQuery))
            .slice(0, 10)
            .map((path) => {
              const fullPath = resolve(this.cwd, path)
              return {
                id: `browse-${path}`,
                label: path.split("/").pop() || path,
                description: path,
                action: "browse" as CommandAction,
                filePath: fullPath,
              }
            })
            .filter((item) => this.isPathSafe(item.filePath))
        : []

      this.filteredItems = [...matchedCommands, ...matchedGitFiles, ...matchedProjectFiles]
    }

    if (this.cursorIndex >= this.filteredItems.length) {
      this.cursorIndex = Math.max(0, this.filteredItems.length - 1)
    }
  }

  private renderResults(): void {
    this.clearResults()
    const t = this.theme.colors

    this.inputText.content = this.query + "▏"

    if (this.filteredItems.length === 0) {
      const noResults = new TextRenderable(this.renderCtx, {
        id: "no-results",
        content: "No matching results",
        fg: t.textMuted,
      })
      this.resultsBox.add(noResults)
      this.resultIds.push("no-results")
      return
    }

    const maxResults = 10
    const displayItems = this.filteredItems.slice(0, maxResults)

    displayItems.forEach((item, index) => {
      const isCursor = index === this.cursorIndex
      const isCommand = !["file", "browse"].includes(item.action)
      const isBrowse = item.action === "browse"

      const rowId = `palette-result-${index}`
      const row = new BoxRenderable(this.renderCtx, {
        id: rowId,
        flexDirection: "row",
        height: 1,
        backgroundColor: isCursor ? t.selectionBg : "transparent",
        paddingLeft: 1,
      })

      if (isCommand) {
        const icon = new TextRenderable(this.renderCtx, {
          id: `palette-icon-${index}`,
          content: item.action === "settings" ? "⚙ " : item.action === "help" ? "? " : "↻ ",
          fg: t.accent,
        })
        row.add(icon)
      } else if (isBrowse) {
        const icon = new TextRenderable(this.renderCtx, {
          id: `palette-icon-${index}`,
          content: "◇ ",
          fg: t.info,
        })
        row.add(icon)
      } else {
        const file = item.file!
        const status = new TextRenderable(this.renderCtx, {
          id: `palette-status-${index}`,
          content: file.status + " ",
          fg: file.staged ? t.success : t.warning,
        })
        row.add(status)
      }

      const label = new TextRenderable(this.renderCtx, {
        id: `palette-label-${index}`,
        content: item.label,
        fg: isCursor ? t.accent : t.text,
        wrapMode: "none",
      })
      row.add(label)

      if (isCommand || isBrowse) {
        const desc = new TextRenderable(this.renderCtx, {
          id: `palette-desc-${index}`,
          content: "  " + item.description,
          fg: t.textMuted,
          wrapMode: "none",
        })
        row.add(desc)
      }

      this.resultsBox.add(row)
      this.resultIds.push(rowId)
    })

    if (this.filteredItems.length > maxResults) {
      const moreId = "palette-more"
      const more = new TextRenderable(this.renderCtx, {
        id: moreId,
        content: `  ... and ${this.filteredItems.length - maxResults} more`,
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

    const isEnter = key.name === "return" || key.name === "enter" || key.sequence === "\r" || key.sequence === "\n"
    if (isEnter) {
      if (this.filteredItems.length > 0 && this.cursorIndex < this.filteredItems.length) {
        const item = this.filteredItems[this.cursorIndex]
        this.onCommand(item.action, item.file, item.filePath)
      }
      return true
    }

    const isUp = key.name === "up" || (key.name === "k" && key.ctrl)
    const isDown = key.name === "down" || (key.name === "j" && key.ctrl)

    if (isUp) {
      if (this.cursorIndex > 0) {
        this.cursorIndex--
        this.renderResults()
      }
      return true
    }

    if (isDown) {
      if (this.cursorIndex < this.filteredItems.length - 1 && this.cursorIndex < 9) {
        this.cursorIndex++
        this.renderResults()
      }
      return true
    }

    if (key.name === "backspace") {
      if (this.query.length > 0) {
        this.query = this.query.slice(0, -1)
        this.cursorIndex = 0
        this.filterItems()
        this.renderResults()
      }
      return true
    }

    if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
      this.query += key.sequence
      this.cursorIndex = 0
      this.filterItems()
      this.renderResults()
      return true
    }

    return true
  }
}
