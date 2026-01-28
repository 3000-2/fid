import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import type { Theme } from "../themes"

interface HelpModalOptions {
  theme: Theme
  onClose: () => void
}

export class HelpModal extends BoxRenderable {
  private renderCtx: RenderContext
  private theme: Theme
  private onClose: () => void

  constructor(ctx: RenderContext, options: HelpModalOptions) {
    super(ctx, {
      id: "help-modal-overlay",
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
    this.onClose = options.onClose

    this.buildUI()
  }

  private buildUI(): void {
    const t = this.theme.colors

    const modalBox = new BoxRenderable(this.renderCtx, {
      id: "help-modal",
      flexDirection: "column",
      width: 45,
      border: true,
      borderStyle: "rounded",
      borderColor: t.border,
      backgroundColor: t.sidebarBg,
      padding: 1,
    })

    const title = new TextRenderable(this.renderCtx, {
      id: "help-title",
      content: "Keyboard Shortcuts",
      fg: t.accent,
      marginBottom: 1,
    })
    modalBox.add(title)

    const divider = new TextRenderable(this.renderCtx, {
      id: "help-divider",
      content: "─".repeat(41),
      fg: t.border,
      marginBottom: 1,
    })
    modalBox.add(divider)

    const shortcuts = [
      { key: "/", desc: "Open command palette" },
      { key: "?", desc: "Show this help" },
      { key: "j / ↓", desc: "Move down" },
      { key: "k / ↑", desc: "Move up" },
      { key: "Enter", desc: "Select file" },
      { key: "g", desc: "Go to first file" },
      { key: "G", desc: "Go to last file" },
      { key: "r", desc: "Refresh files" },
      { key: "b", desc: "Toggle sidebar" },
      { key: "Ctrl+C", desc: "Quit" },
    ]

    shortcuts.forEach((shortcut, index) => {
      const row = new BoxRenderable(this.renderCtx, {
        id: `help-row-${index}`,
        flexDirection: "row",
        height: 1,
      })

      const key = new TextRenderable(this.renderCtx, {
        id: `help-key-${index}`,
        content: shortcut.key.padEnd(12),
        fg: t.accent,
      })

      const desc = new TextRenderable(this.renderCtx, {
        id: `help-desc-${index}`,
        content: shortcut.desc,
        fg: t.text,
      })

      row.add(key)
      row.add(desc)
      modalBox.add(row)
    })

    const hint = new TextRenderable(this.renderCtx, {
      id: "help-hint",
      content: "Press any key to close",
      fg: t.textMuted,
      marginTop: 1,
    })
    modalBox.add(hint)

    this.add(modalBox)
  }

  handleKey(_key: ParsedKey): boolean {
    this.onClose()
    return true
  }
}
