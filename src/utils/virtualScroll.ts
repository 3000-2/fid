export interface VirtualScrollConfig {
  windowSize: number
  bufferThreshold: number
  bufferSize: number
}

const DEFAULT_CONFIG: VirtualScrollConfig = {
  windowSize: 1000,
  bufferThreshold: 200,
  bufferSize: 500,
}

export interface VirtualScrollState {
  windowStart: number
  windowEnd: number
  totalLines: number
}

export class VirtualScrollManager {
  private lines: string[] = []
  private windowStart: number = 0
  private windowEnd: number = 0
  private config: VirtualScrollConfig

  constructor(config: Partial<VirtualScrollConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  setLines(lines: string[]): void {
    this.lines = lines
    this.windowStart = 0
    this.windowEnd = Math.min(lines.length, this.config.windowSize)
  }

  getState(): VirtualScrollState {
    return {
      windowStart: this.windowStart,
      windowEnd: this.windowEnd,
      totalLines: this.lines.length,
    }
  }

  getTotalLines(): number {
    return this.lines.length
  }

  getWindowedLines(): string[] {
    return this.lines.slice(this.windowStart, this.windowEnd)
  }

  getWindowedContent(): string {
    return this.getWindowedLines().join("\n")
  }

  getWindowStart(): number {
    return this.windowStart
  }

  getWindowEnd(): number {
    return this.windowEnd
  }

  isAtStart(): boolean {
    return this.windowStart === 0
  }

  isAtEnd(): boolean {
    return this.windowEnd >= this.lines.length
  }

  handleScroll(scrollPosition: number): boolean {
    const relativePosition = scrollPosition - this.windowStart
    const windowHeight = this.windowEnd - this.windowStart

    const nearEnd = relativePosition > windowHeight - this.config.bufferThreshold
    const nearStart = relativePosition < this.config.bufferThreshold && this.windowStart > 0

    if (nearEnd && !this.isAtEnd()) {
      return this.shiftWindowDown()
    }

    if (nearStart && !this.isAtStart()) {
      return this.shiftWindowUp()
    }

    return false
  }

  private shiftWindowDown(): boolean {
    const newStart = Math.min(
      this.windowStart + this.config.bufferSize,
      Math.max(0, this.lines.length - this.config.windowSize)
    )
    const newEnd = Math.min(newStart + this.config.windowSize, this.lines.length)

    if (newStart === this.windowStart) return false

    this.windowStart = newStart
    this.windowEnd = newEnd
    return true
  }

  private shiftWindowUp(): boolean {
    const newStart = Math.max(0, this.windowStart - this.config.bufferSize)
    const newEnd = Math.min(newStart + this.config.windowSize, this.lines.length)

    if (newStart === this.windowStart) return false

    this.windowStart = newStart
    this.windowEnd = newEnd
    return true
  }

  toAbsolutePosition(relativePosition: number): number {
    return this.windowStart + relativePosition
  }

  toRelativePosition(absolutePosition: number): number {
    return absolutePosition - this.windowStart
  }

  scrollToAbsolute(absolutePosition: number): { windowChanged: boolean; relativePosition: number } {
    if (absolutePosition < 0) absolutePosition = 0
    if (absolutePosition >= this.lines.length) absolutePosition = this.lines.length - 1

    if (absolutePosition >= this.windowStart && absolutePosition < this.windowEnd) {
      return {
        windowChanged: false,
        relativePosition: absolutePosition - this.windowStart,
      }
    }

    const halfWindow = Math.floor(this.config.windowSize / 2)
    const newStart = Math.max(0, absolutePosition - halfWindow)
    const newEnd = Math.min(newStart + this.config.windowSize, this.lines.length)

    this.windowStart = newStart
    this.windowEnd = newEnd

    return {
      windowChanged: true,
      relativePosition: absolutePosition - this.windowStart,
    }
  }

  reset(): void {
    this.lines = []
    this.windowStart = 0
    this.windowEnd = 0
  }
}
