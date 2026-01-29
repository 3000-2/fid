import { appendFileSync, mkdirSync, existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const LOG_DIR = join(homedir(), ".fid", "logs")
const MAX_LOG_FILES = 5

function getLogFilePath(): string {
  const date = new Date().toISOString().split("T")[0]
  return join(LOG_DIR, `fid-${date}.log`)
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function cleanOldLogs(): void {
  try {
    if (!existsSync(LOG_DIR)) return

    const logFiles = Array.from(
      new Bun.Glob("fid-*.log").scanSync({ cwd: LOG_DIR })
    ).sort().reverse()

    for (const file of logFiles.slice(MAX_LOG_FILES)) {
      try {
        const filePath = join(LOG_DIR, file)
        if (existsSync(filePath)) {
          Bun.file(filePath).unlink?.()
        }
      } catch {
        // Ignore individual file deletion errors
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`
  }
  return String(error)
}

function writeLog(level: string, message: string, error?: unknown): void {
  try {
    ensureLogDir()

    const timestamp = formatTimestamp()
    const errorPart = error ? `\n${formatError(error)}` : ""
    const logLine = `[${timestamp}] [${level}] ${message}${errorPart}\n`

    appendFileSync(getLogFilePath(), logLine)
  } catch {
    // Silently fail if logging fails
  }
}

export const logger = {
  error(message: string, error?: unknown): void {
    writeLog("ERROR", message, error)
  },

  warn(message: string): void {
    writeLog("WARN", message)
  },

  info(message: string): void {
    writeLog("INFO", message)
  },

  debug(message: string): void {
    writeLog("DEBUG", message)
  },

  init(): void {
    ensureLogDir()
    cleanOldLogs()
    writeLog("INFO", "FID started")
  },
}
