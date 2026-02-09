import { $ } from "bun"
import { safeResolvePath } from "../utils/path"
import { logger } from "../utils/logger"
import { parseGitLogOutput, parseGitLogFlatOutput } from "../utils/gitGraph"

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const MAX_COMMIT_MESSAGE_LENGTH = 10000
const BINARY_CHECK_SIZE = 8192
const MIN_LOG_LIMIT = 1
const MAX_LOG_LIMIT = 1000
const MIN_HASH_LENGTH = 4
const MAX_HASH_LENGTH = 40

const VALID_STATUSES = new Set(["M", "A", "D", "R", "C", "U", "?"] as const)

function isBinaryContent(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  const checkLength = Math.min(bytes.length, BINARY_CHECK_SIZE)
  for (let i = 0; i < checkLength; i++) {
    if (bytes[i] === 0) return true
  }
  return false
}

export type GitStatus = "M" | "A" | "D" | "R" | "C" | "U" | "?"

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

export interface GitCommitInfo {
  hash: string
  refs: string[]
  message: string
  author: string
  relativeDate: string
  graphChars: string
}

export interface CommitFile {
  path: string
  status: GitStatus
}

export interface GitService {
  getChangedFiles(): Promise<GitFile[]>
  getDiff(filePath: string, staged?: boolean, status?: GitStatus, submodulePath?: string, fullContext?: boolean): Promise<string>
  getCurrentBranch(): Promise<string>
  getWorkingDirectory(): string
  isGitRepo(): Promise<boolean>
  getSubmodules(): Promise<Submodule[]>
  stageFile(file: GitFile): Promise<boolean>
  unstageFile(file: GitFile): Promise<boolean>
  getTrackedFiles(): Promise<string[]>
  commit(message: string): Promise<{ success: boolean; error?: string }>
  getStagedCount(): Promise<number>
  stageAll(): Promise<boolean>
  unstageAll(): Promise<boolean>
  stageHunk(filePath: string, hunkPatch: string): Promise<boolean>
  unstageHunk(filePath: string, hunkPatch: string): Promise<boolean>
  discardHunk(filePath: string, hunkPatch: string): Promise<boolean>
  getLog(limit?: number, skip?: number): Promise<GitCommitInfo[]>
  getCommitInfo(hash: string): Promise<GitCommitInfo | null>
  getCommitDiff(hash: string): Promise<string>
  getCommitFiles(hash: string): Promise<CommitFile[]>
  getCommitFileDiff(hash: string, filePath: string): Promise<string>
}

