import {
  BoxRenderable,
  TextRenderable,
  type MouseEvent,
  type RenderContext,
  type ParsedKey,
  RGBA,
} from "@opentui/core"
import { ScrollBoxRenderable } from "@opentui/core"
import type { GitFile } from "../services/git"
import { type Theme, themes, statusColors } from "../themes"

interface GitChangesOptions {
  files: GitFile[]
  onFileSelect?: (file: GitFile) => void
  selectedPath?: string
  theme?: Theme
}

class FileItem extends BoxRenderable {
  private file: GitFile
  private isSelected = false
  private isFocused = false
  private onSelect?: (file: GitFile) => void
  private nameText: TextRenderable
  private statusText: TextRenderable
  private theme: Theme

  constructor(
    ctx: RenderContext,
    file: GitFile,
    index: number,
    isSelected: boolean,
    isFocused: boolean,
    theme: Theme,
    onSelect?: (file: GitFile) => void
  ) {
    super(ctx, {
      id: `file-item-${index}`,
      height: 1,
      flexDirection: "row",
      paddingLeft: 1,
      paddingRight: 1,
    })

    this.file = file
    this.isSelected = isSelected
    this.isFocused = isFocused
    this.theme = theme
    this.onSelect = onSelect

    const fileName = file.path.split("/").pop() || file.path
    const statusColor = statusColors[file.status]?.(theme) || theme.colors.text

    this.statusText = new TextRenderable(ctx, {
      id: `file-status-${index}`,
      content: file.status,
      fg: statusColor,
      width: 2,
    })

    this.nameText = new TextRenderable(ctx, {
      id: `file-name-${index}`,
      content: fileName,
      fg: this.getTextColor(),
      flexGrow: 1,
      wrapMode: "none",
    })

    this.add(this.statusText)
    this.add(this.nameText)
  }

  private getTextColor(): string {
    if (this.isFocused) return this.theme.colors.accent
    if (this.isSelected) return this.theme.colors.text
    return this.theme.colors.textMuted
  }

  private updateStyle(): void {
    this.nameText.fg = RGBA.fromHex(this.getTextColor())
  }

  setSelected(selected: boolean): void {
    this.isSelected = selected
    this.updateStyle()
  }

  setFocused(focused: boolean): void {
    this.isFocused = focused
    this.updateStyle()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    const statusColor = statusColors[this.file.status]?.(theme) || theme.colors.text
    this.statusText.fg = RGBA.fromHex(statusColor)
    this.updateStyle()
  }

  getFile(): GitFile {
    return this.file
  }

  protected onMouseEvent(event: MouseEvent): void {
    if (event.type === "down" && this.onSelect) {
      this.onSelect(this.file)
      event.stopPropagation()
    }
  }
}

export class GitChangesRenderable extends BoxRenderable {
  private renderCtx: RenderContext
  private files: GitFile[] = []
  private fileItems: FileItem[] = []
  private selectedIndex = -1
  private focusedIndex = -1
  private onFileSelect?: (file: GitFile) => void
  private scrollBox: ScrollBoxRenderable
  private contentBox: BoxRenderable
  private isFocused = false
  private theme: Theme
  private sectionElements: (TextRenderable | BoxRenderable)[] = []

  constructor(ctx: RenderContext, options: GitChangesOptions) {
    const theme = options.theme || themes["one-dark"]

    super(ctx, {
      id: "git-changes",
      flexDirection: "column",
      backgroundColor: theme.colors.sidebarBg,
    })

    this.renderCtx = ctx
    this.onFileSelect = options.onFileSelect
    this.theme = theme

    const staged = options.files.filter(f => f.staged)
    const unstaged = options.files.filter(f => !f.staged)
    this.files = [...staged, ...unstaged]

    if (options.selectedPath) {
      this.selectedIndex = this.files.findIndex(f => f.path === options.selectedPath)
    }

    this.scrollBox = new ScrollBoxRenderable(ctx, {
      id: "git-changes-scroll",
      flexGrow: 1,
    })

    this.contentBox = new BoxRenderable(ctx, {
      id: "git-changes-content",
      flexDirection: "column",
    })

    this.scrollBox.add(this.contentBox)
    this.add(this.scrollBox)

    this.renderFiles()
  }

