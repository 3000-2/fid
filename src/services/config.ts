import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"
import { themeNames, type ThemeName } from "../themes"

export interface Config {
  theme: ThemeName
  sidebarPosition: "left" | "right"
  sidebarWidth: number
  browseAllFiles: boolean
  commandUsage?: Record<string, number>
}

const DEFAULT_CONFIG: Config = {
  theme: "one-dark",
  sidebarPosition: "left",
  sidebarWidth: 32,
  browseAllFiles: false,
}

export const MIN_SIDEBAR_WIDTH = 20
export const MAX_SIDEBAR_WIDTH = 60

const VALID_SIDEBAR_POSITIONS = ["left", "right"] as const

function isValidTheme(value: unknown): value is ThemeName {
  return typeof value === "string" && themeNames.includes(value as ThemeName)
}

function isValidSidebarPosition(value: unknown): value is "left" | "right" {
  return typeof value === "string" && VALID_SIDEBAR_POSITIONS.includes(value as "left" | "right")
}

function isValidSidebarWidth(value: unknown): value is number {
  return typeof value === "number" && value >= MIN_SIDEBAR_WIDTH && value <= MAX_SIDEBAR_WIDTH
}

const KNOWN_COMMAND_IDS = new Set([
  "help", "settings", "refresh", "log", "commit", "stageAll", "unstageAll"
])
const MAX_USAGE_COUNT = 10000

function isValidCommandUsage(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  for (const [key, count] of Object.entries(value)) {
    if (typeof key !== "string" || key.length === 0) {
      return false
    }
    if (typeof count !== "number" || count < 0 || !Number.isInteger(count)) {
      return false
    }
  }
  return true
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

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULT_CONFIG }
    }

    return {
      theme: isValidTheme(parsed.theme) ? parsed.theme : DEFAULT_CONFIG.theme,
      sidebarPosition: isValidSidebarPosition(parsed.sidebarPosition)
        ? parsed.sidebarPosition
        : DEFAULT_CONFIG.sidebarPosition,
      sidebarWidth: isValidSidebarWidth(parsed.sidebarWidth)
        ? parsed.sidebarWidth
        : DEFAULT_CONFIG.sidebarWidth,
      browseAllFiles: typeof parsed.browseAllFiles === "boolean"
        ? parsed.browseAllFiles
        : DEFAULT_CONFIG.browseAllFiles,
      commandUsage: isValidCommandUsage(parsed.commandUsage)
        ? parsed.commandUsage
        : undefined,
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

export function trackCommandUsage(config: Config, commandId: string): Config {
  if (!KNOWN_COMMAND_IDS.has(commandId)) {
    return config
  }
  const usage = { ...config.commandUsage }
  const currentCount = usage[commandId] || 0
  usage[commandId] = Math.min(currentCount + 1, MAX_USAGE_COUNT)
  return { ...config, commandUsage: usage }
}
