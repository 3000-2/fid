#!/usr/bin/env bun

import { existsSync, statSync } from "fs"
import { resolve } from "path"
import { createCliRenderer, type ParsedKey } from "@opentui/core"
import { MainLayout } from "./layouts/MainLayout"
import { SetupWizard } from "./components/SetupWizard"
import { createGitService } from "./services/git"
import { configExists, loadConfig, saveConfig, type Config } from "./services/config"
import { themes } from "./themes"

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
    sidebarWidth: 32,
    minWidthForSidebar: 80,
  })

  renderer.root.add(layout)

  const shutdown = () => {
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

  renderer.keyInput.on("keypress", (key: ParsedKey) => {
    if (key.name === "c" && key.ctrl) {
      shutdown()
      return
    }

    if (layout.isSettingsModalOpen()) {
      layout.handleKey(key)
      return
    }

    if (key.name === "/" && !key.ctrl && !key.meta) {
      layout.toggleSettingsModal()
      return
    }

    if (layout.handleKey(key)) return

    if (key.name === "b" && !key.ctrl && !key.meta) {
      layout.toggleSidebar()
    } else if (key.name === "r" && !key.ctrl && !key.meta) {
      layout.refreshFiles()
    }
  })

  renderer.start()
}

main().catch((e) => {
  console.error("Error:", e)
  process.exit(1)
})
