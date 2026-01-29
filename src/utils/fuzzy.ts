export interface FuzzyMatch {
  item: string
  score: number
}

function fuzzyScore(query: string, target: string): number {
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()

  if (lowerQuery.length === 0) return 0
  if (lowerTarget.length === 0) return -1

  let queryIndex = 0
  let score = 0
  let consecutiveBonus = 0
  let lastMatchIndex = -1

  for (let i = 0; i < lowerTarget.length && queryIndex < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      score += 1

      if (lastMatchIndex === i - 1) {
        consecutiveBonus += 2
      }

      if (i === 0 || lowerTarget[i - 1] === "/" || lowerTarget[i - 1] === "-" || lowerTarget[i - 1] === "_" || lowerTarget[i - 1] === ".") {
        score += 3
      }

      lastMatchIndex = i
      queryIndex++
    }
  }

  if (queryIndex < lowerQuery.length) {
    return -1
  }

  score += consecutiveBonus

  const fileName = target.split("/").pop() || target
  if (fileName.toLowerCase().startsWith(lowerQuery)) {
    score += 10
  }

  score -= target.length * 0.01

  return score
}

export function fuzzyMatch(query: string, items: string[], limit = 50): FuzzyMatch[] {
  if (!query.trim()) {
    return items.slice(0, limit).map(item => ({ item, score: 0 }))
  }

  const results: FuzzyMatch[] = []

  for (const item of items) {
    const score = fuzzyScore(query, item)
    if (score >= 0) {
      results.push({ item, score })
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getKey: (item: T) => string,
  limit = 50
): T[] {
  if (!query.trim()) {
    return items.slice(0, limit)
  }

  const scored: { item: T; score: number }[] = []

  for (const item of items) {
    const key = getKey(item)
    const score = fuzzyScore(query, key)
    if (score >= 0) {
      scored.push({ item, score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item)
}
