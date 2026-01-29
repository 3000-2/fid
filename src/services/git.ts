import { $ } from "bun"
import { safeResolvePath } from "../utils/path"
import { logger } from "../utils/logger"

export const MAX_FILE_SIZE = 10 * 1024 * 1024

const VALID_STATUSES = new Set(["M", "A", "D", "R", "C", "U", "?"] as const)

type GitStatus = "M" | "A" | "D" | "R" | "C" | "U" | "?"

function parseGitStatus(statusChar: string): GitStatus | null {
  const char = statusChar.charAt(0)
  return VALID_STATUSES.has(char as GitStatus) ? (char as GitStatus) : null
}

export interface GitFile {
  path: string
  status: GitStatus
  staged: boolean
  group?: string
  isSubmodule?: boolean
  submodulePath?: string
}

export interface Submodule {
  name: string
  path: string
}

export interface GitService {
  getChangedFiles(): Promise<GitFile[]>
  getDiff(filePath: string, staged?: boolean, isUntracked?: boolean, submodulePath?: string): Promise<string>
  getCurrentBranch(): Promise<string>
  getWorkingDirectory(): string
  isGitRepo(): Promise<boolean>
  getSubmodules(): Promise<Submodule[]>
  stageFile(file: GitFile): Promise<boolean>
  unstageFile(file: GitFile): Promise<boolean>
  getTrackedFiles(): Promise<string[]>
}

function getFileGroup(filePath: string): string {
  const parts = filePath.split("/")
  if (parts.length <= 1) return ""
  if (parts.length === 2) return parts[0]
  return `${parts[0]}/${parts[1]}`
}

function isExpectedGitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("not a git repository") ||
    message.includes("not initialized") ||
    message.includes("no such file or directory") ||
    message.includes("does not exist")
  )
}

interface ResolvedFilePaths {
  targetCwd: string
  relativePath: string
}

function resolveFilePaths(cwd: string, file: GitFile): ResolvedFilePaths | null {
  const targetCwd = file.submodulePath
    ? safeResolvePath(cwd, file.submodulePath)
    : cwd

  if (!targetCwd) {
    logger.error(`Invalid submodule path: ${file.submodulePath}`)
    return null
  }

  const relativePath = file.submodulePath
    ? file.path.replace(`${file.submodulePath}/`, "")
    : file.path

  if (!safeResolvePath(targetCwd, relativePath)) {
    logger.error(`Path validation failed for: ${file.path}`)
    return null
  }

  return { targetCwd, relativePath }
}

