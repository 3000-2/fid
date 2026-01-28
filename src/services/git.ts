import { $ } from "bun"

export interface GitFile {
  path: string
  status: "M" | "A" | "D" | "R" | "C" | "U" | "?"
  staged: boolean
}

export interface GitService {
  getChangedFiles(): Promise<GitFile[]>
  getDiff(filePath: string, staged?: boolean): Promise<string>
  getCurrentBranch(): Promise<string>
  getWorkingDirectory(): string
  isGitRepo(): Promise<boolean>
}

export function createGitService(cwd: string): GitService {
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
      } catch {
        return ""
      }
    },

    async getChangedFiles(): Promise<GitFile[]> {
      const files: GitFile[] = []
      const seenPaths = new Set<string>()

      try {
        // Staged files
        const stagedResult = await $`git -C ${cwd} diff --cached --name-status`.text()
        for (const line of stagedResult.trim().split("\n")) {
          if (!line) continue
          const [status, ...pathParts] = line.split("\t")
          const path = pathParts.join("\t")
          if (path && !seenPaths.has(path)) {
            seenPaths.add(path)
            files.push({
              path,
              status: status.charAt(0) as GitFile["status"],
              staged: true,
            })
          }
        }

        // Unstaged modified files
        const unstagedResult = await $`git -C ${cwd} diff --name-status`.text()
        for (const line of unstagedResult.trim().split("\n")) {
          if (!line) continue
          const [status, ...pathParts] = line.split("\t")
          const path = pathParts.join("\t")
          if (path && !seenPaths.has(path)) {
            seenPaths.add(path)
            files.push({
              path,
              status: status.charAt(0) as GitFile["status"],
              staged: false,
            })
          }
        }

        // Untracked files
        const untrackedResult = await $`git -C ${cwd} ls-files --others --exclude-standard`.text()
        for (const line of untrackedResult.trim().split("\n")) {
          if (!line) continue
          if (!seenPaths.has(line)) {
            seenPaths.add(line)
            files.push({
              path: line,
              status: "?",
              staged: false,
            })
          }
        }
      } catch {
        // Return empty array on error - UI will show "0 changes"
      }

      return files.sort((a, b) => a.path.localeCompare(b.path))
    },

    async getDiff(filePath: string, staged = false): Promise<string> {
      try {
        if (staged) {
          return await $`git -C ${cwd} diff --cached -- ${filePath}`.text()
        }
        return await $`git -C ${cwd} diff -- ${filePath}`.text()
      } catch {
        return ""
      }
    },
  }
}
