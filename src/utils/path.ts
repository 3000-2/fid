import { realpathSync } from "fs"
import { resolve } from "path"

export interface PathValidationResult {
  valid: boolean
  resolvedPath: string | null
  error?: string
}

/**
 * Validates that a target path is within the allowed base directory.
 * Prevents path traversal attacks by resolving symlinks and checking containment.
 *
 * @param basePath - The allowed base directory
 * @param targetPath - The path to validate (can be relative or absolute)
 * @returns PathValidationResult with validation status and resolved path
 */
export function validatePathWithinBase(
  basePath: string,
  targetPath: string
): PathValidationResult {
  try {
    const resolved = resolve(basePath, targetPath)
    const realBase = realpathSync(basePath)
    const realResolved = realpathSync(resolved)

    if (!realResolved.startsWith(realBase + "/") && realResolved !== realBase) {
      return {
        valid: false,
        resolvedPath: null,
        error: "Path is outside allowed directory",
      }
    }

    return {
      valid: true,
      resolvedPath: realResolved,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return {
      valid: false,
      resolvedPath: null,
      error: `Failed to resolve path: ${message}`,
    }
  }
}

/**
 * Safely resolves a path within a base directory.
 * Returns null if the path is invalid or outside the base directory.
 *
 * @param basePath - The allowed base directory
 * @param targetPath - The path to resolve
 * @returns The resolved real path, or null if invalid
 */
export function safeResolvePath(
  basePath: string,
  targetPath: string
): string | null {
  const result = validatePathWithinBase(basePath, targetPath)
  return result.valid ? result.resolvedPath : null
}

/**
 * Checks if a path is safe (within the base directory).
 *
 * @param basePath - The allowed base directory
 * @param targetPath - The path to check
 * @returns true if the path is within the base directory
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  return validatePathWithinBase(basePath, targetPath).valid
}
