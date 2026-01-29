import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
} from "@opentui/core"
import type { Theme } from "../themes"

interface ToastOptions {
  theme: Theme
}

export class Toast extends BoxRenderable {
  private messageText: TextRenderable
  private hideTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(ctx: RenderContext, options: ToastOptions) {
    super(ctx, {
      id: "toast",
      position: "absolute",
      top: 1,
      right: 2,
      flexDirection: "row",
      paddingLeft: 1,
      paddingRight: 1,
      border: true,
      borderStyle: "rounded",
      borderColor: options.theme.colors.success,
      backgroundColor: options.theme.colors.sidebarBg,
    })

    this.visible = false

    this.messageText = new TextRenderable(ctx, {
      id: "toast-message",
      content: "",
      fg: options.theme.colors.text,
    })
    this.add(this.messageText)
  }

  show(message: string, duration: number = 2000): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
    }

    this.messageText.content = message
    this.visible = true

    this.hideTimeout = setTimeout(() => {
      this.visible = false
      this.hideTimeout = null
    }, duration)
  }

  setTheme(theme: Theme): void {
    this.borderColor = theme.colors.success
    this.backgroundColor = theme.colors.sidebarBg
    this.messageText.fg = theme.colors.text
  }

  destroy(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
    }
    super.destroy()
  }
}
