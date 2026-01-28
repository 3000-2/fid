import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"
import { themeNames, type ThemeName } from "../themes"

export interface Config {
  theme: ThemeName
  sidebarPosition: "left" | "right"
}

const DEFAULT_CONFIG: Config = {
  theme: "one-dark",
  sidebarPosition: "left",
}

const VALID_SIDEBAR_POSITIONS = ["left", "right"] as const

function isValidTheme(value: unknown): value is ThemeName {
  return typeof value === "string" && themeNames.includes(value as ThemeName)
}

function isValidSidebarPosition(value: unknown): value is "left" | "right" {
  return typeof value === "string" && VALID_SIDEBAR_POSITIONS.includes(value as "left" | "right")
}

function getConfigPath(): string {
  return join(homedir(), ".config", "fid", "config.json")
}

export function configExists(): boolean {
  return existsSync(getConfigPath())
}

export function loadConfig(): Config {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(content)

    return {
      theme: isValidTheme(parsed.theme) ? parsed.theme : DEFAULT_CONFIG.theme,
      sidebarPosition: isValidSidebarPosition(parsed.sidebarPosition)
        ? parsed.sidebarPosition
        : DEFAULT_CONFIG.sidebarPosition,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath()
  const configDir = dirname(configPath)

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
}