export function createGitService(cwd: string): GitService {
  async function getSubmoduleChangedFiles(submodule: Submodule): Promise<GitFile[]> {
    const files: GitFile[] = []

    const submoduleCwd = safeResolvePath(cwd, submodule.path)
    if (!submoduleCwd) {
      logger.error(`Invalid submodule path: ${submodule.path}`)
      return files
    }

    const seenPaths = new Set<string>()

    try {
      const stagedResult = await $`git -C ${submoduleCwd} diff --cached --name-status`.text()
      for (const line of stagedResult.trim().split("\n")) {
        if (!line) continue
        const [statusRaw, ...pathParts] = line.split("\t")
        const filePath = pathParts.join("\t")
        const status = parseGitStatus(statusRaw)

        if (status && filePath && !seenPaths.has(filePath)) {
          seenPaths.add(filePath)
          files.push({
            path: `${submodule.path}/${filePath}`,
            status,
            staged: true,
            group: submodule.name,
            isSubmodule: true,
            submodulePath: submodule.path,
          })
        }
      }

      const unstagedResult = await $`git -C ${submoduleCwd} diff --name-status`.text()
      for (const line of unstagedResult.trim().split("\n")) {
        if (!line) continue
        const [statusRaw, ...pathParts] = line.split("\t")
        const filePath = pathParts.join("\t")
        const status = parseGitStatus(statusRaw)

        if (status && filePath && !seenPaths.has(filePath)) {
          seenPaths.add(filePath)
          files.push({
            path: `${submodule.path}/${filePath}`,
            status,
            staged: false,
            group: submodule.name,
            isSubmodule: true,
            submodulePath: submodule.path,
          })
        }
      }

      const untrackedResult = await $`git -C ${submoduleCwd} ls-files --others --exclude-standard`.text()
      for (const line of untrackedResult.trim().split("\n")) {
        if (!line) continue
        if (!seenPaths.has(line)) {
          seenPaths.add(line)
          files.push({
            path: `${submodule.path}/${line}`,
            status: "?",
            staged: false,
            group: submodule.name,
            isSubmodule: true,
            submodulePath: submodule.path,
          })
        }
      }
    } catch (error) {
      if (!isExpectedGitError(error)) {
        logger.error(`Error getting changed files for submodule ${submodule.name}:`, error)
      }
    }

    return files
  }

  return {
    getWorkingDirectory() {
      return cwd
    },

    async isGitRepo(): Promise<boolean> {
      try {
        await $`git -C ${cwd} rev-parse --git-dir`.quiet()
        return true
      } catch {
        return false
      }
    },

    async getCurrentBranch(): Promise<string> {
      try {
        const result = await $`git -C ${cwd} branch --show-current`.text()
        const branch = result.trim()
        if (branch) return branch

        const head = await $`git -C ${cwd} rev-parse --short HEAD`.text()
        return head.trim() || "HEAD"
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error("Error getting current branch:", error)
        }
        return ""
      }
    },

    async getSubmodules(): Promise<Submodule[]> {
      const submodules: Submodule[] = []
      try {
        const result = await $`git -C ${cwd} submodule status`.text()
        for (const line of result.trim().split("\n")) {
          if (!line) continue
          const match = line.match(/^[\s+-]?[a-f0-9]+\s+(\S+)/)
          if (match) {
            const path = match[1]

            if (!safeResolvePath(cwd, path)) {
              logger.error(`Skipping invalid submodule path: ${path}`)
              continue
            }

            const name = path.split("/").pop() || path
            submodules.push({ name, path })
          }
        }
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error("Error getting submodules:", error)
        }
      }
      return submodules
    },

    async getChangedFiles(): Promise<GitFile[]> {
      const files: GitFile[] = []
      const seenPaths = new Set<string>()

      try {
        const stagedResult = await $`git -C ${cwd} diff --cached --name-status`.text()
        for (const line of stagedResult.trim().split("\n")) {
          if (!line) continue
          const [statusRaw, ...pathParts] = line.split("\t")
          const path = pathParts.join("\t")
          const status = parseGitStatus(statusRaw)

          if (status && path && !seenPaths.has(path)) {
            seenPaths.add(path)
            files.push({
              path,
              status,
              staged: true,
              group: getFileGroup(path),
            })
          }
        }

        const unstagedResult = await $`git -C ${cwd} diff --name-status`.text()
        for (const line of unstagedResult.trim().split("\n")) {
          if (!line) continue
          const [statusRaw, ...pathParts] = line.split("\t")
          const path = pathParts.join("\t")
          const status = parseGitStatus(statusRaw)

          if (status && path && !seenPaths.has(path)) {
            seenPaths.add(path)
            files.push({
              path,
              status,
              staged: false,
              group: getFileGroup(path),
            })
          }
        }

        const untrackedResult = await $`git -C ${cwd} ls-files --others --exclude-standard`.text()
        for (const line of untrackedResult.trim().split("\n")) {
          if (!line) continue
          if (!seenPaths.has(line)) {
            seenPaths.add(line)
            files.push({
              path: line,
              status: "?",
              staged: false,
              group: getFileGroup(line),
            })
          }
        }

        const submodules = await this.getSubmodules()
        const submoduleFileArrays = await Promise.all(
          submodules.map(submodule => getSubmoduleChangedFiles(submodule))
        )

        for (const submoduleFiles of submoduleFileArrays) {
          for (const file of submoduleFiles) {
            if (!seenPaths.has(file.path)) {
              seenPaths.add(file.path)
              files.push(file)
            }
          }
        }
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error("Error getting changed files:", error)
        }
      }

      return files.sort((a, b) => a.path.localeCompare(b.path))
    },

    async getDiff(filePath: string, staged = false, isUntracked = false, submodulePath?: string): Promise<string> {
      const targetCwd = submodulePath ? safeResolvePath(cwd, submodulePath) : cwd
      if (!targetCwd) {
        logger.error(`Invalid submodule path: ${submodulePath}`)
        return ""
      }

      const relativePath = submodulePath ? filePath.replace(`${submodulePath}/`, "") : filePath

      try {
        if (isUntracked) {
          const fullPath = safeResolvePath(targetCwd, relativePath)
          if (!fullPath) {
            logger.error(`Path validation failed for: ${filePath}`)
            return ""
          }

          const file = Bun.file(fullPath)
          if (!await file.exists()) return ""

          if (file.size > MAX_FILE_SIZE) {
            return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,1 @@\n+// File too large to display (${Math.round(file.size / 1024 / 1024)}MB)`
          }

          const content = await file.text()
          const lines = content.split("\n")
          if (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop()
          }
          const lineCount = lines.length

          const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lineCount} @@`
          const body = lines.map(line => `+${line}`).join("\n")
          return `${header}\n${body}`
        }

        if (staged) {
          return await $`git -C ${targetCwd} diff --cached -- ${relativePath}`.text()
        }
        return await $`git -C ${targetCwd} diff -- ${relativePath}`.text()
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error(`Error getting diff for ${filePath}:`, error)
        }
        return ""
      }
    },

    async stageFile(file: GitFile): Promise<boolean> {
      const paths = resolveFilePaths(cwd, file)
      if (!paths) return false

      try {
        await $`git -C ${paths.targetCwd} add -- ${paths.relativePath}`.quiet()
        return true
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error(`Error staging file ${file.path}:`, error)
        }
        return false
      }
    },

    async unstageFile(file: GitFile): Promise<boolean> {
      const paths = resolveFilePaths(cwd, file)
      if (!paths) return false

      try {
        await $`git -C ${paths.targetCwd} restore --staged -- ${paths.relativePath}`.quiet()
        return true
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error(`Error unstaging file ${file.path}:`, error)
        }
        return false
      }
    },

    async getTrackedFiles(): Promise<string[]> {
      const files: string[] = []

      try {
        const result = await $`git -C ${cwd} ls-files`.text()
        const mainFiles = result.trim().split("\n").filter(line => line.length > 0)
        files.push(...mainFiles)

        const submodules = await this.getSubmodules()
        for (const submodule of submodules) {
          const submoduleCwd = safeResolvePath(cwd, submodule.path)
          if (!submoduleCwd) continue

          try {
            const subResult = await $`git -C ${submoduleCwd} ls-files`.text()
            const subFiles = subResult.trim().split("\n")
              .filter(line => line.length > 0)
              .map(file => `${submodule.path}/${file}`)
            files.push(...subFiles)
          } catch (error) {
            if (!isExpectedGitError(error)) {
              logger.error(`Error getting files for submodule ${submodule.name}:`, error)
            }
          }
        }
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error("Error getting tracked files:", error)
        }
      }

      return files
    },
  }
}
