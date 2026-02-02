import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import type { Theme } from "../themes"

interface CommitModalOptions {
  theme: Theme
  stagedCount: number
  onCommit: (message: string) => void
  onClose: () => void
}

export class CommitModal extends BoxRenderable {
  private renderCtx: RenderContext
  private theme: Theme
  private stagedCount: number
  private onCommit: (message: string) => void
  private onClose: () => void

  private message: string = ""
  private inputText!: TextRenderable
  private errorText: TextRenderable | null = null
  private modalBox!: BoxRenderable

  private static readonly MODAL_WIDTH = 55
  private static readonly CONTENT_WIDTH = CommitModal.MODAL_WIDTH - 4

  constructor(ctx: RenderContext, options: CommitModalOptions) {
    super(ctx, {
      id: "commit-modal-overlay",
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
    this.stagedCount = options.stagedCount
    this.onCommit = options.onCommit
    this.onClose = options.onClose

    this.buildUI()
  }

  private buildUI(): void {
    const t = this.theme.colors

    this.modalBox = new BoxRenderable(this.renderCtx, {
      id: "commit-modal",
      flexDirection: "column",
      width: CommitModal.MODAL_WIDTH,
      border: true,
      borderStyle: "rounded",
      borderColor: t.accent,
      backgroundColor: t.sidebarBg,
      padding: 1,
    })

    const title = new TextRenderable(this.renderCtx, {
      id: "commit-title",
      content: "Commit Changes",
      fg: t.accent,
      marginBottom: 1,
    })
    this.modalBox.add(title)

    const divider = new TextRenderable(this.renderCtx, {
      id: "commit-divider",
      content: "─".repeat(CommitModal.CONTENT_WIDTH),
      fg: t.border,
      marginBottom: 1,
    })
    this.modalBox.add(divider)

    const info = new TextRenderable(this.renderCtx, {
      id: "commit-info",
      content: `${this.stagedCount} staged file${this.stagedCount !== 1 ? "s" : ""}`,
      fg: t.success,
      marginBottom: 1,
    })
    this.modalBox.add(info)

    const label = new TextRenderable(this.renderCtx, {
      id: "commit-label",
      content: "Message:",
      fg: t.text,
      marginBottom: 1,
    })
    this.modalBox.add(label)

    const inputBox = new BoxRenderable(this.renderCtx, {
      id: "commit-input-box",
      flexDirection: "row",
      height: 1,
      marginBottom: 1,
      border: true,
      borderStyle: "single",
      borderColor: t.border,
      paddingLeft: 1,
      paddingRight: 1,
    })

    this.inputText = new TextRenderable(this.renderCtx, {
      id: "commit-input",
      content: "▏",
      fg: t.text,
      flexGrow: 1,
    })
    inputBox.add(this.inputText)
    this.modalBox.add(inputBox)

    const hint = new TextRenderable(this.renderCtx, {
      id: "commit-hint",
      content: "[Enter] Commit  [Esc] Cancel",
      fg: t.textMuted,
      marginTop: 1,
    })
    this.modalBox.add(hint)

    this.add(this.modalBox)
  }

  private updateInput(): void {
    this.inputText.content = this.message + "▏"
  }

  showError(message: string): void {
    const t = this.theme.colors

    if (this.errorText) {
      this.modalBox.remove(this.errorText.id)
      this.errorText.destroy()
      this.errorText = null
    }

    this.errorText = new TextRenderable(this.renderCtx, {
      id: "commit-error",
      content: message,
      fg: t.error,
      marginTop: 1,
    })
    this.modalBox.add(this.errorText)
  }

  handleKey(key: ParsedKey): boolean {
    if (key.name === "escape") {
      this.onClose()
      return true
    }

    const isEnter = key.name === "return" || key.name === "enter" || key.sequence === "\r" || key.sequence === "\n"
    if (isEnter) {
      if (this.message.trim()) {
        this.onCommit(this.message.trim())
      } else {
        this.showError("Please enter a commit message")
      }
      return true
    }

    if (key.name === "backspace") {
      if (this.message.length > 0) {
        this.message = this.message.slice(0, -1)
        this.updateInput()
      }
      return true
    }

    if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
      this.message += key.sequence
      this.updateInput()
      return true
    }

    return true
  }

  destroy(): void {
    if (this.errorText) {
      this.errorText.destroy()
      this.errorText = null
    }
    super.destroy()
  }
}
