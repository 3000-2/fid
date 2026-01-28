import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  type ParsedKey,
} from "@opentui/core"
import { themes, themeNames, type Theme } from "../themes"
import { type Config } from "../services/config"

type Step = "theme" | "sidebar"

interface SetupWizardOptions {
  onComplete: (config: Config) => void
}

export class SetupWizard extends BoxRenderable {
  private renderCtx: RenderContext
  private onComplete: (config: Config) => void

  private step: Step = "theme"
  private themeIndex = 0
  private sidebarIndex = 0

  private contentBox: BoxRenderable
  private contentIds: string[] = []

  constructor(ctx: RenderContext, options: SetupWizardOptions) {
    super(ctx, {
      id: "setup-wizard",
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
    })

    this.renderCtx = ctx
    this.onComplete = options.onComplete

    this.contentBox = new BoxRenderable(ctx, {
      id: "wizard-content-box",
      flexDirection: "column",
      width: 55,
    })
    this.add(this.contentBox)

    this.renderWizard()
  }

  private get currentTheme(): Theme {
    return themes[themeNames[this.themeIndex]]
  }

  private clearContent(): void {
    for (const id of this.contentIds) {
      this.contentBox.remove(id)
    }
    this.contentIds = []
  }

  private addElement(element: BoxRenderable | TextRenderable): void {
    this.contentBox.add(element)
    this.contentIds.push(element.id)
  }

  private renderWizard(): void {
    this.clearContent()
    this.backgroundColor = this.currentTheme.colors.background

    if (this.step === "theme") {
      this.renderThemeStep()
    } else {
      this.renderSidebarStep()
    }
  }

  private renderThemeStep(): void {
    const t = this.currentTheme.colors

    const title = new TextRenderable(this.renderCtx, {
      id: "wizard-title",
      content: "Welcome to fid",
      fg: t.accent,
      marginBottom: 1,
    })
    this.addElement(title)

    const stepInfo = new TextRenderable(this.renderCtx, {
      id: "wizard-step",
      content: "Step 1/2: Choose your theme",
      fg: t.textMuted,
      marginBottom: 2,
    })
    this.addElement(stepInfo)

    themeNames.forEach((name, index) => {
      const theme = themes[name]
      const isCursor = index === this.themeIndex

      const row = new BoxRenderable(this.renderCtx, {
        id: `theme-option-${index}`,
        flexDirection: "row",
        height: 1,
      })

      const bullet = new TextRenderable(this.renderCtx, {
        id: `theme-bullet-${index}`,
        content: isCursor ? "● " : "○ ",
        fg: isCursor ? t.accent : t.textMuted,
      })

      const label = new TextRenderable(this.renderCtx, {
        id: `theme-label-${index}`,
        content: `${theme.displayName} - ${theme.description}`,
        fg: isCursor ? t.accent : t.text,
      })

      row.add(bullet)
      row.add(label)
      this.addElement(row)
    })

    const hint = new TextRenderable(this.renderCtx, {
      id: "wizard-hint",
      content: "[↑↓/jk] Move  [Enter] Next",
      fg: t.textDim,
      marginTop: 1,
    })
    this.addElement(hint)

    const divider = new TextRenderable(this.renderCtx, {
      id: "wizard-divider",
      content: "─".repeat(50),
      fg: t.border,
      marginTop: 1,
      marginBottom: 1,
    })
    this.addElement(divider)

    const previewLabel = new TextRenderable(this.renderCtx, {
      id: "preview-label",
      content: "Preview:",
      fg: t.textMuted,
      marginBottom: 1,
    })
    this.addElement(previewLabel)

    this.renderDiffPreview(t)
  }

  private renderDiffPreview(t: Theme["colors"]): void {
    const lines = [
      { num: "10", content: "  import React from 'react'", type: "normal" },
      { num: "11", content: "- const Button = ({ label }) => {", type: "removed" },
      { num: "12", content: "+ const Button = ({ label, onClick }) => {", type: "added" },
      { num: "13", content: "    return (", type: "normal" },
      { num: "14", content: "-     <button>{label}</button>", type: "removed" },
      { num: "15", content: "+     <button onClick={onClick}>{label}</button>", type: "added" },
      { num: "16", content: "    )", type: "normal" },
    ]

    lines.forEach((line, index) => {
      const row = new BoxRenderable(this.renderCtx, {
        id: `diff-line-${index}`,
        flexDirection: "row",
        height: 1,
        backgroundColor:
          line.type === "added" ? t.addedBg :
          line.type === "removed" ? t.removedBg : "transparent",
      })

      const lineNum = new TextRenderable(this.renderCtx, {
        id: `diff-num-${index}`,
        content: line.num.padStart(3) + " ",
        fg: t.textMuted,
      })

      const lineContent = new TextRenderable(this.renderCtx, {
        id: `diff-content-${index}`,
        content: line.content,
        fg: line.type === "added" ? t.success :
            line.type === "removed" ? t.error : t.text,
      })

      row.add(lineNum)
      row.add(lineContent)
      this.addElement(row)
    })
  }