  private groupFilesByGroup(files: GitFile[]): Map<string, GitFile[]> {
    const groups = new Map<string, GitFile[]>()
    for (const file of files) {
      const group = file.group || ""
      const existing = groups.get(group)
      if (existing) {
        existing.push(file)
      } else {
        groups.set(group, [file])
      }
    }
    return groups
  }

  private renderGroupedFiles(
    files: GitFile[],
    startIndex: number,
    sectionId: string
  ): number {
    let fileIndex = startIndex
    const groups = this.groupFilesByGroup(files)
    const sortedGroups = Array.from(groups.keys()).sort((a, b) => {
      if (a === "") return 1
      if (b === "") return -1
      return a.localeCompare(b)
    })

    for (const groupName of sortedGroups) {
      const groupFiles = groups.get(groupName)
      if (!groupFiles) continue

      if (groupName) {
        const hasSubmodule = groupFiles.some(f => f.isSubmodule)
        const groupLabel = hasSubmodule ? `${groupName} (submodule)` : groupName
        const groupHeader = new TextRenderable(this.renderCtx, {
          id: `${sectionId}-group-${groupName.replace(/\//g, "-")}`,
          content: groupLabel,
          fg: this.theme.colors.textMuted,
          paddingLeft: 1,
        })
        this.sectionElements.push(groupHeader)
        this.contentBox.add(groupHeader)
      }

      for (const file of groupFiles) {
        const idx = fileIndex
        const isSelected = idx === this.selectedIndex
        const isFocused = idx === this.focusedIndex
        const item = new FileItem(
          this.renderCtx,
          file,
          idx,
          isSelected,
          isFocused,
          this.theme,
          (f) => this.handleFileSelect(f, idx)
        )
        this.fileItems.push(item)
        this.contentBox.add(item)
        fileIndex++
      }
    }

    return fileIndex
  }

  private renderFiles(): void {
    for (const item of this.fileItems) {
      this.contentBox.remove(item.id)
    }
    for (const el of this.sectionElements) {
      this.contentBox.remove(el.id)
    }
    this.fileItems = []
    this.sectionElements = []

    if (this.files.length === 0) {
      const emptyMessage = new TextRenderable(this.renderCtx, {
        id: "empty-message",
        content: "No changes",
        fg: this.theme.colors.textMuted,
        paddingLeft: 1,
        paddingTop: 1,
      })
      this.sectionElements.push(emptyMessage)
      this.contentBox.add(emptyMessage)
      return
    }

    const stagedFiles = this.files.filter(f => f.staged)
    const unstagedFiles = this.files.filter(f => !f.staged)

    let fileIndex = 0

    if (stagedFiles.length > 0) {
      const stagedHeader = new TextRenderable(this.renderCtx, {
        id: "section-staged",
        content: `Staged (${stagedFiles.length})`,
        fg: this.theme.colors.success,
        paddingLeft: 1,
      })
      this.sectionElements.push(stagedHeader)
      this.contentBox.add(stagedHeader)

      fileIndex = this.renderGroupedFiles(stagedFiles, fileIndex, "staged")
    }

    if (unstagedFiles.length > 0) {
      const unstagedHeader = new TextRenderable(this.renderCtx, {
        id: "section-unstaged",
        content: `Unstaged (${unstagedFiles.length})`,
        fg: this.theme.colors.warning,
        paddingLeft: 1,
        marginTop: stagedFiles.length > 0 ? 1 : 0,
      })
      this.sectionElements.push(unstagedHeader)
      this.contentBox.add(unstagedHeader)

      fileIndex = this.renderGroupedFiles(unstagedFiles, fileIndex, "unstaged")
    }
  }

