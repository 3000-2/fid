import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import { themes, themeNames, type Theme } from "../themes"
import { type Config, saveConfig } from "../services/config"

type SettingSection = "theme" | "sidebar" | "browseAll"

interface SettingsModalOptions {
  config: Config
  onConfigChange: (config: Config) => void
  onClose: () => void
}

export class SettingsModal extends BoxRenderable {
  private renderCtx: RenderContext
  private config: Config
  private onConfigChange: (config: Config) => void
  private onClose: () => void

  private currentSection: SettingSection = "theme"
  private themeIndex: number
  private sidebarIndex: number
  private browseAllIndex: number

  private modalBox!: BoxRenderable
  private contentBox!: BoxRenderable
  private contentIds: string[] = []

  constructor(ctx: RenderContext, options: SettingsModalOptions) {
    super(ctx, {
      id: "settings-modal-overlay",
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
    this.config = options.config
    this.onConfigChange = options.onConfigChange
    this.onClose = options.onClose

    this.themeIndex = themeNames.indexOf(this.config.theme)
    if (this.themeIndex < 0) this.themeIndex = 0
    this.sidebarIndex = this.config.sidebarPosition === "left" ? 0 : 1
    this.browseAllIndex = this.config.browseAllFiles ? 0 : 1

    this.buildUI()
    this.renderContent()
  }

  private get theme(): Theme {
    return themes[this.config.theme]
  }

  private buildUI(): void {
    const t = this.theme.colors

    this.modalBox = new BoxRenderable(this.renderCtx, {
      id: "settings-modal",
      flexDirection: "column",
      width: 40,
      border: true,
      borderStyle: "rounded",
      borderColor: t.border,
      backgroundColor: t.sidebarBg,
      padding: 1,
    })

    const titleRow = new BoxRenderable(this.renderCtx, {
      id: "settings-title-row",
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 1,
    })

    const title = new TextRenderable(this.renderCtx, {
      id: "settings-title",
      content: "Settings",
      fg: t.accent,
    })

    titleRow.add(title)
    this.modalBox.add(titleRow)

    const divider = new TextRenderable(this.renderCtx, {
      id: "settings-divider",
      content: "─".repeat(36),
      fg: t.border,
      marginBottom: 1,
    })
    this.modalBox.add(divider)

    this.contentBox = new BoxRenderable(this.renderCtx, {
      id: "settings-content",
      flexDirection: "column",
    })
    this.modalBox.add(this.contentBox)

    const hint1 = new TextRenderable(this.renderCtx, {
      id: "settings-hint-1",
      content: "[ESC] Close  [↑↓/jk] Move",
      fg: t.textMuted,
      marginTop: 1,
    })
    this.modalBox.add(hint1)

    const hint2 = new TextRenderable(this.renderCtx, {
      id: "settings-hint-2",
      content: "[Enter] Select",
      fg: t.textMuted,
    })
    this.modalBox.add(hint2)

    this.add(this.modalBox)
  }

  private clearContent(): void {
    for (const id of this.contentIds) {
      this.contentBox.remove(id)
    }
    this.contentIds = []
  }

  private renderContent(): void {
    this.clearContent()
    const t = this.theme.colors

    const themeHeader = new TextRenderable(this.renderCtx, {
      id: "theme-header",
      content: "Theme",
      fg: this.currentSection === "theme" ? t.accent : t.textMuted,
      marginBottom: 1,
    })
    this.contentBox.add(themeHeader)
    this.contentIds.push("theme-header")

    themeNames.forEach((name, index) => {
      const th = themes[name]
      const isSaved = name === this.config.theme
      const isCursor = index === this.themeIndex
      const isActive = this.currentSection === "theme" && isCursor

      const rowId = `modal-theme-${index}`
      const row = new BoxRenderable(this.renderCtx, {
        id: rowId,
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        backgroundColor: isActive ? t.selectionBg : "transparent",
      })

      const bullet = new TextRenderable(this.renderCtx, {
        id: `modal-theme-bullet-${index}`,
        content: isSaved ? "●" : "○",
        fg: isActive ? t.accent : isSaved ? t.text : t.textMuted,
        width: 3,
      })

      const label = new TextRenderable(this.renderCtx, {
        id: `modal-theme-label-${index}`,
        content: th.displayName,
        fg: isActive ? t.accent : isSaved ? t.text : t.textMuted,
      })

      row.add(bullet)
      row.add(label)
      this.contentBox.add(row)
      this.contentIds.push(rowId)
    })

    const spacerId = "modal-spacer"
    const spacer = new BoxRenderable(this.renderCtx, {
      id: spacerId,
      height: 1,
    })
    this.contentBox.add(spacer)
    this.contentIds.push(spacerId)

    const sidebarHeader = new TextRenderable(this.renderCtx, {
      id: "sidebar-header",
      content: "Sidebar Position",
      fg: this.currentSection === "sidebar" ? t.accent : t.textMuted,
      marginBottom: 1,
    })
    this.contentBox.add(sidebarHeader)
    this.contentIds.push("sidebar-header")

    const positions: Array<{ label: string; value: "left" | "right" }> = [
      { label: "Left", value: "left" },
      { label: "Right", value: "right" },
    ]
    positions.forEach((pos, index) => {
      const isSaved = pos.value === this.config.sidebarPosition
      const isCursor = index === this.sidebarIndex
      const isActive = this.currentSection === "sidebar" && isCursor

      const rowId = `modal-sidebar-${index}`
      const row = new BoxRenderable(this.renderCtx, {
        id: rowId,
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        backgroundColor: isActive ? t.selectionBg : "transparent",
      })

      const bullet = new TextRenderable(this.renderCtx, {
        id: `modal-sidebar-bullet-${index}`,
        content: isSaved ? "●" : "○",
        fg: isActive ? t.accent : isSaved ? t.text : t.textMuted,
        width: 3,
      })

      const label = new TextRenderable(this.renderCtx, {
        id: `modal-sidebar-label-${index}`,
        content: pos.label,
        fg: isActive ? t.accent : isSaved ? t.text : t.textMuted,
      })

      row.add(bullet)
      row.add(label)
      this.contentBox.add(row)
      this.contentIds.push(rowId)
    })

    const spacer2Id = "modal-spacer-2"
    const spacer2 = new BoxRenderable(this.renderCtx, {
      id: spacer2Id,
      height: 1,
    })
    this.contentBox.add(spacer2)
    this.contentIds.push(spacer2Id)

    const browseAllHeader = new TextRenderable(this.renderCtx, {
      id: "browseall-header",
      content: "Browse All Files",
      fg: this.currentSection === "browseAll" ? t.accent : t.textMuted,
      marginBottom: 1,
    })
    this.contentBox.add(browseAllHeader)
    this.contentIds.push("browseall-header")

    const browseAllOptions: Array<{ label: string; value: boolean }> = [
      { label: "Enabled", value: true },
      { label: "Disabled", value: false },
    ]
    browseAllOptions.forEach((opt, index) => {
      const isSaved = opt.value === this.config.browseAllFiles
      const isCursor = index === this.browseAllIndex
      const isActive = this.currentSection === "browseAll" && isCursor

      const rowId = `modal-browseall-${index}`
      const row = new BoxRenderable(this.renderCtx, {
        id: rowId,
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        backgroundColor: isActive ? t.selectionBg : "transparent",
      })

      const bullet = new TextRenderable(this.renderCtx, {
        id: `modal-browseall-bullet-${index}`,
        content: isSaved ? "●" : "○",
        fg: isActive ? t.accent : isSaved ? t.text : t.textMuted,
        width: 3,
      })

      const label = new TextRenderable(this.renderCtx, {
        id: `modal-browseall-label-${index}`,
        content: opt.label,
        fg: isActive ? t.accent : isSaved ? t.text : t.textMuted,
      })

      row.add(bullet)
      row.add(label)
      this.contentBox.add(row)
      this.contentIds.push(rowId)
    })
  }

  private updateModalStyle(): void {
    const t = this.theme.colors
    this.modalBox.borderColor = t.border
    this.modalBox.backgroundColor = t.sidebarBg
  }

  handleKey(key: ParsedKey): boolean {
    if (key.name === "escape") {
      this.onClose()
      return true
    }

    const isUp = key.name === "up" || key.name === "k"
    const isDown = key.name === "down" || key.name === "j"
    const isEnter = key.name === "return" || key.name === "enter" || key.sequence === "\r" || key.sequence === "\n"

    if (this.currentSection === "theme") {
      if (isUp && this.themeIndex > 0) {
        this.themeIndex--
        this.renderContent()
        return true
      }
      if (isDown && this.themeIndex < themeNames.length - 1) {
        this.themeIndex++
        this.renderContent()
        return true
      }
      if (isDown && this.themeIndex === themeNames.length - 1) {
        this.currentSection = "sidebar"
        this.renderContent()
        return true
      }
      if (isEnter) {
        this.applyTheme()
        return true
      }
    } else if (this.currentSection === "sidebar") {
      if (isUp && this.sidebarIndex > 0) {
        this.sidebarIndex--
        this.renderContent()
        return true
      }
      if (isUp && this.sidebarIndex === 0) {
        this.currentSection = "theme"
        this.renderContent()
        return true
      }
      if (isDown && this.sidebarIndex < 1) {
        this.sidebarIndex++
        this.renderContent()
        return true
      }
      if (isDown && this.sidebarIndex === 1) {
        this.currentSection = "browseAll"
        this.renderContent()
        return true
      }
      if (isEnter) {
        this.applySidebarPosition()
        return true
      }
    } else if (this.currentSection === "browseAll") {
      if (isUp && this.browseAllIndex > 0) {
        this.browseAllIndex--
        this.renderContent()
        return true
      }
      if (isUp && this.browseAllIndex === 0) {
        this.currentSection = "sidebar"
        this.renderContent()
        return true
      }
      if (isDown && this.browseAllIndex < 1) {
        this.browseAllIndex++
        this.renderContent()
        return true
      }
      if (isEnter) {
        this.applyBrowseAllFiles()
        return true
      }
    }

    return true
  }

  private applyBrowseAllFiles(): void {
    const newValue = this.browseAllIndex === 0
    if (newValue !== this.config.browseAllFiles) {
      this.config = { ...this.config, browseAllFiles: newValue }
      saveConfig(this.config)
      this.renderContent()
      this.onConfigChange(this.config)
    }
  }

  private applyTheme(): void {
    const newTheme = themeNames[this.themeIndex]
    if (newTheme !== this.config.theme) {
      this.config = { ...this.config, theme: newTheme }
      saveConfig(this.config)
      this.updateModalStyle()
      this.renderContent()
      this.onConfigChange(this.config)
    }
  }

  private applySidebarPosition(): void {
    const newPosition = this.sidebarIndex === 0 ? "left" : "right"
    if (newPosition !== this.config.sidebarPosition) {
      this.config = { ...this.config, sidebarPosition: newPosition }
      saveConfig(this.config)
      this.onConfigChange(this.config)
    }
  }
}