  private renderSidebarStep(): void {
    const t = this.currentTheme.colors

    const title = new TextRenderable(this.renderCtx, {
      id: "wizard-title",
      content: "Welcome to fid",
      fg: t.accent,
      marginBottom: 1,
    })
    this.addElement(title)

    const stepInfo = new TextRenderable(this.renderCtx, {
      id: "wizard-step",
      content: "Step 2/2: Sidebar position",
      fg: t.textMuted,
      marginBottom: 2,
    })
    this.addElement(stepInfo)

    const positions = [
      { label: "Left", value: "left" },
      { label: "Right", value: "right" },
    ]

    positions.forEach((pos, index) => {
      const isCursor = index === this.sidebarIndex

      const row = new BoxRenderable(this.renderCtx, {
        id: `sidebar-option-${index}`,
        flexDirection: "row",
        height: 1,
      })

      const bullet = new TextRenderable(this.renderCtx, {
        id: `sidebar-bullet-${index}`,
        content: isCursor ? "● " : "○ ",
        fg: isCursor ? t.accent : t.textMuted,
      })

      const label = new TextRenderable(this.renderCtx, {
        id: `sidebar-label-${index}`,
        content: pos.label,
        fg: isCursor ? t.accent : t.text,
      })

      row.add(bullet)
      row.add(label)
      this.addElement(row)
    })

    const hint = new TextRenderable(this.renderCtx, {
      id: "wizard-hint",
      content: "[↑↓/jk] Move  [Enter] Finish",
      fg: t.textDim,
      marginTop: 1,
    })
    this.addElement(hint)

    const divider = new TextRenderable(this.renderCtx, {
      id: "wizard-divider",
      content: "─".repeat(50),
      fg: t.border,
      marginTop: 1,
      marginBottom: 1,
    })
    this.addElement(divider)

    const previewLabel = new TextRenderable(this.renderCtx, {
      id: "preview-label",
      content: "Preview:",
      fg: t.textMuted,
      marginBottom: 1,
    })
    this.addElement(previewLabel)

    this.renderLayoutPreview(t)
  }

  private renderLayoutPreview(t: Theme["colors"]): void {
    const isLeft = this.sidebarIndex === 0

    const layoutLines = isLeft ? [
      "┌──────────┬─────────────────────────────┐",
      "│ Files    │  src/Button.tsx             │",
      "│          │                             │",
      "│ M Button │  - const old = true         │",
      "│ A Card   │  + const new = false        │",
      "│ M index  │                             │",
      "└──────────┴─────────────────────────────┘",
    ] : [
      "┌─────────────────────────────┬──────────┐",
      "│  src/Button.tsx             │ Files    │",
      "│                             │          │",
      "│  - const old = true         │ M Button │",
      "│  + const new = false        │ A Card   │",
      "│                             │ M index  │",
      "└─────────────────────────────┴──────────┘",
    ]

    layoutLines.forEach((line, index) => {
      const text = new TextRenderable(this.renderCtx, {
        id: `layout-line-${index}`,
        content: line,
        fg: t.textMuted,
      })
      this.addElement(text)
    })
  }

  handleKey(key: ParsedKey): boolean {
    const isUp = key.name === "up" || key.name === "k"
    const isDown = key.name === "down" || key.name === "j"
    const isEnter = key.name === "return"

    if (this.step === "theme") {
      if (isUp && this.themeIndex > 0) {
        this.themeIndex--
        this.renderWizard()
        return true
      }
      if (isDown && this.themeIndex < themeNames.length - 1) {
        this.themeIndex++
        this.renderWizard()
        return true
      }
      if (isEnter) {
        this.step = "sidebar"
        this.renderWizard()
        return true
      }
    } else {
      if (isUp && this.sidebarIndex > 0) {
        this.sidebarIndex--
        this.renderWizard()
        return true
      }
      if (isDown && this.sidebarIndex < 1) {
        this.sidebarIndex++
        this.renderWizard()
        return true
      }
      if (isEnter) {
        this.finish()
        return true
      }
    }

    return true
  }

  private finish(): void {
    const config: Config = {
      theme: themeNames[this.themeIndex],
      sidebarPosition: this.sidebarIndex === 0 ? "left" : "right",
    }
    this.onComplete(config)
  }
}