export function getFileGroup(filePath: string): string {
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

    async getDiff(filePath: string, staged = false, status?: GitStatus, submodulePath?: string, fullContext = false): Promise<string> {
      const targetCwd = submodulePath ? safeResolvePath(cwd, submodulePath) : cwd
      if (!targetCwd) {
        logger.error(`Invalid submodule path: ${submodulePath}`)
        return ""
      }

      const relativePath = submodulePath ? filePath.replace(`${submodulePath}/`, "") : filePath

      try {
        if (status === "?") {
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

          const buffer = await file.arrayBuffer()
          if (isBinaryContent(buffer)) {
            return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\nBinary files /dev/null and b/${filePath} differ`
          }

          const content = new TextDecoder().decode(buffer)
          const lines = content.split("\n")
          if (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop()
          }
          const lineCount = lines.length

          const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lineCount} @@`
          const body = lines.map(line => `+${line}`).join("\n")
          return `${header}\n${body}`
        }

        if (status === "D") {
          const diffResult = staged
            ? await $`git -C ${targetCwd} diff --cached -- ${relativePath}`.text()
            : await $`git -C ${targetCwd} diff -- ${relativePath}`.text()

          if (diffResult.trim()) {
            return diffResult
          }

          try {
            const buffer = await $`git -C ${targetCwd} show HEAD:${relativePath}`.arrayBuffer()
            if (isBinaryContent(buffer)) {
              return `diff --git a/${filePath} b/${filePath}\ndeleted file mode 100644\nBinary files a/${filePath} and /dev/null differ`
            }

            const originalContent = new TextDecoder().decode(buffer)
            const lines = originalContent.split("\n")
            if (lines.length > 0 && lines[lines.length - 1] === "") {
              lines.pop()
            }
            const lineCount = lines.length

            const header = `diff --git a/${filePath} b/${filePath}\ndeleted file mode 100644\n--- a/${filePath}\n+++ /dev/null\n@@ -1,${lineCount} +0,0 @@`
            const body = lines.map(line => `-${line}`).join("\n")
            return `${header}\n${body}`
          } catch {
            return ""
          }
        }

        if (staged) {
          if (fullContext) {
            return await $`git -C ${targetCwd} diff --cached -U99999 -- ${relativePath}`.text()
          }
          return await $`git -C ${targetCwd} diff --cached -- ${relativePath}`.text()
        }
        if (fullContext) {
          return await $`git -C ${targetCwd} diff -U99999 -- ${relativePath}`.text()
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

    async getStagedCount(): Promise<number> {
      try {
        const result = await $`git -C ${cwd} diff --cached --name-only`.text()
        const lines = result.trim().split("\n").filter(line => line.length > 0)
        return lines.length
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error("Error getting staged count:", error)
        }
        return 0
      }
    },

    async stageAll(): Promise<boolean> {
      try {
        await $`git -C ${cwd} add -A`.quiet()

        const submodules = await this.getSubmodules()
        for (const submodule of submodules) {
          const submoduleCwd = safeResolvePath(cwd, submodule.path)
          if (submoduleCwd) {
            try {
              await $`git -C ${submoduleCwd} add -A`.quiet()
            } catch (subError) {
              if (!isExpectedGitError(subError)) {
                logger.error(`Error staging files in submodule ${submodule.name}:`, subError)
              }
            }
          }
        }

        return true
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error("Error staging all files:", error)
        }
        return false
      }
    },

    async unstageAll(): Promise<boolean> {
      try {
        await $`git -C ${cwd} reset HEAD`.quiet()
      } catch (error) {
        if (error instanceof Error && error.message.includes("does not have any commits")) {
          try {
            await $`git -C ${cwd} rm --cached -r .`.quiet()
          } catch {}
        } else if (!isExpectedGitError(error)) {
          logger.error("Error unstaging all files:", error)
          return false
        }
      }

      const submodules = await this.getSubmodules()
      for (const submodule of submodules) {
        const submoduleCwd = safeResolvePath(cwd, submodule.path)
        if (submoduleCwd) {
          try {
            await $`git -C ${submoduleCwd} reset HEAD`.quiet()
          } catch (subError) {
            if (subError instanceof Error && subError.message.includes("does not have any commits")) {
              try {
                await $`git -C ${submoduleCwd} rm --cached -r .`.quiet()
              } catch {}
            } else if (!isExpectedGitError(subError)) {
              logger.error(`Error unstaging files in submodule ${submodule.name}:`, subError)
            }
          }
        }
      }

      return true
    },

    async stageHunk(filePath: string, hunkPatch: string): Promise<boolean> {
      try {
        const proc = Bun.spawn(["git", "-C", cwd, "apply", "--cached", "-"], {
          stdin: "pipe",
        })
        proc.stdin.write(hunkPatch)
        proc.stdin.end()
        await proc.exited
        return proc.exitCode === 0
      } catch (error) {
        logger.error(`Error staging hunk for ${filePath}:`, error)
        return false
      }
    },

    async unstageHunk(filePath: string, hunkPatch: string): Promise<boolean> {
      try {
        const proc = Bun.spawn(["git", "-C", cwd, "apply", "--cached", "-R", "-"], {
          stdin: "pipe",
        })
        proc.stdin.write(hunkPatch)
        proc.stdin.end()
        await proc.exited
        return proc.exitCode === 0
      } catch (error) {
        logger.error(`Error unstaging hunk for ${filePath}:`, error)
        return false
      }
    },

    async discardHunk(filePath: string, hunkPatch: string): Promise<boolean> {
      try {
        const proc = Bun.spawn(["git", "-C", cwd, "apply", "-R", "-"], {
          stdin: "pipe",
        })
        proc.stdin.write(hunkPatch)
        proc.stdin.end()
        await proc.exited
        return proc.exitCode === 0
      } catch (error) {
        logger.error(`Error discarding hunk for ${filePath}:`, error)
        return false
      }
    },

    async commit(message: string): Promise<{ success: boolean; error?: string }> {
      const trimmedMessage = message.trim()

      if (!trimmedMessage) {
        return { success: false, error: "Commit message is required" }
      }

      if (trimmedMessage.includes("\0")) {
        return { success: false, error: "Invalid characters in commit message" }
      }

      if (trimmedMessage.length > MAX_COMMIT_MESSAGE_LENGTH) {
        return { success: false, error: `Commit message too long (max ${MAX_COMMIT_MESSAGE_LENGTH} chars)` }
      }

      try {
        await $`git -C ${cwd} commit -m ${trimmedMessage}`.quiet()
        return { success: true }
      } catch (error) {
        if (error instanceof Error) {
          const errorMsg = error.message.toLowerCase()
          if (errorMsg.includes("nothing to commit")) {
            return { success: false, error: "Nothing to commit" }
          }
          if (errorMsg.includes("please tell me who you are")) {
            return { success: false, error: "Git user not configured" }
          }
          logger.error("Commit error:", error)
          const firstLine = error.message.split("\n")[0].slice(0, 80)
          return { success: false, error: `Commit failed: ${firstLine}` }
        }
        return { success: false, error: "Unknown error" }
      }
    },

    async getLog(limit = 100, skip = 0): Promise<GitCommitInfo[]> {
      const safeLimit = Math.max(MIN_LOG_LIMIT, Math.min(MAX_LOG_LIMIT, Math.floor(limit)))
      const safeSkip = Math.max(0, Math.floor(skip))
      try {
        if (safeSkip === 0) {
          const result = await $`git -C ${cwd} log --graph --format="%h|%D|%s|%an|%ar" --all -n ${safeLimit}`.text()
          return parseGitLogOutput(result)
        }
        const result = await $`git -C ${cwd} log --format="%h|%D|%s|%an|%ar" --all -n ${safeLimit} --skip ${safeSkip}`.text()
        return parseGitLogFlatOutput(result)
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error("Error getting git log:", error)
        }
        return []
      }
    },

    async getCommitInfo(hash: string): Promise<GitCommitInfo | null> {
      const safeHash = hash.replace(/[^a-f0-9]/gi, "")
      if (safeHash.length < MIN_HASH_LENGTH || safeHash.length > MAX_HASH_LENGTH) {
        logger.error(`Invalid commit hash: ${hash}`)
        return null
      }

      try {
        const result = await $`git -C ${cwd} log --format="%h|%D|%s|%an|%ar" -n 1 ${safeHash}`.text()
        const line = result.trim()
        if (!line) return null

        const parts = line.split("|")
        if (parts.length < 4) return null

        const commitHash = parts[0].trim()
        const refsStr = parts[1].trim()
        const message = parts[2].trim()
        const author = parts[3].trim()
        const relativeDate = parts.slice(4).join("|").trim()

        const refs = refsStr
          ? refsStr.split(",").map(r => r.trim()).filter(r => r.length > 0)
          : []

        return {
          hash: commitHash,
          refs,
          message,
          author,
          relativeDate,
          graphChars: "",
        }
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error(`Error getting commit info for ${safeHash}:`, error)
        }
        return null
      }
    },

    async getCommitDiff(hash: string): Promise<string> {
      const safeHash = hash.replace(/[^a-f0-9]/gi, "")
      if (safeHash.length < MIN_HASH_LENGTH || safeHash.length > MAX_HASH_LENGTH) {
        logger.error(`Invalid commit hash: ${hash}`)
        return ""
      }

      try {
        const result = await $`git -C ${cwd} show ${safeHash}`.text()
        return result
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error(`Error getting diff for commit ${safeHash}:`, error)
        }
        return ""
      }
    },

    async getCommitFiles(hash: string): Promise<CommitFile[]> {
      const safeHash = hash.replace(/[^a-f0-9]/gi, "")
      if (safeHash.length < MIN_HASH_LENGTH || safeHash.length > MAX_HASH_LENGTH) {
        logger.error(`Invalid commit hash: ${hash}`)
        return []
      }

      try {
        const result = await $`git -C ${cwd} diff-tree --no-commit-id --name-status -r ${safeHash}`.text()
        const files: CommitFile[] = []

        for (const line of result.trim().split("\n")) {
          if (!line) continue
          const [statusRaw, ...pathParts] = line.split("\t")
          const path = pathParts.join("\t")
          const status = parseGitStatus(statusRaw)

          if (status && path) {
            files.push({ path, status })
          }
        }

        return files.sort((a, b) => a.path.localeCompare(b.path))
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error(`Error getting files for commit ${safeHash}:`, error)
        }
        return []
      }
    },

    async getCommitFileDiff(hash: string, filePath: string): Promise<string> {
      const safeHash = hash.replace(/[^a-f0-9]/gi, "")
      if (safeHash.length < MIN_HASH_LENGTH || safeHash.length > MAX_HASH_LENGTH) {
        logger.error(`Invalid commit hash: ${hash}`)
        return ""
      }

      if (!safeResolvePath(cwd, filePath)) {
        logger.error(`Path validation failed for: ${filePath}`)
        return ""
      }

      try {
        const result = await $`git -C ${cwd} show ${safeHash} -- ${filePath}`.text()
        return result
      } catch (error) {
        if (!isExpectedGitError(error)) {
          logger.error(`Error getting diff for ${filePath} in commit ${safeHash}:`, error)
        }
        return ""
      }
    },
  }
}
