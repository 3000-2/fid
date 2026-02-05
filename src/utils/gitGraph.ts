export interface GitCommit {
  hash: string
  refs: string[]
  message: string
  author: string
  relativeDate: string
  graphChars: string
}

interface ParsedLogLine {
  graphPart: string
  dataPart: string
}

const GRAPH_CHARS = new Set(["*", "|", "/", "\\", "_", " ", "-"])

function splitGraphAndData(line: string): ParsedLogLine {
  let graphEndIndex = 0
  let foundCommitMarker = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === "*") {
      foundCommitMarker = true
      graphEndIndex = i + 1
      while (graphEndIndex < line.length && line[graphEndIndex] === " ") {
        graphEndIndex++
      }
      break
    }

    if (!GRAPH_CHARS.has(char)) {
      break
    }

    graphEndIndex = i + 1
  }

  if (!foundCommitMarker) {
    return {
      graphPart: line,
      dataPart: "",
    }
  }

  return {
    graphPart: line.slice(0, graphEndIndex).trimEnd(),
    dataPart: line.slice(graphEndIndex),
  }
}

function parseRefs(refsStr: string): string[] {
  if (!refsStr || refsStr.trim() === "") {
    return []
  }

  return refsStr
    .split(",")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0)
    .map((ref) => {
      if (ref.startsWith("HEAD -> ")) {
        return "HEAD:" + ref.slice(8)
      }
      if (ref.startsWith("tag: ")) {
        return "tag:" + ref.slice(5)
      }
      return ref
    })
}

export function parseGitLogOutput(output: string): GitCommit[] {
  const commits: GitCommit[] = []
  const lines = output.split("\n")

  for (const line of lines) {
    if (!line) continue

    const { graphPart, dataPart } = splitGraphAndData(line)

    if (!dataPart) {
      continue
    }

    const parts = dataPart.split("|")
    if (parts.length < 4) {
      continue
    }

    const hash = parts[0].trim()
    const refsStr = parts[1].trim()
    const message = parts[2].trim()
    const author = parts[3].trim()
    const relativeDate = parts.slice(4).join("|").trim()

    if (!hash || hash.length < 4) {
      continue
    }

    commits.push({
      hash,
      refs: parseRefs(refsStr),
      message,
      author,
      relativeDate,
      graphChars: graphPart,
    })
  }

  return commits
}

export interface GraphColorInfo {
  char: string
  colorIndex: number
}

const BRANCH_COLORS = [
  "accent",
  "success",
  "warning",
  "error",
  "info",
  "purple",
] as const

export type BranchColorName = (typeof BRANCH_COLORS)[number]

export function colorizeGraphChars(graphChars: string): GraphColorInfo[] {
  const result: GraphColorInfo[] = []
  const columnStack: number[] = []
  let nextColorIndex = 0

  for (let pos = 0; pos < graphChars.length; pos++) {
    const char = graphChars[pos]
    const column = Math.floor(pos / 2)

    if (char === " ") {
      result.push({ char, colorIndex: 0 })
      continue
    }

    if (char === "*") {
      let colorIndex: number
      if (columnStack[column] !== undefined) {
        colorIndex = columnStack[column]
      } else {
        colorIndex = nextColorIndex
        columnStack[column] = colorIndex
        nextColorIndex = (nextColorIndex + 1) % BRANCH_COLORS.length
      }
      result.push({ char, colorIndex })
      continue
    }

    if (char === "|") {
      let colorIndex: number
      if (columnStack[column] !== undefined) {
        colorIndex = columnStack[column]
      } else {
        colorIndex = column % BRANCH_COLORS.length
        columnStack[column] = colorIndex
      }
      result.push({ char, colorIndex })
      continue
    }

    if (char === "/" || char === "\\" || char === "_" || char === "-") {
      const colorIndex = column % BRANCH_COLORS.length
      result.push({ char, colorIndex })
      continue
    }

    result.push({ char, colorIndex: 0 })
  }

  return result
}

export function getBranchColor(colorIndex: number): BranchColorName {
  return BRANCH_COLORS[colorIndex % BRANCH_COLORS.length]
}

export function formatRefTag(ref: string): {
  text: string
  isHead: boolean
  isTag: boolean
  isRemote: boolean
} {
  const isHead = ref.startsWith("HEAD:")
  const isTag = ref.startsWith("tag:")
  const isRemote = ref.startsWith("origin/") || ref.startsWith("remote/")

  let text = ref
  if (isHead) {
    text = ref.slice(5)
  } else if (isTag) {
    text = ref.slice(4)
  } else if (ref.startsWith("origin/")) {
    text = ref
  }

  return { text, isHead, isTag, isRemote }
}

export function truncateMessage(message: string, maxLength: number): string {
  if (maxLength <= 0) return ""
  if (message.length <= maxLength) {
    return message
  }
  return message.slice(0, maxLength - 1) + "…"
}
