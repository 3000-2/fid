import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import type { Theme } from "../themes"

interface SearchBarOptions {
  theme: Theme
  onSearch: (query: string) => void
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}

interface MatchInfo {
  current: number
  total: number
}

export class SearchBar extends BoxRenderable {
  private query: string = ""
  private promptText: TextRenderable
  private inputText: TextRenderable
  private matchText: TextRenderable
  private onSearch: (query: string) => void
  private onClose: () => void
  private onNext: () => void
  private onPrev: () => void

  constructor(ctx: RenderContext, options: SearchBarOptions) {
    const t = options.theme.colors

    super(ctx, {
      id: "search-bar",
      flexDirection: "row",
      height: 1,
      backgroundColor: t.sidebarBg,
      paddingLeft: 1,
      paddingRight: 1,
    })

    this.onSearch = options.onSearch
    this.onClose = options.onClose
    this.onNext = options.onNext
    this.onPrev = options.onPrev

    this.promptText = new TextRenderable(ctx, {
      id: "search-prompt",
      content: "> ",
      fg: t.accent,
    })
    this.add(this.promptText)

    this.inputText = new TextRenderable(ctx, {
      id: "search-input",
      content: "",
      fg: t.text,
      flexGrow: 1,
    })
    this.add(this.inputText)

    this.matchText = new TextRenderable(ctx, {
      id: "search-match-count",
      content: "",
      fg: t.textMuted,
    })
    this.add(this.matchText)
  }

  updateMatchInfo(info: MatchInfo): void {
    if (info.total === 0) {
      this.matchText.content = this.query.length > 0 ? "  [0/0]" : ""
    } else {
      this.matchText.content = `  [${info.current}/${info.total}]`
    }
  }

  setTheme(theme: Theme): void {
    const t = theme.colors
    this.backgroundColor = t.sidebarBg
    this.promptText.fg = t.accent
    this.inputText.fg = t.text
    this.matchText.fg = t.textMuted
  }

  handleKey(key: ParsedKey): boolean {
    if (key.name === "escape") {
      this.onClose()
      return true
    }

    if (key.name === "return") {
      if (key.shift) {
        this.onPrev()
      } else {
        this.onNext()
      }
      return true
    }

    if (key.name === "backspace") {
      if (this.query.length > 0) {
        this.query = this.query.slice(0, -1)
        this.updateDisplay()
        this.onSearch(this.query)
      }
      return true
    }

    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const char = key.sequence
      if (char >= " " && char <= "~") {
        this.query += char
        this.updateDisplay()
        this.onSearch(this.query)
        return true
      }
    }

    return true
  }

  private updateDisplay(): void {
    this.inputText.content = this.query + "_"
  }

  getQuery(): string {
    return this.query
  }

  destroy(): void {
    super.destroy()
  }
}
