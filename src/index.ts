#!/usr/bin/env bun

import { existsSync, statSync } from "fs"
import { resolve } from "path"
import { createCliRenderer, type ParsedKey } from "@opentui/core"
import { MainLayout } from "./layouts/MainLayout"
import { SetupWizard } from "./components/SetupWizard"
import { createGitService } from "./services/git"
import { configExists, loadConfig, saveConfig, type Config } from "./services/config"
import { themes } from "./themes"
import { logger } from "./utils/logger"

async function runSetupWizard(renderer: ReturnType<typeof createCliRenderer> extends Promise<infer T> ? T : never): Promise<Config | null> {
  return new Promise((resolveConfig) => {
    const keyHandler = (key: ParsedKey) => {
      if (key.name === "c" && key.ctrl) {
        renderer.keyInput.off("keypress", keyHandler)
        renderer.root.remove(wizard.id)
        resolveConfig(null)
        return
      }
      wizard.handleKey(key)
    }

    const wizard = new SetupWizard(renderer, {
      onComplete: (config) => {
        renderer.keyInput.off("keypress", keyHandler)
        renderer.root.remove(wizard.id)
        resolveConfig(config)
      },
    })

    renderer.root.add(wizard)
    renderer.keyInput.on("keypress", keyHandler)
  })
}

async function main() {
  logger.init()

  const cwd = resolve(process.argv[2] || process.cwd())

  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    console.error(`Error: Invalid directory: ${cwd}`)
    process.exit(1)
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    useMouse: true,
  })

  let config: Config

  if (!configExists()) {
    renderer.setBackgroundColor(themes["one-dark"].colors.background)
    renderer.start()
    const wizardConfig = await runSetupWizard(renderer)
    if (!wizardConfig) {
      renderer.destroy()
      process.exit(0)
    }
    config = wizardConfig
    saveConfig(config)
    renderer.stop()
  } else {
    config = loadConfig()
  }

  renderer.setBackgroundColor(themes[config.theme].colors.background)

  const layout = new MainLayout(renderer, {
    gitService: createGitService(cwd),
    config,
    minWidthForSidebar: 80,
  })

  renderer.root.add(layout)

  process.stdout.write("\x1b[?1004h")

  const shutdown = () => {
    process.stdout.write("\x1b[?1004l")
    try {
      layout.destroy()
    } catch {
      // Ignore cleanup errors during shutdown
    }
    try {
      renderer.destroy()
    } catch {
      // Ignore cleanup errors during shutdown
    }
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  renderer.setFrameCallback(async () => layout.checkResize())

  let focusDebounce: ReturnType<typeof setTimeout> | null = null
  renderer.on("focus", () => {
    if (focusDebounce) clearTimeout(focusDebounce)
    focusDebounce = setTimeout(() => {
      layout.refreshFiles()
    }, 100)
  })

  renderer.keyInput.on("keypress", (key: ParsedKey) => {
    if (key.name === "c" && key.ctrl) {
      shutdown()
      return
    }

    if (layout.isSettingsModalOpen() || layout.isCommandPaletteOpen() || layout.isHelpModalOpen() || layout.isSearchActive()) {
      layout.handleKey(key)
      return
    }

    if (key.name === "?" || (key.name === "/" && key.shift)) {
      layout.toggleHelpModal()
      return
    }

    if (key.name === "/" && !key.ctrl && !key.meta) {
      layout.toggleCommandPalette()
      return
    }

    if (key.name === "f" && key.ctrl && !key.meta) {
      layout.openSearch()
      return
    }

    if (key.name === "tab" && !key.ctrl && !key.meta) {
      layout.toggleFocus()
      return
    }

    if (layout.handleKey(key)) return

    if (key.name === "b" && !key.ctrl && !key.meta) {
      layout.toggleSidebar()
    } else if (key.name === "r" && !key.ctrl && !key.meta) {
      layout.refreshFiles()
    } else if (key.sequence === "[" && !key.ctrl && !key.meta && layout.isSidebarFocused()) {
      layout.resizeSidebar(-2)
    } else if (key.sequence === "]" && !key.ctrl && !key.meta && layout.isSidebarFocused()) {
      layout.resizeSidebar(2)
    }
  })

  renderer.start()
}

main().catch((e) => {
  logger.error("Fatal error", e)
  console.error("Error:", e)
  process.exit(1)
})