  private handleFileSelect(file: GitFile, index: number): void {
    const prevSelected = this.selectedIndex
    this.selectedIndex = index
    this.focusedIndex = index

    if (prevSelected >= 0 && this.fileItems[prevSelected]) {
      this.fileItems[prevSelected].setSelected(false)
      this.fileItems[prevSelected].setFocused(false)
    }
    if (this.fileItems[index]) {
      this.fileItems[index].setSelected(true)
      this.fileItems[index].setFocused(true)
    }

    if (this.onFileSelect) {
      this.onFileSelect(file)
    }
  }

  setFocus(focused: boolean): void {
    this.isFocused = focused

    if (focused && this.focusedIndex < 0 && this.files.length > 0) {
      this.focusedIndex = this.selectedIndex >= 0 ? this.selectedIndex : 0
      this.fileItems[this.focusedIndex]?.setFocused(true)
    }

    if (!focused && this.focusedIndex >= 0) {
      this.fileItems[this.focusedIndex]?.setFocused(false)
    }
  }

  handleKey(key: ParsedKey): boolean {
    if (!this.isFocused || this.files.length === 0) return false

    const prevFocused = this.focusedIndex

    switch (key.name) {
      case "up":
      case "k":
        if (this.focusedIndex > 0) {
          this.focusedIndex--
        }
        break

      case "down":
      case "j":
        if (this.focusedIndex < this.files.length - 1) {
          this.focusedIndex++
        }
        break

      case "home":
      case "g":
        this.focusedIndex = 0
        break

      case "end":
        this.focusedIndex = this.files.length - 1
        break

      case "return":
      case "space":
        if (this.focusedIndex >= 0 && this.files[this.focusedIndex]) {
          this.handleFileSelect(this.files[this.focusedIndex], this.focusedIndex)
        }
        return true

      default:
        return false
    }

    if (prevFocused !== this.focusedIndex) {
      if (prevFocused >= 0 && this.fileItems[prevFocused]) {
        this.fileItems[prevFocused].setFocused(false)
      }
      if (this.focusedIndex >= 0 && this.fileItems[this.focusedIndex]) {
        this.fileItems[this.focusedIndex].setFocused(true)
      }
    }

    return true
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.backgroundColor = theme.colors.sidebarBg

    for (const el of this.sectionElements) {
      if (el instanceof TextRenderable) {
        if (el.id === "section-staged") {
          el.fg = RGBA.fromHex(theme.colors.success)
        } else if (el.id === "section-unstaged") {
          el.fg = RGBA.fromHex(theme.colors.warning)
        } else {
          el.fg = RGBA.fromHex(theme.colors.textMuted)
        }
      }
    }

    for (const item of this.fileItems) {
      item.setTheme(theme)
    }
  }

  updateFiles(files: GitFile[]): void {
    const staged = files.filter(f => f.staged)
    const unstaged = files.filter(f => !f.staged)
    this.files = [...staged, ...unstaged]

    if (this.selectedIndex >= this.files.length) {
      this.selectedIndex = -1
    }
    if (this.focusedIndex >= this.files.length) {
      this.focusedIndex = this.files.length > 0 ? 0 : -1
    }

    this.renderFiles()
  }

  setSelectedPath(path: string | undefined): void {
    const index = path ? this.files.findIndex(f => f.path === path) : -1
    const prevSelected = this.selectedIndex
    const prevFocused = this.focusedIndex
    this.selectedIndex = index
    this.focusedIndex = index

    if (prevSelected >= 0 && this.fileItems[prevSelected]) {
      this.fileItems[prevSelected].setSelected(false)
    }
    if (prevFocused >= 0 && this.fileItems[prevFocused]) {
      this.fileItems[prevFocused].setFocused(false)
    }
    if (index >= 0 && this.fileItems[index]) {
      this.fileItems[index].setSelected(true)
      this.fileItems[index].setFocused(true)
    }
  }
}
